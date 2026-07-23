const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const BRAND_TEXT = 'dev:onlyzoro1';
const originalEmbedToJSON = EmbedBuilder.prototype.toJSON;

EmbedBuilder.prototype.toJSON = function toBrandedJSON(...args) {
  const data = originalEmbedToJSON.apply(this, args);
  const footerText = data.footer?.text || '';

  if (!footerText.includes(BRAND_TEXT)) {
    data.footer = { ...data.footer, text: footerText ? `${footerText} • ${BRAND_TEXT}` : BRAND_TEXT };
  }

  return data;
};

function hasAdminAccess(userId, memberOrPermissions) {
  const permissions = memberOrPermissions?.permissions || memberOrPermissions;
  if (permissions?.has?.(PermissionFlagsBits.Administrator)) return true;

  const allowedUsers = new Set(
    (process.env.ADMIN_USER_IDS || '').split(',').map((id) => id.trim()).filter(Boolean)
  );
  const allowedRoles = new Set(
    (process.env.ADMIN_ROLE_IDS || '').split(',').map((id) => id.trim()).filter(Boolean)
  );

  if (allowedUsers.has(userId)) return true;

  const roleIds = memberOrPermissions?.roles?.cache
    ? memberOrPermissions.roles.cache.keys()
    : (Array.isArray(memberOrPermissions?.roles) ? memberOrPermissions.roles : []);

  return [...roleIds].some((roleId) => allowedRoles.has(roleId));
}

// ── Colours ──────────────────────────────────────
const COLOR = {
  PRIMARY:  0x5865f2, // blurple  – info / view
  SUCCESS:  0x57f287, // green    – add / ok
  WARNING:  0xfee75c, // yellow   – edit / help
  DANGER:   0xed4245, // red      – error
  REMOVE:   0xeb459e, // pink     – remove
};

// ── Generic helpers ───────────────────────────────

/** Simple error embed */
function errorEmbed(description) {
  return new EmbedBuilder()
    .setColor(COLOR.DANGER)
    .setTitle('❌ Error')
    .setDescription(description)
    .setTimestamp();
}

/** Simple success embed */
function successEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(COLOR.SUCCESS)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

/** Generic info embed (single description) */
function infoEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(COLOR.PRIMARY)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

// ── Domain embeds ─────────────────────────────────

/** Full stock list embed */
function buildStockEmbed(stock) {
  const embed = new EmbedBuilder()
    .setTitle('📦 Stock List')
    .setColor(COLOR.PRIMARY)
    .setTimestamp()
    .setFooter({ text: `${stock.length} item(s) in stock` });

  if (stock.length === 0) {
    embed.setDescription('The stock is currently empty.');
    return embed;
  }

  stock.forEach((item) => {
    const qty = Array.isArray(item.contents) ? item.contents.length : (item.quantity ?? 0);
    embed.addFields({
      name: `🏷️ ${item.name}`,
      value: [
        `📝 **Description:** ${item.description || 'N/A'}`,
        `💰 **Price:** ${item.price}`,
        `📊 **Stock:** ${qty} available`,
        `🔑 **ID:** \`${item.id}\``,
      ].join('\n'),
      inline: false,
    });
  });

  return embed;
}

/** Full payment methods embed */
function buildPaymentsEmbed(payments) {
  const embed = new EmbedBuilder()
    .setTitle('💳 Payment Methods')
    .setColor(COLOR.PRIMARY)
    .setTimestamp()
    .setFooter({ text: `${payments.length} method(s)` });

  if (payments.length === 0) {
    embed.setDescription('No payment methods added yet.');
    return embed;
  }

  payments.forEach((p) => {
    embed.addFields({
      name: `💳 ${p.name}`,
      value: [`📋 ${p.details || 'No details provided.'}`, `🔑 **ID:** \`${p.id}\``].join('\n'),
      inline: false,
    });
  });

  return embed;
}

/** Item added embed */
function itemAddedEmbed(item) {
  const qty = Array.isArray(item.contents) ? item.contents.length : (item.quantity ?? 0);
  return new EmbedBuilder()
    .setColor(COLOR.SUCCESS)
    .setTitle('✅ Item Added to Stock')
    .addFields(
      { name: '🏷️ Name',        value: item.name,                   inline: true  },
      { name: '💰 Price',       value: item.price,                  inline: true  },
      { name: '📊 Stock',       value: `${qty} entries`,            inline: true  },
      { name: '📝 Description', value: item.description || 'N/A',  inline: false },
      { name: '🔑 ID',          value: `\`${item.id}\``,            inline: false },
    )
    .setTimestamp();
}

/** Item removed embed */
function itemRemovedEmbed(id) {
  return new EmbedBuilder()
    .setColor(COLOR.REMOVE)
    .setTitle('🗑️ Item Removed')
    .setDescription(`Item with ID \`${id}\` has been removed from stock.`)
    .setTimestamp();
}

/** Item edited embed */
function itemEditedEmbed(item) {
  const qty = Array.isArray(item.contents) ? item.contents.length : (item.quantity ?? 0);
  return new EmbedBuilder()
    .setColor(COLOR.WARNING)
    .setTitle('✏️ Item Updated')
    .addFields(
      { name: '🏷️ Name',        value: item.name,                   inline: true  },
      { name: '💰 Price',       value: item.price,                  inline: true  },
      { name: '📊 Stock',       value: `${qty} entries`,            inline: true  },
      { name: '📝 Description', value: item.description || 'N/A',  inline: false },
      { name: '🔑 ID',          value: `\`${item.id}\``,            inline: false },
    )
    .setTimestamp();
}

/** Payment added embed */
function paymentAddedEmbed(payment) {
  return new EmbedBuilder()
    .setColor(COLOR.SUCCESS)
    .setTitle('✅ Payment Method Added')
    .addFields(
      { name: '💳 Name',    value: payment.name,                    inline: true  },
      { name: '🔑 ID',      value: `\`${payment.id}\``,             inline: true  },
      { name: '📋 Details', value: payment.details || 'N/A',        inline: false },
    )
    .setTimestamp();
}

/** Payment removed embed */
function paymentRemovedEmbed(id) {
  return new EmbedBuilder()
    .setColor(COLOR.REMOVE)
    .setTitle('🗑️ Payment Method Removed')
    .setDescription(`Payment method with ID \`${id}\` has been removed.`)
    .setTimestamp();
}

/** Help embed */
function buildHelpEmbed(prefix) {
  return new EmbedBuilder()
    .setTitle('📋 Bot Commands')
    .setColor(COLOR.WARNING)
    .setTimestamp()
    .addFields(
      {
        name: '📦 Stock — View',
        value: `\`${prefix}stock\` / \`/stock\` — View all stock items\n\`${prefix}buy\` / \`/buy\` — Purchase an item`,
      },
      {
        name: '📦 Stock — Admin',
        value: [
          `\`${prefix}additem <name> | <qty> | <price> | [desc]\` / \`/additem\``,
          `\`${prefix}removeitem <id>\` / \`/removeitem\``,
          `\`${prefix}edititem <id> <field> <value>\` / \`/edititem\``,
          `*Fields: name, quantity, price, description*`,
        ].join('\n'),
      },
      {
        name: '💳 Payments — View',
        value: `\`${prefix}payments\` / \`/payments\` — View payment methods`,
      },
      {
        name: '💳 Payments — Admin',
        value: [
          `\`${prefix}addpayment <name> | <details>\` / \`/addpayment\``,
          `\`${prefix}removepayment <id>\` / \`/removepayment\``,
        ].join('\n'),
      },
    );
}

/** Simple ID generator */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Buy-flow embeds ───────────────────────────────

/** Step 1: shown after user picks an item — asks them to pick payment */
function selectPaymentEmbed(item) {
  return new EmbedBuilder()
    .setColor(COLOR.PRIMARY)
    .setTitle('💳 Choose Payment Method')
    .setDescription('Select how you want to pay for this item.')
    .addFields(
      { name: '🏷️ Item',      value: item.name,            inline: true },
      { name: '💰 Price',     value: item.price,           inline: true },
      { name: '📊 Quantity',  value: String(item.quantity), inline: true },
    )
    .setTimestamp();
}

/** Step 2: payment instructions shown after user picks a payment method */
function paymentInstructionsEmbed(item, payment) {
  return new EmbedBuilder()
    .setColor(COLOR.WARNING)
    .setTitle('📤 Send Your Payment')
    .setDescription(
      `Please send **${item.price}** using the instructions below.\n\n` +
      `Once you've sent the payment, click **✅ I've Paid** to notify the seller.`
    )
    .addFields(
      { name: '🏷️ Item',           value: item.name,    inline: true  },
      { name: '💰 Price',          value: item.price,   inline: true  },
      { name: '💳 Payment Method', value: payment.name, inline: false },
      { name: '📋 Instructions',   value: payment.details,            inline: false },
    )
    .setFooter({ text: 'Your order will be delivered after the seller confirms payment.' })
    .setTimestamp();
}

/** Admin notification: new order pending confirmation */
function pendingOrderEmbed(order, item, payment, user) {
  return new EmbedBuilder()
    .setColor(COLOR.WARNING)
    .setTitle('🔔 New Order — Awaiting Confirmation')
    .addFields(
      { name: '👤 Buyer',          value: `${user.tag} (<@${user.id}>)`, inline: false },
      { name: '🏷️ Item',           value: item.name,                     inline: true  },
      { name: '💰 Price',          value: item.price,                    inline: true  },
      { name: '💳 Payment Method', value: payment.name,                  inline: false },
      { name: '📋 Payment Details',value: payment.details,               inline: false },
      { name: '🔑 Order ID',       value: `\`${order.id}\``,             inline: false },
    )
    .setFooter({ text: 'Click ✅ Confirm to deliver the item, or ❌ Reject to cancel.' })
    .setTimestamp();
}

/** Buyer DM: order confirmed + item delivered */
function orderDeliveredEmbed(item, content) {
  return new EmbedBuilder()
    .setColor(COLOR.SUCCESS)
    .setTitle('✅ Order Confirmed — Here\'s Your Item!')
    .setDescription('Your payment was confirmed. Enjoy your purchase! 🎉')
    .addFields(
      { name: '🏷️ Item',    value: item.name,                        inline: true  },
      { name: '💰 Price',   value: item.price,                       inline: true  },
      { name: '📦 Content', value: content || '*(no content set)*',  inline: false },
    )
    .setTimestamp();
}

/** Buyer DM: order rejected */
function orderRejectedEmbed(item, reason) {
  return new EmbedBuilder()
    .setColor(COLOR.DANGER)
    .setTitle('❌ Order Rejected')
    .setDescription('The seller could not confirm your payment.')
    .addFields(
      { name: '🏷️ Item',   value: item.name,               inline: true },
      { name: '💰 Price',  value: item.price,              inline: true },
      { name: '📝 Reason', value: reason || 'Not provided', inline: false },
    )
    .setFooter({ text: 'Please contact the seller if you believe this is a mistake.' })
    .setTimestamp();
}

/** Admin: order confirmed confirmation */
function adminConfirmedEmbed(order, item, user) {
  return new EmbedBuilder()
    .setColor(COLOR.SUCCESS)
    .setTitle('✅ Order Confirmed & Delivered')
    .addFields(
      { name: '👤 Buyer',   value: `${user.tag}`,     inline: true },
      { name: '🏷️ Item',   value: item.name,          inline: true },
      { name: '🔑 Order',  value: `\`${order.id}\``,  inline: false },
    )
    .setTimestamp();
}

/** Admin: order rejected confirmation */
function adminRejectedEmbed(order, item, user) {
  return new EmbedBuilder()
    .setColor(COLOR.REMOVE)
    .setTitle('❌ Order Rejected')
    .addFields(
      { name: '👤 Buyer',   value: `${user.tag}`,     inline: true },
      { name: '🏷️ Item',   value: item.name,          inline: true },
      { name: '🔑 Order',  value: `\`${order.id}\``,  inline: false },
    )
    .setTimestamp();
}

module.exports = {
  COLOR,
  hasAdminAccess,
  errorEmbed,
  successEmbed,
  infoEmbed,
  buildStockEmbed,
  buildPaymentsEmbed,
  itemAddedEmbed,
  itemRemovedEmbed,
  itemEditedEmbed,
  paymentAddedEmbed,
  paymentRemovedEmbed,
  buildHelpEmbed,
  generateId,
  // buy flow
  selectPaymentEmbed,
  paymentInstructionsEmbed,
  pendingOrderEmbed,
  orderDeliveredEmbed,
  orderRejectedEmbed,
  adminConfirmedEmbed,
  adminRejectedEmbed,
};
