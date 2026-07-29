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
    // ProBot sends an embed when a credit transfer succeeds.
    // The embed description contains the sender mention, amount, and receiver mention.
    // Example: "<@buyerId> has transferred 500 credits to <@shopId>"
    //
    // We watch for any message from ProBot in this channel that:
    //   1. Is from the economy bot (ECONOMY_BOT_ID)
    //   2. Mentions the correct amount
    //   3. Mentions the buyer
    //   4. Mentions the shop account

    const amountStr = String(priceNum);

    let confirmed = false;
    try {
      await interaction.channel.awaitMessages({
        filter: (msg) => {
          if (msg.author.id !== ECONOMY_BOT_ID) return false;

          // Check plain content
          const content = msg.content.toLowerCase();

          // Check all embed descriptions and fields
          const embedText = msg.embeds
            .map((e) => [
              e.description || '',
              ...(e.fields || []).map((f) => f.name + ' ' + f.value),
              e.title || '',
            ].join(' '))
            .join(' ')
            .toLowerCase();

          const fullText = content + ' ' + embedText;

          const hasAmount   = fullText.includes(amountStr);
          const hasBuyer    = fullText.includes(interaction.user.id) || fullText.includes(interaction.user.username.toLowerCase());
          const hasShop     = fullText.includes(SHOP_USER_ID);
          const isTransfer  = fullText.includes('transfer') || fullText.includes('sent') || fullText.includes('credits');

          return hasAmount && hasBuyer && hasShop && isTransfer;
        },
        max: 1,
        time: PAYMENT_TIMEOUT,
        errors: ['time'],
      });

      confirmed = true;
    } catch {
      // Timed out — buyer didn't transfer in time
      await instructionsMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.DANGER)
            .setTitle('انتهت مهلة الدفع')
            .setDescription(`<@${interaction.user.id}> لم يكمل الدفع في الوقت المحدد.\nأعد تشغيل \`/buy\` إذا كنت لا تزال ترغب في الشراء.`),
        ],
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
