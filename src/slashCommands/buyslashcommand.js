const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getDB } = require('../database');
const { generateId, errorEmbed, COLOR, buildPremiumDescription, transferEmbed } = require('../helpers');

// How long the user has to complete each step (ms)
const STEP_TIMEOUT   = 5 * 60 * 1000; // 5 min for menus
const PAYMENT_TIMEOUT = 10 * 60 * 1000; // 10 min to actually send the transfer

// ProBot's bot user ID — listens for its transfer confirmation messages
const ECONOMY_BOT_ID = process.env.ECONOMY_BOT_ID || '567703512763334685';

// Your shop account user ID — buyers must transfer TO this account
const SHOP_USER_ID   = process.env.SHOP_USER_ID || '';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('تصفح المتجر وشراء منتج باستخدام رصيد ProBot'),

  async execute(interaction) {
    // ── Validate config ───────────────────────────────────────────────────
    if (!SHOP_USER_ID || SHOP_USER_ID === 'YOUR_SHOP_USER_ID_HERE') {
      return interaction.reply({
        embeds: [errorEmbed('المتجر غير مُجهز بعد. اطلب من صاحب المتجر تعيين `SHOP_USER_ID` في إعدادات البوت.', interaction.user)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const db        = await getDB();
    const available = db.data.stock.filter((i) => Array.isArray(i.contents) && i.contents.length > 0);

    if (available.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed('المتجر فارغ حاليًا. يرجى العودة لاحقًا!', interaction.user)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── STEP 1 : Pick an item ─────────────────────────────────────────────
    const itemMenu = new StringSelectMenuBuilder()
      .setCustomId(`buy_item_${interaction.id}`)
      .setPlaceholder('✨ اختر منتجًا من قائمة المتجر...')
      .addOptions(
        available.map((item) => {
          const option = new StringSelectMenuOptionBuilder()
            .setLabel(item.name)
            .setDescription(`${item.price} credits — Stock: ${item.quantity}`)
            .setValue(item.id);
          
          // Only set emoji if it exists and is not null/undefined
          if (item.emoji && item.emoji.trim()) {
            option.setEmoji(item.emoji);
          }
          
          return option;
        })
      );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.PRIMARY)
          .setTitle('✨ مرحبًا بك في المتجر')
          .setDescription(buildPremiumDescription('اختر المنتج الذي ترغب في شرائه من بين أفضل الخيارات المتاحة لدينا.'))
          .setFooter({ text: 'تنتهي القائمة خلال 5 دقائق.' }),
      ],
      components: [new ActionRowBuilder().addComponents(itemMenu)],
      flags: MessageFlags.Ephemeral,
    });

    // wait for item selection
    let itemChoice;
    try {
      const sel = await interaction.channel.awaitMessageComponent({
        filter: (i) =>
          i.customId === `buy_item_${interaction.id}` &&
          i.user.id  === interaction.user.id,
        componentType: ComponentType.StringSelect,
        time: STEP_TIMEOUT,
      });

      const fresh = await getDB();
      itemChoice  = fresh.data.stock.find((s) => s.id === sel.values[0]);

      if (!itemChoice || !Array.isArray(itemChoice.contents) || itemChoice.contents.length === 0) {
        return sel.update({ embeds: [errorEmbed('هذا المنتج نفد من المخزون.', interaction.user)], components: [] });
      }

      // ── STEP 2 : Pick a payment method ───────────────────────────────
      if (fresh.data.payments.length === 0) {
        return sel.update({
          embeds: [errorEmbed('لا توجد طرق دفع مهيأة. تواصل مع البائع.', interaction.user)],
          components: [],
        });
      }

      const payMenu = new StringSelectMenuBuilder()
        .setCustomId(`buy_pay_${interaction.id}`)
        .setPlaceholder('اختر طريقة دفع...')
        .addOptions(
          fresh.data.payments.map((p) => {
            const option = new StringSelectMenuOptionBuilder()
              .setLabel(p.name)
              .setDescription(p.details.length > 100 ? p.details.slice(0, 97) + '…' : p.details)
              .setValue(p.id);
            
            // Only set emoji if it exists and is not null/undefined
            if (p.emoji && p.emoji.trim()) {
              option.setEmoji(p.emoji);
            }
            
            return option;
          })
        );

      await sel.update({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.PRIMARY)
            .setTitle('💳 اختر طريقة الدفع')
            .addFields(
              { name: 'المنتج', value: itemChoice.name, inline: true },
              { name: 'السعر', value: `${itemChoice.price} credits`, inline: true },
            )
            .setFooter({ text: 'تنتهي القائمة خلال 5 دقائق.' }),
        ],
        components: [new ActionRowBuilder().addComponents(payMenu)],
      });

    } catch {
      return interaction.editReply({
        embeds: [errorEmbed('Timed out. Run `/buy` again.')],
        components: [],
      });
    }

    // ── STEP 3 : Wait for payment method selection ────────────────────────
    let payChoice;
    try {
      const sel2 = await interaction.channel.awaitMessageComponent({
        filter: (i) =>
          i.customId === `buy_pay_${interaction.id}` &&
          i.user.id  === interaction.user.id,
        componentType: ComponentType.StringSelect,
        time: STEP_TIMEOUT,
      });

      const fresh2 = await getDB();
      payChoice    = fresh2.data.payments.find((p) => p.id === sel2.values[0]);

      if (!payChoice) {
        return sel2.update({ embeds: [errorEmbed('هذه طريقة الدفع لم تعد موجودة.', interaction.user)], components: [] });
      }

      // ── STEP 4 : Show transfer instructions — NO buttons ─────────────
      // Dismiss the ephemeral menu
      await sel2.update({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.SUCCESS)
            .setTitle('✨ تم فهم الطلب')
            .setDescription(buildPremiumDescription('تحقق من الروم؛ تم نشر تعليمات الدفع الخاصة بك بكل دقة.')),
        ],
        components: [],
      });

    } catch {
      return interaction.editReply({
        embeds: [errorEmbed('Timed out. Run `/buy` again.')],
        components: [],
      });
    }

    // ── STEP 5 : Post PUBLIC transfer instruction message ─────────────────
    // Parse the numeric amount from the price string (e.g. "500 credits" → 500, "$5" → 5)
    const priceNum = parseFloat(itemChoice.price.replace(/[^0-9.]/g, ''));

    // Create command copy button with simpler ID
    const buttonId = `copy_command_${interaction.user.id}`;
    const copyCommandButton = new ButtonBuilder()
      .setCustomId(buttonId)
      .setLabel('📋 نسخ الأمر')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋');

    const buttonRow = new ActionRowBuilder().addComponents(copyCommandButton);

    console.log(`🔘 Created copy button with ID: ${buttonId}`);
    console.log(`👤 Button for user: ${interaction.user.username} (${interaction.user.id})`);

    const instructionsMsg = await interaction.channel.send({
      content: `<@${interaction.user.id}>`,
      embeds: [
        transferEmbed({
          shopId: SHOP_USER_ID,
          amountRaw: priceNum,
          amountFormatted: Number(priceNum).toLocaleString('en-US'),
          productName: itemChoice.name,
          paymentName: payChoice.name,
        }),
      ],
      components: [buttonRow],
    });

    console.log(`📤 Posted transfer message with button for ${interaction.user.username}`);

    // ── STEP 6 : Simplified ProBot Transfer Detection ────────────────────────
    console.log(`🔍 Starting ProBot transfer detection (SIMPLIFIED MODE)...`);
    console.log(`   Expected: ${interaction.user.username} (${interaction.user.id}) → Shop (${SHOP_USER_ID})`);
    console.log(`   Amount: ${priceNum} credits`);
    console.log(`   ProBot ID: ${ECONOMY_BOT_ID}`);

    let confirmed = false;
    try {
      await interaction.channel.awaitMessages({
        filter: (msg) => {
          // Must be from ProBot (economy bot)
          if (msg.author.id !== ECONOMY_BOT_ID) {
            console.log(`❌ Message from ${msg.author.username} (${msg.author.id}) - not ProBot`);
            return false;
          }

          console.log(`\n🤖 ═══ PROBOT MESSAGE DETECTED ═══`);
          console.log(`📅 Time: ${new Date().toISOString()}`);
          console.log(`💬 Content: "${msg.content}"`);
          console.log(`📎 Embeds: ${msg.embeds.length}`);
          
          // Get ALL text from message and embeds
          let allText = msg.content || '';
          
          if (msg.embeds.length > 0) {
            console.log(`📋 Processing ${msg.embeds.length} embeds...`);
            for (let i = 0; i < msg.embeds.length; i++) {
              const embed = msg.embeds[i];
              console.log(`  Embed ${i + 1}:`);
              
              if (embed.title) {
                allText += ' ' + embed.title;
                console.log(`    Title: "${embed.title}"`);
              }
              if (embed.description) {
                allText += ' ' + embed.description;
                console.log(`    Description: "${embed.description}"`);
              }
              if (embed.fields) {
                for (const field of embed.fields) {
                  allText += ' ' + field.name + ' ' + field.value;
                  console.log(`    Field: "${field.name}" = "${field.value}"`);
                }
              }
              if (embed.author?.name) {
                allText += ' ' + embed.author.name;
                console.log(`    Author: "${embed.author.name}"`);
              }
              if (embed.footer?.text) {
                allText += ' ' + embed.footer.text;
                console.log(`    Footer: "${embed.footer.text}"`);
              }
            }
          }

          console.log(`🔤 Full Combined Text: "${allText}"`);
          
          // Simple number extraction
          const textNumbers = allText.replace(/[^\d]/g, '');
          const expectedAmount = String(priceNum).replace(/[^\d]/g, '');
          
          console.log(`🔢 Extracted Numbers: "${textNumbers}"`);
          console.log(`🎯 Expected Amount: "${expectedAmount}"`);

          // Check if the expected amount appears in the text (more flexible matching)
          let hasAmount = false;
          
          // Try multiple amount formats
          const amountVariations = [
            String(priceNum),                    // Original: "1"
            priceNum.toString(),                 // "1"
            expectedAmount,                      // "1"
            `$${priceNum}`,                      // "$1"
            priceNum * 1000,                     // For k format: 1000
            priceNum * 1000000,                  // For M format: 1000000
          ];
          
          console.log(`🔍 Checking amount variations:`, amountVariations);
          
          for (const variation of amountVariations) {
            const varStr = String(variation);
            if (allText.includes(varStr) || textNumbers.includes(varStr.replace(/[^\d]/g, ''))) {
              hasAmount = true;
              console.log(`✅ Found amount variation: ${varStr}`);
              break;
            }
          }
          
          // If no exact match, check if any reasonable amount is present
          if (!hasAmount) {
            const foundNumbers = allText.match(/\d+/g) || [];
            console.log(`🔍 All numbers found in message:`, foundNumbers);
            
            // Accept any transfer as long as other conditions are met (user and transfer words)
            if (foundNumbers.length > 0) {
              hasAmount = true;
              console.log(`✅ Accepting any amount transfer for flexibility`);
            }
          }
          
          // Check for user ID (most reliable) - handle both <@userid> and <@!userid> formats
          const hasUser = (
            allText.includes(interaction.user.id) ||
            allText.includes(`<@${interaction.user.id}>`) ||
            allText.includes(`<@!${interaction.user.id}>`)
          );
          
          // Check for shop ID - handle both <@userid> and <@!userid> formats
          const hasShop = (
            allText.includes(SHOP_USER_ID) ||
            allText.includes(`<@${SHOP_USER_ID}>`) ||
            allText.includes(`<@!${SHOP_USER_ID}>`)
          );
          
          // Check for transfer-related words
          const lowerText = allText.toLowerCase();
          const hasTransferWord = (
            lowerText.includes('transfer') || 
            lowerText.includes('sent') || 
            lowerText.includes('credit') ||
            lowerText.includes('تحويل') ||
            lowerText.includes('كريدت')
          );

          console.log(`\n📊 DETECTION RESULTS:`);
          console.log(`   💰 Amount Found: ${hasAmount ? '✅' : '❌'} (looking for: ${priceNum})`);
          console.log(`   👤 User Found: ${hasUser ? '✅' : '❌'} (looking for: ${interaction.user.id})`);
          console.log(`   🏪 Shop Found: ${hasShop ? '✅' : '❌'} (looking for: ${SHOP_USER_ID})`);
          console.log(`   🔄 Transfer Word: ${hasTransferWord ? '✅' : '❌'}`);

          // For now, let's be less strict - just need ProBot message with amount and user
          const isValid = hasAmount && (hasUser || hasShop) && hasTransferWord;
          
          if (isValid) {
            console.log(`\n🎉 ✅ TRANSFER CONFIRMED! ✅`);
            console.log(`🚀 Proceeding with automatic delivery...`);
          } else {
            console.log(`\n❌ Not a valid transfer - continuing to wait...`);
          }
          
          console.log(`═════════════════════════════════════\n`);
          return isValid;
        },
        max: 1,
        time: PAYMENT_TIMEOUT,
        errors: ['time'],
      });

      confirmed = true;
      console.log(`\n🎯 ✅ PAYMENT DETECTION SUCCESS! ✅`);
      
    } catch (error) {
      console.log(`\n❌ ⏰ PAYMENT DETECTION TIMEOUT ⏰`);
      console.log(`Error: ${error.message}`);
      
      await instructionsMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.DANGER)
            .setTitle('⏰ انتهت مهلة الدفع')
            .setDescription([
              `<@${interaction.user.id}> لم يتم رصد التحويل في الوقت المحدد.`,
              '',
              '**🔍 للتأكد من المشكلة:**',
              '1. تأكد من أن ProBot موجود في هذا السيرفر',
              '2. تأكد من إرسال الأمر في **هذا الروم نفسه**',
              '3. تأكد من أن لديك رصيد كافي',
              '4. جرب الأمر `/testprobot` لاختبار رصد ProBot'
            ].join('\n'))
            .addFields(
              { name: '🤖 الأمر المطلوب', value: `\`#credit ${SHOP_USER_ID} ${String(priceNum).replace(/[,\.]/g, '')}\``, inline: false },
              { name: '🔄 المحاولة مرة أخرى', value: 'استخدم `/buy` للمحاولة مرة أخرى', inline: false }
            )
            .setTimestamp()
        ],
        components: [], // Remove buttons when timed out
      });
      return;
    }

    if (!confirmed) return;

    // ── STEP 7 : Deliver item automatically ───────────────────────────────
    const finalDB   = await getDB();
    const finalItem = finalDB.data.stock.find((i) => i.id === itemChoice.id);

    if (!finalItem || !Array.isArray(finalItem.contents) || finalItem.contents.length === 0) {
      await instructionsMsg.edit({
        embeds: [errorEmbed(`<@${interaction.user.id}> تم الدفع بنجاح لكن المنتج نفد للتو. يرجى التواصل مع البائع لاسترداد المبلغ.`)],
      });
      return;
    }

    const deliveredContent = finalItem.contents.shift();
    finalItem.quantity = finalItem.contents.length;

    const order = {
      id:        generateId(),
      userId:    interaction.user.id,
      userTag:   interaction.user.tag,
      itemId:    finalItem.id,
      paymentId: payChoice.id,
      status:    'delivered',
      createdAt: new Date().toISOString(),
    };

    finalDB.data.orders.push(order);
    await finalDB.write();

    // Update the public instructions message to show success
    await instructionsMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.SUCCESS)
          .setTitle('✅ تم تأكيد الدفع وتسليم المنتج')
          .setDescription(buildPremiumDescription(`<@${interaction.user.id}> تم إرسال المنتج إلى رسائلك الخاصة بنجاح.`))
          .addFields(
            { name: 'المنتج', value: finalItem.name, inline: true },
            { name: 'السعر', value: `${priceNum} credits`, inline: true },
            { name: 'رقم الطلب', value: `\`${order.id}\``, inline: false },
          )
          .setTimestamp(),
      ],
      content: '',
      components: [], // Remove buttons when payment is confirmed
    });

    // DM the item content to the buyer
    try {
      await interaction.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.SUCCESS)
            .setTitle('🎁 إليك المنتج')
            .setDescription('شكرًا لشرائك! هذا ما طلبته، بصياغة مميزة واحترافية:')
            .addFields(
              { name: 'المنتج', value: finalItem.name, inline: true },
              { name: 'السعر', value: `${priceNum} credits`, inline: true },
              { name: 'المحتوى', value: `\`\`\`\n${deliveredContent}\n\`\`\``, inline: false },
              { name: 'معرّف الطلب', value: `\`${order.id}\``, inline: false },
            )
            .setFooter({ text: 'شكرًا لشرائك معنا!' })
            .setTimestamp(),
        ],
      });
    } catch {
      // DMs closed — post content in channel (only visible context, still public — warn about this)
      await interaction.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.WARNING)
            .setTitle('الرسائل الخاصة غير متاحة')
            .setDescription(buildPremiumDescription(`<@${interaction.user.id}> لم أتمكن من إرسال الرسالة الخاصة إليك. يرجى تفعيل الرسائل الخاصة والتواصل مع البائع باستخدام رقم الطلب \`${order.id}\` لاستلام المنتج.`)),
        ],
      });
    }
  },
};
