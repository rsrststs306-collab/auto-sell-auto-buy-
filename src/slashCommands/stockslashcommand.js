const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { getDB } = require('../database');
const { buildStockEmbed, errorEmbed, COLOR, getStockItemEmoji, generateId, buildPremiumDescription, transferEmbed } = require('../helpers');

const STEP_TIMEOUT = 5 * 60 * 1000;
const PAYMENT_TIMEOUT = 10 * 60 * 1000;
const ECONOMY_BOT_ID = process.env.ECONOMY_BOT_ID || '567703512763334685';
const SHOP_USER_ID = process.env.SHOP_USER_ID || '';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stock')
    .setDescription('View the current stock'),

  async execute(interaction) {
    const db = await getDB();
    const stock = db.data.stock || [];

    if (stock.length === 0) {
      return interaction.reply({ embeds: [errorEmbed('The stock is currently empty.', interaction.user)], flags: MessageFlags.Ephemeral });
    }

    const stockMenu = new StringSelectMenuBuilder()
      .setCustomId(`stock_item_${interaction.id}`)
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

    await interaction.reply({
      embeds: [buildStockEmbed(stock, interaction.user)],
      components: [new ActionRowBuilder().addComponents(stockMenu)],
      flags: MessageFlags.Ephemeral,
    });

    let itemChoice;
    let selectedAction;

    while (true) {
      try {
        const selected = await interaction.channel.awaitMessageComponent({
          filter: (i) =>
            i.customId === `stock_item_${interaction.id}` &&
            i.user.id === interaction.user.id,
          componentType: ComponentType.StringSelect,
          time: STEP_TIMEOUT,
        });

        const fresh = await getDB();
        itemChoice = fresh.data.stock.find((item) => item.id === selected.values[0]);
        if (!itemChoice) {
          return selected.update({ embeds: [errorEmbed('That product could not be found.', interaction.user)], components: [] });
        }

        const qty = Array.isArray(itemChoice.contents) ? itemChoice.contents.length : (itemChoice.quantity ?? 0);
        await selected.update({
          embeds: [
            new EmbedBuilder()
              .setColor(COLOR.PRIMARY)
              .setTitle(`⚡✨ ${itemChoice.emoji || getStockItemEmoji(stock.findIndex((item) => item.id === itemChoice.id))} ${itemChoice.name}`)
              .setDescription(`<:ProBotP:1531454714510704742> السعر: ${itemChoice.price} كريدت\n<:stock:1531454621376057455> المتوفر: ${qty} وحدة`)
              .setFooter({ text: 'Choose Buy or See another item.' })
              .setTimestamp(),
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`stock_buy_${interaction.id}`)
                .setLabel('🛍️ اشتري الآن')
                .setEmoji('⚡')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`stock_back_${interaction.id}`)
                .setLabel('🔄 عرض آخر')
                .setEmoji('✨')
                .setStyle(ButtonStyle.Primary),
            ),
          ],
        });
      } catch {
        return interaction.editReply({ embeds: [errorEmbed('Timed out. Run `/stock` again.', interaction.user)], components: [] });
      }

      try {
        const action = await interaction.channel.awaitMessageComponent({
          filter: (i) =>
            (i.customId === `stock_buy_${interaction.id}` || i.customId === `stock_back_${interaction.id}`) &&
            i.user.id === interaction.user.id,
          componentType: ComponentType.Button,
          time: STEP_TIMEOUT,
        });

        if (action.customId === `stock_back_${interaction.id}`) {
          await action.update({ embeds: [buildStockEmbed(stock, interaction.user)], components: [new ActionRowBuilder().addComponents(stockMenu)] });
          continue;
        }

        selectedAction = action;
        break;
      } catch {
        return interaction.editReply({ embeds: [errorEmbed('Timed out. Run `/stock` again.', interaction.user)], components: [] });
      }
    }

    if (!SHOP_USER_ID) {
      return selectedAction.update({ embeds: [errorEmbed('المتجر غير مُجهز بعد. اطلب من صاحب المتجر تعيين `SHOP_USER_ID`.', interaction.user)], components: [] });
    }

    const payments = db.data.payments || [];
    if (payments.length === 0) {
      return selectedAction.update({ embeds: [errorEmbed('لا توجد طرق دفع مهيأة. تواصل مع البائع.', interaction.user)], components: [] });
    }

    const paymentMenu = new StringSelectMenuBuilder()
      .setCustomId(`stock_pay_${interaction.id}`)
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
          .setTitle('💳 اختر طريقة الدفع')
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
      const paymentSelected = await interaction.channel.awaitMessageComponent({
        filter: (i) =>
          i.customId === `stock_pay_${interaction.id}` &&
          i.user.id === interaction.user.id,
        componentType: ComponentType.StringSelect,
        time: STEP_TIMEOUT,
      });

      payChoice = payments.find((p) => p.id === paymentSelected.values[0]);
      if (!payChoice) {
        return paymentSelected.update({ embeds: [errorEmbed('تعذر العثور على طريقة الدفع هذه.', interaction.user)], components: [] });
      }

      await paymentSelected.update({ embeds: [
        new EmbedBuilder()
          .setColor(COLOR.SUCCESS)
          .setTitle('✅ تم اختيار طريقة الدفع')
          .setDescription(buildPremiumDescription(`لقد اخترت **${payChoice.name}** لـ **${itemChoice.name}**.`))
          .setTimestamp(),
      ], components: [] });
    } catch {
      return interaction.editReply({ embeds: [errorEmbed('Timed out. Run `/stock` again.', interaction.user)], components: [] });
    }

    const priceNum = parseFloat(String(itemChoice.price).replace(/[^0-9.]/g, '')) || 0;
    const instructionsMsg = await interaction.channel.send({
      content: `<@${interaction.user.id}>`,
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

    try {
      await interaction.channel.awaitMessages({
        filter: (msg) => {
          if (msg.author.id !== ECONOMY_BOT_ID) return false;
          const raw = [
            msg.content,
            ...msg.embeds.flatMap((e) => [
              e.title || '',
              e.description || '',
              ...(e.fields || []).map((f) => `${f.name} ${f.value}`),
            ]),
          ].join(' ').toLowerCase();

          const amountStr = String(priceNum);
          const hasAmount = raw.includes(amountStr);
          const hasBuyer = raw.includes(interaction.user.id) || raw.includes(interaction.user.username.toLowerCase());
          const hasShop = raw.includes(SHOP_USER_ID);
          const isTransfer = raw.includes('transfer') || raw.includes('sent') || raw.includes('credits');
          return hasAmount && hasBuyer && hasShop && isTransfer;
        },
        max: 1,
        time: PAYMENT_TIMEOUT,
        errors: ['time'],
      });
    } catch {
      await instructionsMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.DANGER)
            .setTitle('⏰ انتهت مهلة الدفع')
            .setDescription(buildPremiumDescription(`<@${interaction.user.id}> لم يكمل الدفع خلال الوقت المحدد. أعد تشغيل \`/stock\` للمحاولة من جديد.`)),
        ],
      });
      return;
    }

    const finalDB = await getDB();
    const finalItem = finalDB.data.stock.find((i) => i.id === itemChoice.id);
    if (!finalItem || !Array.isArray(finalItem.contents) || finalItem.contents.length === 0) {
      await instructionsMsg.edit({ embeds: [errorEmbed(`<@${interaction.user.id}> تم تأكيد الدفع لكن المنتج نفد للتو. يرجى التواصل مع البائع لاسترداد المبلغ.`, interaction.user)] });
      return;
    }

    const deliveredContent = finalItem.contents.shift();
    finalItem.quantity = finalItem.contents.length;
    finalDB.data.orders.push({
      id: generateId(),
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      itemId: finalItem.id,
      paymentId: payChoice.id,
      status: 'delivered',
      createdAt: new Date().toISOString(),
    });
    await finalDB.write();

    await instructionsMsg.edit({
      content: '',
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.SUCCESS)
          .setTitle('✅ تم تأكيد الدفع وتسليم المنتج')
          .setDescription(buildPremiumDescription(`<@${interaction.user.id}> تم إرسال المنتج إلى رسائلك الخاصة بنجاح.`))
          .addFields(
            { name: '🏷️ Item', value: finalItem.name, inline: true },
            { name: '💰 Price', value: `${priceNum} credits`, inline: true },
            { name: '🔑 Order', value: `\`${finalDB.data.orders.slice(-1)[0].id}\``, inline: false },
          )
          .setTimestamp(),
      ],
    });

    try {
      await interaction.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.SUCCESS)
            .setTitle('🎉 إليك المنتج')
            .setDescription('شكرًا لشرائك! هذا ما طلبته، بصياغة مميزة واحترافية:')
            .addFields(
              { name: '🏷️ Item', value: finalItem.name, inline: true },
              { name: '💰 Price', value: `${priceNum} credits`, inline: true },
              { name: '📦 Your Item / Key / Content', value: `\`\`\`${deliveredContent}\`\`\``, inline: false },
              { name: '🔑 Order ID', value: `\`${finalDB.data.orders.slice(-1)[0].id}\``, inline: false },
            )
            .setFooter({ text: 'Thank you for shopping with us!' })
            .setTimestamp(),
        ],
      });
    } catch {
      await interaction.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.WARNING)
            .setTitle('⚠️ الرسائل الخاصة غير متاحة')
            .setDescription(buildPremiumDescription(`<@${interaction.user.id}> لم أتمكن من إرسال الرسالة الخاصة إليك. يرجى تفعيل الرسائل الخاصة والتواصل مع البائع باستخدام رقم الطلب \`${finalDB.data.orders.slice(-1)[0].id}\` لاستلام المنتج.`)),
        ],
      });
    }
  },
};