const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
} = require('discord.js');
const { getDB } = require('../database');
const { buildStockEmbed, errorEmbed, COLOR, getStockItemEmoji, generateId, buildPremiumDescription, transferEmbed } = require('../helpers');

const STEP_TIMEOUT = 5 * 60 * 1000;
const PAYMENT_TIMEOUT = 10 * 60 * 1000;
const ECONOMY_BOT_ID = process.env.ECONOMY_BOT_ID || '567703512763334685';
const SHOP_USER_ID = process.env.SHOP_USER_ID || '';

module.exports = {
  name: 'stock',
  description: 'View the current stock',

  async execute(message) {
    const db = await getDB();
    const stock = db.data.stock || [];

    if (stock.length === 0) {
      return message.reply({ embeds: [errorEmbed('The stock is currently empty.')] });
    }

    const stockMenu = new StringSelectMenuBuilder()
      .setCustomId(`stock_item_${message.id}`)
      .setPlaceholder('⚡✨🎯 اختر منتجًا لعرض التفاصيل')
      .addOptions(
        stock.slice(0, 25).map((item, index) => {
          const option = new StringSelectMenuOptionBuilder()
            .setLabel(item.name)
            .setDescription(`${item.price} • ${Array.isArray(item.contents) ? item.contents.length : (item.quantity ?? 0)} in stock`)
            .setValue(item.id);
          
          // Only set emoji if it exists and is not null/undefined
          if (item.emoji && item.emoji.trim()) {
            option.setEmoji(item.emoji);
          } else {
            option.setEmoji(getStockItemEmoji(index));
          }
          
          return option;
        })
      );

    const menuMessage = await message.reply({
      embeds: [buildStockEmbed(stock, message.author)],
      components: [new ActionRowBuilder().addComponents(stockMenu)],
    });

    let itemChoice;
    let selectedAction;

    while (true) {
      try {
        const selected = await message.channel.awaitMessageComponent({
          filter: (interaction) =>
            interaction.customId === `stock_item_${message.id}` &&
            interaction.user.id === message.author.id,
          componentType: ComponentType.StringSelect,
          time: STEP_TIMEOUT,
        });

        itemChoice = stock.find((item) => item.id === selected.values[0]);
        if (!itemChoice) {
          return selected.update({ embeds: [errorEmbed('That product could not be found.', message.author)], components: [] });
        }

        const qty = Array.isArray(itemChoice.contents) ? itemChoice.contents.length : (itemChoice.quantity ?? 0);
        await selected.update({
          embeds: [
            new EmbedBuilder()
              .setColor(COLOR.PRIMARY)
              .setTitle(`⚡✨ ${itemChoice.emoji || getStockItemEmoji(stock.findIndex((item) => item.id === itemChoice.id))} ${itemChoice.name}`)
              .setDescription(`<:ProBotP:1531454714510704742> السعر: ${itemChoice.price} كريدت\n<:stock:1531454621376057455> المتوفر: ${qty} وحدة`)
              .setFooter({ text: 'Choose Buy or See another.' })
              .setTimestamp()
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`stock_buy_${message.id}`)
                .setLabel('🛍️ اشتري الآن')
                .setEmoji('⚡')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`stock_back_${message.id}`)
                .setLabel('🔄 عرض آخر')
                .setEmoji('✨')
                .setStyle(ButtonStyle.Primary),
            ),
          ],
        });
      } catch {
        return menuMessage.edit({ embeds: [errorEmbed('Timed out. Run `!stock` again.', message.author)], components: [] });
      }

      try {
        const action = await message.channel.awaitMessageComponent({
          filter: (interaction) =>
            (interaction.customId === `stock_buy_${message.id}` || interaction.customId === `stock_back_${message.id}`) &&
            interaction.user.id === message.author.id,
          componentType: ComponentType.Button,
          time: STEP_TIMEOUT,
        });

        if (action.customId === `stock_back_${message.id}`) {
          await action.update({ embeds: [buildStockEmbed(stock, message.author)], components: [new ActionRowBuilder().addComponents(stockMenu)] });
          continue;
        }

        selectedAction = action;
        break;
      } catch {
        return menuMessage.edit({ embeds: [errorEmbed('Timed out. Run `!stock` again.', message.author)], components: [] });
      }
    }

    if (!SHOP_USER_ID) {
      return selectedAction.update({ embeds: [errorEmbed('المتجر غير مُجهز بعد. اطلب من صاحب المتجر تعيين `SHOP_USER_ID`.', message.author)], components: [] });
    }

    const payments = db.data.payments || [];
    if (payments.length === 0) {
      return selectedAction.update({ embeds: [errorEmbed('لا توجد طرق دفع مهيأة. تواصل مع البائع.', message.author)], components: [] });
    }

    const paymentMenu = new StringSelectMenuBuilder()
      .setCustomId(`stock_pay_${message.id}`)
      .setPlaceholder('💳 اختر طريقة دفع')
      .addOptions(
        payments.map((pay) => {
          const details = String(pay.details || 'No details');
          const option = new StringSelectMenuOptionBuilder()
            .setLabel(pay.name)
            .setDescription(details.length > 100 ? details.slice(0, 97) + '…' : details)
            .setValue(pay.id);
          
          // Only set emoji if it exists and is not null/undefined
          if (pay.emoji && pay.emoji.trim()) {
            option.setEmoji(pay.emoji);
          }
          
          return option;
        })
      );

    await selectedAction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.PRIMARY)
          .setTitle('��💳 اختر طريقة الدفع')
          .setDescription(buildPremiumDescription(`اختر وسيلة الدفع المناسبة لـ **${itemChoice.name}**.`))
          .addFields(
            { name: '🏷️ Item', value: itemChoice.name, inline: true },
            { name: '💰 Price', value: itemChoice.price, inline: true },
          )
          .setFooter({ text: 'اختر طريقة الدفع من القائمة أدناه.' })
          .setTimestamp(),
      ],
      components: [new ActionRowBuilder().addComponents(paymentMenu)],
    });

    let payChoice;
    try {
      const paymentSelected = await message.channel.awaitMessageComponent({
        filter: (interaction) =>
          interaction.customId === `stock_pay_${message.id}` &&
          interaction.user.id === message.author.id,
        componentType: ComponentType.StringSelect,
        time: STEP_TIMEOUT,
      });

      payChoice = payments.find((p) => p.id === paymentSelected.values[0]);
      if (!payChoice) {
        return paymentSelected.update({ embeds: [errorEmbed('تعذر العثور على طريقة الدفع هذه.', message.author)], components: [] });
      }

      await paymentSelected.update({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.SUCCESS)
            .setTitle('✅ Payment Method Selected')
            .setDescription(`You selected **${payChoice.name}** for **${itemChoice.name}**.`)
            .setTimestamp(),
        ],
        components: [],
      });
    } catch {
      return menuMessage.edit({ embeds: [errorEmbed('Timed out. Run `!stock` again.', message.author)], components: [] });
    }

    const priceNum = parseFloat(String(itemChoice.price).replace(/[^0-9.]/g, '')) || 0;
    const instructionsMsg = await message.channel.send({
      content: `<@${message.author.id}>`,
      embeds: [
        transferEmbed({
          shopId: SHOP_USER_ID,
          amountRaw: priceNum,
          amountFormatted: priceNum.toLocaleString('en-US'),
          productName: itemChoice.name,
          paymentName: payChoice.name
        })
      ],
    });

    console.log(`🔍 Starting ProBot transfer detection for ${message.author.username}...`);
    console.log(`⏰ WAITING FOR PAYMENT - PRODUCT NOT DELIVERED YET`);

    try {
      await message.channel.awaitMessages({
        filter: (msg) => {
          if (msg.author.id !== ECONOMY_BOT_ID) return false;
          
          console.log(`\n🤖 ═══ PROBOT MESSAGE DETECTED (PREFIX) ═══`);
          console.log(`📅 Time: ${new Date().toISOString()}`);
          console.log(`💬 Content: "${msg.content}"`);
          console.log(`📎 Embeds: ${msg.embeds.length}`);
          
          const raw = [
            msg.content,
            ...msg.embeds.flatMap((e) => [
              e.title || '',
              e.description || '',
              ...(e.fields || []).map((f) => `${f.name} ${f.value}`),
            ]),
          ].join(' ');
          
          console.log(`🔤 Full Combined Text: "${raw}"`);
          
          const lowerText = raw.toLowerCase();
          const amountStr = String(priceNum);
          
          // Flexible amount checking
          let hasAmount = false;
          const amountVariations = [
            amountStr,
            `$${priceNum}`,
            priceNum * 1000,
            priceNum * 1000000,
          ];
          
          for (const variation of amountVariations) {
            if (raw.includes(String(variation))) {
              hasAmount = true;
              console.log(`✅ Found amount variation: ${variation}`);
              break;
            }
          }
          
          // Don't accept just any amount - be stricter
          
          // Improved user detection (handle mention formats)
          const hasBuyer = (
            raw.includes(message.author.id) || 
            raw.includes(`<@${message.author.id}>`) ||
            raw.includes(`<@!${message.author.id}>`) ||
            lowerText.includes(message.author.username.toLowerCase())
          );
          
          // Improved shop detection (handle mention formats)
          const hasShop = (
            raw.includes(SHOP_USER_ID) ||
            raw.includes(`<@${SHOP_USER_ID}>`) ||
            raw.includes(`<@!${SHOP_USER_ID}>`)
          );
          
          const isTransfer = (
            (lowerText.includes('transfer') && (lowerText.includes('has transferred') || lowerText.includes('تم التحويل'))) ||
            (lowerText.includes('sent') && (lowerText.includes('successfully sent') || lowerText.includes('تم الإرسال'))) ||
            (lowerText.includes('credit') && (lowerText.includes('transferred') || lowerText.includes('received'))) ||
            lowerText.includes('تحويل كريدت') ||
            lowerText.includes('تم التحويل')
          );
          
          // Additional check: must NOT be a confirmation request or fee message
          const isConfirmationRequest = (
            lowerText.includes('type these numbers to confirm') ||
            lowerText.includes('transfer fees') ||
            lowerText.includes('أكتب هذه الأرقام') ||
            lowerText.includes('رسوم التحويل')
          );
          
          console.log(`📊 DETECTION RESULTS:`);
          console.log(`   💰 Amount Found: ${hasAmount ? '✅' : '❌'}`);
          console.log(`   👤 User Found: ${hasBuyer ? '✅' : '❌'}`);
          console.log(`   🏪 Shop Found: ${hasShop ? '✅' : '❌'}`);
          console.log(`   🔄 Transfer Word: ${isTransfer ? '✅' : '❌'}`);
          console.log(`   ❌ Is Confirmation Request: ${isConfirmationRequest ? '❌' : '✅'}`);
          
          // Must have ALL conditions AND NOT be a confirmation request
          const result = hasAmount && hasBuyer && hasShop && isTransfer && !isConfirmationRequest;
          
          if (result) {
            console.log(`\n🎉 ✅ TRANSFER CONFIRMED! ✅`);
          } else {
            console.log(`\n❌ Not a valid transfer - continuing to wait...`);
            console.log(`   Missing: ${!hasAmount ? 'Amount ' : ''}${!hasBuyer ? 'Buyer ' : ''}${!hasShop ? 'Shop ' : ''}${!isTransfer ? 'TransferWord ' : ''}`);
          }
          
          console.log(`═════════════════════════════════════\n`);
          return result;
        },
        max: 1,
        time: PAYMENT_TIMEOUT,
        errors: ['time'],
      });
      
      console.log(`\n🎯 ✅ PAYMENT DETECTION SUCCESS! ✅`);
      console.log(`🚀 NOW PROCEEDING TO DELIVER PRODUCT...`);
      
    } catch {
      await instructionsMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.DANGER)
            .setTitle('⏰ انتهت مهلة الدفع')
            .setDescription(buildPremiumDescription(`<@${message.author.id}> لم يكمل الدفع خلال الوقت المحدد. أعد تشغيل \`!stock\` للمحاولة من جديد.`)),
        ],
      });
      return;
    }

    console.log(`✅ PAYMENT CONFIRMED - STARTING DELIVERY PROCESS...`);

    const finalDB = await getDB();
    const finalItem = finalDB.data.stock.find((i) => i.id === itemChoice.id);
    if (!finalItem || !Array.isArray(finalItem.contents) || finalItem.contents.length === 0) {
      await instructionsMsg.edit({ embeds: [errorEmbed(`<@${message.author.id}> تم تأكيد الدفع لكن المنتج نفد للتو. يرجى التواصل مع البائع لاسترداد المبلغ.`, message.author)] });
      return;
    }

    const deliveredContent = finalItem.contents.shift();
    finalItem.quantity = finalItem.contents.length;
    const order = {
      id: generateId(),
      userId: message.author.id,
      userTag: `${message.author.username}#${message.author.discriminator}`,
      itemId: finalItem.id,
      paymentId: payChoice.id,
      status: 'delivered',
      createdAt: new Date().toISOString(),
    };
    finalDB.data.orders.push(order);
    await finalDB.write();

    await instructionsMsg.edit({
      content: '',
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.SUCCESS)
          .setTitle('✅ تم تأكيد الدفع وتسليم المنتج')
          .setDescription(buildPremiumDescription(`<@${message.author.id}> تم إرسال المنتج إلى رسائلك الخاصة بنجاح.`))
          .addFields(
            { name: '🏷️ Item', value: finalItem.name, inline: true },
            { name: '💰 Price', value: `${priceNum} credits`, inline: true },
            { name: '🔑 Order', value: `\`${order.id}\``, inline: false },
          )
          .setTimestamp(),
      ],
    });

    try {
      await message.author.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.SUCCESS)
            .setTitle('� �🎉 إليك المنتج')
            .setDescription('شكرًا لشرائك! هذا ما طلبته، بصياغة مميزة واحترافية:')
            .addFields(
              { name: '🏷️ Item', value: finalItem.name, inline: true },
              { name: '💰 Price', value: `${priceNum} credits`, inline: true },
              { name: '📦 Your Item / Key / Content', value: `\`\`\`${deliveredContent}\`\`\``, inline: false },
              { name: '🔑 Order ID', value: `\`${order.id}\``, inline: false },
            )
            .setFooter({ text: 'Thank you for shopping with us!' })
            .setTimestamp(),
        ],
      });
    } catch {
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.WARNING)
            .setTitle('⚠️ الرسائل الخاصة غير متاحة')
            .setDescription(buildPremiumDescription(`<@${message.author.id}> لم أتمكن من إرسال الرسالة الخاصة إليك. يرجى تفعيل الرسائل الخاصة والتواصل مع البائع باستخدام رقم الطلب \`${order.id}\` لاستلام المنتج.`)),
        ],
      });
    }
  },
};
