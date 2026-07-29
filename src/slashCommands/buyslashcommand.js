const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { getDB } = require('../database');
const { generateId, errorEmbed, COLOR, buildPremiumDescription, transferEmbed } = require('../helpers');
const { monitorTransfer, testConnection } = require('../probotAPI');

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
        available.map((item) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(item.name)
            .setDescription(`${item.price} credits — Stock: ${item.quantity}`)
            .setValue(item.id)
            .setEmoji(item.emoji || '🛍️')
        )
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
          fresh.data.payments.map((p) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(p.name)
              .setDescription(p.details.length > 100 ? p.details.slice(0, 97) + '…' : p.details)
              .setValue(p.id)
              .setEmoji(p.emoji || '💳')
          )
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
    });

    // ── STEP 6 : Listen for ProBot's confirmation message ─────────────────
    // ProBot sends different formats for credit transfers:
    // Format 1: Embed with description like "User has transferred X credits to ShopUser"
    // Format 2: Plain message with transfer details
    // Format 3: Embed fields with transfer information
    // Format 4: Arabic format messages
    //
    // We need to check multiple possible formats and be flexible with detection

    const amountStr = String(priceNum);
    const buyerMention = `<@${interaction.user.id}>`;
    const shopMention = `<@${SHOP_USER_ID}>`;

    console.log(`🔍 Listening for ProBot transfer confirmation...`);
    console.log(`   - Amount: ${amountStr}`);
    console.log(`   - Buyer: ${interaction.user.id} (${interaction.user.username})`);
    console.log(`   - Shop: ${SHOP_USER_ID}`);

    // ── STEP 6 : Monitor for ProBot transfer using API ─────────────────────
    // Try ProBot API first, fallback to message detection if API is not available
    const probotApiAvailable = await testConnection();
    
    console.log(`🔍 Monitoring for transfer: ${interaction.user.id} → ${SHOP_USER_ID} (${priceNum} credits)`);
    console.log(`📡 ProBot API available: ${probotApiAvailable}`);

    let confirmed = false;
    
    if (probotApiAvailable) {
      // ── Use ProBot API for reliable detection ─────────────────────────
      console.log('🤖 Using ProBot API for transfer detection...');
      
      try {
        await new Promise((resolve, reject) => {
          monitorTransfer(
            interaction.user.id,
            SHOP_USER_ID,
            priceNum,
            PAYMENT_TIMEOUT,
            (transfer, error) => {
              if (error) {
                reject(error);
              } else if (transfer) {
                console.log('🎉 Transfer confirmed via ProBot API:', transfer);
                confirmed = true;
                resolve(transfer);
              }
            }
          );
        });
      } catch (error) {
        console.log('❌ ProBot API monitoring failed:', error.message);
        // Don't return here, fall back to message detection
      }
    }
    
    if (!confirmed && !probotApiAvailable) {
      // ── Fallback to message detection ─────────────────────────────────
      console.log('📨 Falling back to message detection...');
      
      try {
        await interaction.channel.awaitMessages({
          filter: (msg) => {
            // Must be from ProBot
            if (msg.author.id !== ECONOMY_BOT_ID) return false;

            console.log(`📨 ProBot message detected: ${msg.content}`);
            
            // Get all text content from the message
            let fullText = msg.content || '';
            
            // Add embed content
            if (msg.embeds && msg.embeds.length > 0) {
              for (const embed of msg.embeds) {
                if (embed.description) fullText += ' ' + embed.description;
                if (embed.title) fullText += ' ' + embed.title;
                if (embed.fields) {
                  for (const field of embed.fields) {
                    fullText += ' ' + field.name + ' ' + field.value;
                  }
                }
                if (embed.author && embed.author.name) fullText += ' ' + embed.author.name;
                if (embed.footer && embed.footer.text) fullText += ' ' + embed.footer.text;
              }
            }

            console.log(`📄 Full message text: ${fullText}`);

            // Convert to lowercase for case-insensitive matching
            const textLower = fullText.toLowerCase();

            // Check for amount (try different formats)
            const hasAmount = (
              textLower.includes(amountStr) ||
              textLower.includes(Number(priceNum).toLocaleString()) ||
              textLower.includes(Number(priceNum).toLocaleString('ar')) ||
              textLower.includes(priceNum.toString())
            );

            // Check for buyer (multiple ways to identify)
            const hasBuyer = (
              fullText.includes(interaction.user.id) ||
              fullText.includes(buyerMention) ||
              textLower.includes(interaction.user.username.toLowerCase()) ||
              textLower.includes(interaction.user.displayName?.toLowerCase() || '')
            );

            // Check for shop account
            const hasShop = (
              fullText.includes(SHOP_USER_ID) ||
              fullText.includes(shopMention)
            );

            // Check for transfer keywords (multiple languages)
            const isTransfer = (
              textLower.includes('transfer') ||
              textLower.includes('sent') ||
              textLower.includes('credits') ||
              textLower.includes('كريدت') ||
              textLower.includes('حول') ||
              textLower.includes('أرسل') ||
              textLower.includes('نقل') ||
              textLower.includes('تحويل') ||
              textLower.includes('paid') ||
              textLower.includes('payment') ||
              textLower.includes('received')
            );

            console.log(`✅ Detection results:`);
            console.log(`   - Has Amount (${amountStr}): ${hasAmount}`);
            console.log(`   - Has Buyer: ${hasBuyer}`);
            console.log(`   - Has Shop: ${hasShop}`);
            console.log(`   - Is Transfer: ${isTransfer}`);

            const isValid = hasAmount && hasBuyer && hasShop && isTransfer;
            
            if (isValid) {
              console.log(`🎉 VALID TRANSFER DETECTED!`);
            }

            return isValid;
          },
          max: 1,
          time: PAYMENT_TIMEOUT,
          errors: ['time'],
        });

        confirmed = true;
      } catch (error) {
        console.log(`❌ Message detection failed:`, error.message);
      }
    }
    
    if (!confirmed) {
      console.log(`❌ Transfer detection timed out or failed`);
      // Timed out — buyer didn't transfer in time
      await instructionsMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.DANGER)
            .setTitle('انتهت مهلة الدفع')
            .setDescription(`<@${interaction.user.id}> لم يكمل الدفع في الوقت المحدد.\nأعد تشغيل \`/buy\` إذا كنت لا تزال ترغب في الشراء.`)
            .addFields(
              { name: 'نصيحة', value: 'تأكد من إرسال الأمر الصحيح للبروبوت في نفس هذا الروم', inline: false },
              { name: 'طريقة البحث', value: probotApiAvailable ? 'ProBot API' : 'رصد الرسائل', inline: false }
            ),
        ],
        components: [],
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
