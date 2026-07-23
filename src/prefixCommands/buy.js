const { EmbedBuilder } = require('discord.js');
const { getDB } = require('../database');
const { generateId, errorEmbed, COLOR } = require('../helpers');

const STEP_TIMEOUT    = 5  * 60 * 1000; // 5 min to pick item / payment
const PAYMENT_TIMEOUT = 10 * 60 * 1000; // 10 min to complete the transfer

// Read at call-time so dotenv is always loaded first
function getEconomyBotId() { return process.env.ECONOMY_BOT_ID || '567703512763334685'; }
function getShopUserId()    { return process.env.SHOP_USER_ID   || ''; }

// ── Helper: wait for a single number reply from a specific user ──────────
// Returns the zero-based index chosen, or throws on timeout/cancel.
async function awaitNumber(channel, userId, max) {
  const collected = await channel.awaitMessages({
    filter: (m) => {
      if (m.author.id !== userId) return false;
      const n = parseInt(m.content.trim(), 10);
      return !isNaN(n) && n >= 1 && n <= max;
    },
    max: 1,
    time: STEP_TIMEOUT,
    errors: ['time'],
  });
  const msg = collected.first();
  msg.delete().catch(() => {}); // clean up user reply
  return parseInt(msg.content.trim(), 10) - 1; // zero-based
}

module.exports = {
  name: 'buy',
  description: 'Buy an item from the store using ProBot credits',

  async execute(message) {
    const channel      = message.channel;
    const user         = message.author;
    const SHOP_USER_ID = getShopUserId();
    const ECON_BOT_ID  = getEconomyBotId();

    // ── Validate config ───────────────────────────────────────────────────
    if (!SHOP_USER_ID || SHOP_USER_ID === 'YOUR_SHOP_USER_ID_HERE') {
      return message.reply({
        embeds: [errorEmbed('Store not configured yet. Ask the owner to set `SHOP_USER_ID` in `.env`.')],
      });
    }

    const db        = await getDB();
    const available = db.data.stock.filter((i) => Array.isArray(i.contents) && i.contents.length > 0);

    if (available.length === 0) {
      return message.reply({ embeds: [errorEmbed('The store is currently empty. Check back later!')] });
    }
    if (db.data.payments.length === 0) {
      return message.reply({ embeds: [errorEmbed('No payment methods configured. Contact the seller.')] });
    }

    // ── STEP 1 : Show numbered item list ──────────────────────────────────
    await channel.send({
      content: `<@${user.id}>`,
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.PRIMARY)
          .setTitle('🛒 Store — Pick an Item')
          .setDescription(
            available.map((item, i) =>
              `**${i + 1}.** ${item.name} — \`${item.price} credits\` — Stock: ${item.contents.length}` +
              (item.description ? `\n    ↳ *${item.description}*` : '')
            ).join('\n\n')
          )
          .setFooter({ text: `Type a number 1–${available.length} to pick an item • Expires in 5 min` }),
      ],
    });

    let itemChoice;
    try {
      const pick = await awaitNumber(channel, user.id, available.length);
      const fresh = await getDB();
      itemChoice  = fresh.data.stock.find((s) => s.id === available[pick].id);

      if (!itemChoice || !Array.isArray(itemChoice.contents) || itemChoice.contents.length === 0) {
        return channel.send({ embeds: [errorEmbed(`<@${user.id}> That item is out of stock.`)] });
      }
    } catch {
      return channel.send({ embeds: [errorEmbed(`<@${user.id}> Timed out. Run \`!buy\` again.`)] });
    }

    // ── STEP 2 : Show numbered payment method list ────────────────────────
    const fresh2   = await getDB();
    const payments = fresh2.data.payments;

    await channel.send({
      content: `<@${user.id}>`,
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.PRIMARY)
          .setTitle('💳 Choose a Payment Method')
          .setDescription(
            `**Item:** ${itemChoice.name}\n**Price:** ${itemChoice.price} credits\n\n` +
            payments.map((p, i) => `**${i + 1}.** ${p.name}`).join('\n')
          )
          .setFooter({ text: `Type a number 1–${payments.length} to pick a payment method • Expires in 5 min` }),
      ],
    });

    let payChoice;
    try {
      const pick2 = await awaitNumber(channel, user.id, payments.length);
      const fresh3 = await getDB();
      payChoice    = fresh3.data.payments.find((p) => p.id === payments[pick2].id);

      if (!payChoice) {
        return channel.send({ embeds: [errorEmbed(`<@${user.id}> That payment method no longer exists.`)] });
      }
    } catch {
      return channel.send({ embeds: [errorEmbed(`<@${user.id}> Timed out. Run \`!buy\` again.`)] });
    }

    // ── STEP 3 : Post public transfer instructions ────────────────────────
    const priceNum = parseFloat(String(itemChoice.price).replace(/[^0-9.]/g, '')) || 0;

    const instructionsMsg = await channel.send({
      content: `<@${user.id}>`,
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.WARNING)
          .setTitle('📤 Complete Your Payment')
          .setDescription(
            `<@${user.id}>, send **${priceNum} credits** to <@${SHOP_USER_ID}>.\n` +
            `Your item is delivered **automatically** the moment ProBot confirms the transfer.`
          )
          .addFields(
            { name: '⌨️ Command to Run', value: `\`\`\`\n/credits <@${SHOP_USER_ID}> ${priceNum}\n\`\`\``, inline: false },
            { name: '🏷️ Item',           value: itemChoice.name,           inline: true  },
            { name: '💰 Amount',         value: `${priceNum} credits`,     inline: true  },
            { name: '💳 Payment',        value: payChoice.name,            inline: false },
            { name: '📋 Details',        value: payChoice.details,         inline: false },
          )
          .setFooter({ text: 'You have 10 minutes to complete the transfer.' })
          .setTimestamp(),
      ],
    });

    // ── STEP 4 : Listen for ProBot's transfer confirmation ────────────────
    const amountStr = String(priceNum);

    try {
      await channel.awaitMessages({
        filter: (msg) => {
          // Must be from the economy bot
          if (msg.author.id !== ECON_BOT_ID) return false;

          // Gather all text from the message (content + every embed field/description/title)
          const raw = [
            msg.content,
            ...msg.embeds.flatMap((e) => [
              e.title       || '',
              e.description || '',
              ...(e.fields  || []).map((f) => `${f.name} ${f.value}`),
            ]),
          ].join(' ').toLowerCase();

          const hasAmount  = raw.includes(amountStr);
          const hasBuyer   = raw.includes(user.id) || raw.includes(user.username.toLowerCase());
          const hasShop    = raw.includes(SHOP_USER_ID);
          const isTransfer = raw.includes('transfer') || raw.includes('sent') || raw.includes('credit');

          return hasAmount && hasBuyer && hasShop && isTransfer;
        },
        max: 1,
        time: PAYMENT_TIMEOUT,
        errors: ['time'],
      });
    } catch {
      // Timed out
      await instructionsMsg.edit({
        content: '',
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.DANGER)
            .setTitle('⏰ Payment Timed Out')
            .setDescription(`<@${user.id}> didn't complete the transfer in time. Run \`!buy\` again to retry.`),
        ],
      });
      return;
    }

    // ── STEP 5 : Deliver item automatically ───────────────────────────────
    const finalDB   = await getDB();
    const finalItem = finalDB.data.stock.find((i) => i.id === itemChoice.id);

    if (!finalItem || !Array.isArray(finalItem.contents) || finalItem.contents.length === 0) {
      await instructionsMsg.edit({
        content: '',
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.DANGER)
            .setTitle('❌ Out of Stock')
            .setDescription(`<@${user.id}> payment confirmed but the item just sold out. Contact the seller for a refund.`),
        ],
      });
      return;
    }

    // Pop the first content entry — this is what gets delivered
    const deliveredContent = finalItem.contents.shift();
    finalItem.quantity     = finalItem.contents.length;

    const order = {
      id:               generateId(),
      userId:           user.id,
      userTag:          `${user.username}#${user.discriminator}`,
      itemId:           finalItem.id,
      paymentId:        payChoice.id,
      status:           'delivered',
      createdAt:        new Date().toISOString(),
    };

    finalDB.data.orders.push(order);
    await finalDB.write();

    // Update public message
    await instructionsMsg.edit({
      content: '',
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.SUCCESS)
          .setTitle('✅ Payment Confirmed — Item Delivered!')
          .setDescription(`<@${user.id}> your item has been sent to your DMs! 🎉`)
          .addFields(
            { name: '🏷️ Item',       value: finalItem.name,              inline: true  },
            { name: '💰 Price',      value: `${priceNum} credits`,        inline: true  },
            { name: '📊 Remaining',  value: `${finalItem.contents.length} in stock`, inline: true },
            { name: '🔑 Order',      value: `\`${order.id}\``,            inline: false },
          )
          .setTimestamp(),
      ],
    });

    // DM the buyer their item content
    try {
      await user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.SUCCESS)
            .setTitle("🎉 Here's Your Item!")
            .setDescription('Thank you for your purchase! Your item details are below.')
            .addFields(
              { name: '🏷️ Item',    value: finalItem.name,       inline: true  },
              { name: '💰 Price',   value: `${priceNum} credits`, inline: true  },
              { name: '📦 Content', value: `\`\`\`\n${deliveredContent}\n\`\`\``, inline: false },
              { name: '🔑 Order ID', value: `\`${order.id}\``,    inline: false },
            )
            .setFooter({ text: 'Keep this DM safe — this is your item.' })
            .setTimestamp(),
        ],
      });
    } catch {
      await channel.send({
        content: `<@${user.id}> ⚠️ I couldn't DM you — enable DMs and contact the seller with order ID \`${order.id}\`.`,
      });
    }
  },
};
