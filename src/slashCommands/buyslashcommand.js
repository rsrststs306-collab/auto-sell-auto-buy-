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
const { generateId, errorEmbed, COLOR } = require('../helpers');

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
    .setDescription('Browse the store and buy an item using ProBot credits'),

  async execute(interaction) {
    // ── Validate config ───────────────────────────────────────────────────
    if (!SHOP_USER_ID || SHOP_USER_ID === 'YOUR_SHOP_USER_ID_HERE') {
      return interaction.reply({
        embeds: [errorEmbed('The store is not configured yet. Ask the owner to set `SHOP_USER_ID` in the bot config.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    const db        = await getDB();
    const available = db.data.stock.filter((i) => Array.isArray(i.contents) && i.contents.length > 0);

    if (available.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed('The store is currently empty. Check back later!')],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── STEP 1 : Pick an item ─────────────────────────────────────────────
    const itemMenu = new StringSelectMenuBuilder()
      .setCustomId(`buy_item_${interaction.id}`)
      .setPlaceholder('🛒 Choose an item...')
      .addOptions(
        available.map((item) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(item.name)
            .setDescription(`${item.price} credits — Stock: ${item.quantity}`)
            .setValue(item.id)
        )
      );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.PRIMARY)
          .setTitle('🛒 Welcome to the Store')
          .setDescription('Select the item you want to buy.')
          .setFooter({ text: 'Menu expires in 5 minutes.' }),
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
        return sel.update({ embeds: [errorEmbed('That item is out of stock.')], components: [] });
      }

      // ── STEP 2 : Pick a payment method ───────────────────────────────
      if (fresh.data.payments.length === 0) {
        return sel.update({
          embeds: [errorEmbed('No payment methods configured. Contact the seller.')],
          components: [],
        });
      }

      const payMenu = new StringSelectMenuBuilder()
        .setCustomId(`buy_pay_${interaction.id}`)
        .setPlaceholder('💳 Choose a payment method...')
        .addOptions(
          fresh.data.payments.map((p) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(p.name)
              .setDescription(p.details.length > 100 ? p.details.slice(0, 97) + '…' : p.details)
              .setValue(p.id)
          )
        );

      await sel.update({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.PRIMARY)
            .setTitle('💳 Choose Payment Method')
            .addFields(
              { name: '🏷️ Item',  value: itemChoice.name,  inline: true },
              { name: '💰 Price', value: `${itemChoice.price} credits`, inline: true },
            )
            .setFooter({ text: 'Menu expires in 5 minutes.' }),
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
        return sel2.update({ embeds: [errorEmbed('That payment method no longer exists.')], components: [] });
      }

      // ── STEP 4 : Show transfer instructions — NO buttons ─────────────
      // Dismiss the ephemeral menu
      await sel2.update({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.SUCCESS)
            .setTitle('✅ Got it!')
            .setDescription('Check the channel — your payment instructions have been posted.'),
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
        new EmbedBuilder()
          .setColor(COLOR.WARNING)
          .setTitle('📤 Complete Your Payment')
          .setDescription(
            `<@${interaction.user.id}>, to receive your item please transfer **${priceNum} credits** to <@${SHOP_USER_ID}> using the command below:`
          )
          .addFields(
            {
              name: '⌨️ Run This Command',
              value: `\`\`\`/credits <@${SHOP_USER_ID}> ${priceNum}\`\`\``,
              inline: false,
            },
            { name: '🏷️ Item',            value: itemChoice.name,              inline: true  },
            { name: '💰 Amount',          value: `${priceNum} credits`,        inline: true  },
            { name: '💳 Payment Method',  value: payChoice.name,               inline: false },
            { name: '📋 Details',         value: payChoice.details,            inline: false },
          )
          .setFooter({ text: 'Your item will be delivered automatically once the transfer is confirmed. You have 10 minutes.' })
          .setTimestamp(),
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
            .setTitle('⏰ Payment Timed Out')
            .setDescription(`<@${interaction.user.id}> did not complete the payment in time.\nRun \`/buy\` again if you still want to purchase.`),
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
        embeds: [errorEmbed(`<@${interaction.user.id}> Your payment went through but the item just sold out. Please contact the seller for a refund.`)],
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
          .setTitle('✅ Payment Confirmed — Item Delivered!')
          .setDescription(`<@${interaction.user.id}> your item has been sent to your DMs! 🎉`)
          .addFields(
            { name: '🏷️ Item',   value: finalItem.name,      inline: true  },
            { name: '💰 Price',  value: `${priceNum} credits`, inline: true  },
            { name: '🔑 Order',  value: `\`${order.id}\``,    inline: false },
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
            .setTitle("🎉 Here's Your Item!")
            .setDescription('Thank you for your purchase! Here is what you ordered:')
            .addFields(
              { name: '🏷️ Item',                     value: finalItem.name,                           inline: true  },
              { name: '💰 Price',                    value: `${priceNum} credits`,                    inline: true  },
              { name: '📦 Your Item / Key / Content', value: `\`\`\`\n${deliveredContent}\n\`\`\``, inline: false },
              { name: '🔑 Order ID',                 value: `\`${order.id}\``,                         inline: false },
            )
            .setFooter({ text: 'Thank you for shopping with us!' })
            .setTimestamp(),
        ],
      });
    } catch {
      // DMs closed — post content in channel (only visible context, still public — warn about this)
      await interaction.channel.send({
        content: `<@${interaction.user.id}> ⚠️ I couldn't DM you. Please enable DMs. Contact the seller with order ID \`${order.id}\` to receive your item.`,
      });
    }
  },
};
