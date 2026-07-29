const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

// Branding constants
const BRAND_TEXT = 'mxd market';
const BRAND_THEME_PREFIX = process.env.BRAND_THEME_PREFIX || ' dev:onlyZoro1';

const originalEmbedToJSON = EmbedBuilder.prototype.toJSON;

function normalizeEnvKey(value) {
  if (!value) return '';
  return String(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getEmbedImageUrl(key, title) {
  const envCandidates = [];
  if (key) envCandidates.push(normalizeEnvKey(key));
  if (title) envCandidates.push(normalizeEnvKey(title));
  envCandidates.push('DEFAULT');

  for (const candidate of envCandidates) {
    const url = process.env[`EMBED_IMAGE_${candidate}`];
    if (isValidImageUrl(url)) return url.trim();
  }
  return '';
}

EmbedBuilder.prototype.setEmbedImageKey = function setEmbedImageKey(key) {
  this._embedImageKey = key;
  return this;
};

EmbedBuilder.prototype.toJSON = function toBrandedJSON(...args) {
  const data = originalEmbedToJSON.apply(this, args);
  const footerText = data.footer?.text || '';

  if (!footerText.includes(BRAND_TEXT)) {
    data.footer = {
      ...data.footer,
      text: footerText ? `${footerText} • ${BRAND_THEME_PREFIX} • ${BRAND_TEXT}` : `${BRAND_THEME_PREFIX} • ${BRAND_TEXT}`,
    };
  }

  if (!data.author?.name) {
    data.author = { name: BRAND_TEXT };
  }

  const imageUrl = getEmbedImageUrl(this._embedImageKey, data.title);
  if (imageUrl && !data.image?.url) {
    data.image = { url: imageUrl };
  }

  return data;
};

// ── Colours ──────────────────────────────────────
const COLOR = {
  PRIMARY:  0x6c63ff,
  SUCCESS:  0x2ecc71,
  WARNING:  0xffc857,
  DANGER:   0xff4d6d,
  REMOVE:   0xff6b9a,
  PREMIUM:  0x7b61ff,
};

const STOCK_ITEM_EMOJIS = [
  '✨', '🚀', '💎', '⚡', '🪄', '🌟', '🎯', '💫', '🔮', '🛍️',
  '🎁', '🎮', '🧩', '💠', '🏆', '🌈', '🧿', '🔥', '🪐', '📦',
];

function getStockItemEmoji(index) {
  return STOCK_ITEM_EMOJIS[index] || '🛒';
}

function buildPremiumDescription(text) {
  return `✨ ${text}\n\n💫━━━━━━━━━━━━━━━💫\n\n🌟 تجربة فاخرة ومميزة`;
}

function applyBrandTheme(embed, user = null) {
  const footerText = embed.data?.footer?.text || '';
  const userText = user ? `Requested by ${user.username}` : '';
  
  // Set author to show the user who made the command
  const brandedEmbed = user 
    ? embed.setAuthor({ name: `${user.username}`, iconURL: user.displayAvatarURL() })
    : embed.setAuthor({ name: BRAND_TEXT });

  if (footerText) {
    const fullFooter = userText 
      ? `${footerText} • ${userText} • ${BRAND_THEME_PREFIX} • ${BRAND_TEXT}`
      : `${footerText} • ${BRAND_THEME_PREFIX} • ${BRAND_TEXT}`;
    
    return brandedEmbed.setFooter({
      text: footerText.includes(BRAND_TEXT) ? footerText : fullFooter,
    });
  }

  const baseFooter = userText 
    ? `${userText} • ${BRAND_THEME_PREFIX} • ${BRAND_TEXT}`
    : `${BRAND_THEME_PREFIX} • ${BRAND_TEXT}`;

  return brandedEmbed.setFooter({ text: baseFooter });
}

function applyEmbedImage(embed, key, user = null) {
  const brandedEmbed = applyBrandTheme(embed, user);
  const url = getEmbedImageUrl(key);
  return url ? brandedEmbed.setImage(url) : brandedEmbed;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Embed builders (moved here so all embeds live in one file) ──────

/**
 * Error embed
 * Purpose: display a standardized error message to users when an operation fails.
 * Usage: pass a short error description; shown in channels or replies.
 */
function errorEmbed(description, user = null) {
  return applyEmbedImage(
    new EmbedBuilder()
      .setColor(COLOR.DANGER)
      .setTitle('❌ خطأ')
      .setDescription(buildPremiumDescription(description))
      .setFooter({ text: 'يرجى المحاولة مرة أخرى أو التواصل مع الدعم في حال استمرار المشكلة.' })
      .setTimestamp(),
    'ERROR',
    user
  );
}

/**
 * Success embed
 * Purpose: show a success confirmation with an optional title and description.
 * Usage: acknowledge completed actions (e.g., item added, order delivered).
 */
function successEmbed(title, description, user = null) {
  return applyEmbedImage(
    new EmbedBuilder()
      .setColor(COLOR.SUCCESS)
      .setTitle(title)
      .setDescription(buildPremiumDescription(description))
      .setTimestamp(),
    'SUCCESS',
    user
  );
}

/**
 * Info embed
 * Purpose: general informational messages that are not errors or successes.
 * Usage: short notices, tips, or status messages for users.
 */
function infoEmbed(title, description, user = null) {
  return applyEmbedImage(
    new EmbedBuilder()
      .setColor(COLOR.PRIMARY)
      .setTitle(title)
      .setDescription(buildPremiumDescription(description))
      .setTimestamp(),
    'INFO',
    user
  );
}

/**
 * Stock list embed
 * Purpose: present the full list of store items and basic details.
 * Usage: used by the `stock` command to show available products.
 */
function buildStockEmbed(stock, user = null) {
  const embed = new EmbedBuilder()
    .setTitle('🛒 قائمة المنتجات والمتوفر')
    .setColor(COLOR.PREMIUM)
    .setDescription('أهلاً بك في متجر mxd market !\nالرجاء اختيار المنتج الذي ترغب في شرائه من القائمة أدناه لعرض كافة التفاصيل والسعر.')
    .setTimestamp()
    .setFooter({ text: `${stock.length} عنصر متاح حاليًا` });

  if (stock.length === 0) {
    embed.setDescription('المخزون فارغ حاليًا.');
  }

  return applyEmbedImage(embed, 'STOCK', user);
}

/**
 * Payments list embed
 * Purpose: display configured payment methods and their details.
 * Usage: used by the `payments` command or admin views.
 */
function buildPaymentsEmbed(payments, user = null) {
  const embed = new EmbedBuilder()
    .setTitle('💳 طرق الدفع')
    .setColor(COLOR.PREMIUM)
    .setDescription('هذه هي وسائل الدفع المتاحة حاليًا، اختر ما يناسبك بسهولة.')
    .setTimestamp()
    .setFooter({ text: `${payments.length} طريقة متاحة` });

  if (payments.length === 0) {
    embed.setDescription('لا توجد طرق دفع مضافة بعد.');
    return applyEmbedImage(embed, 'PAYMENTS', user);
  }

  payments.forEach((p) => {
    embed.addFields({ name: `💳 ${p.name}`, value: [`التفاصيل: ${p.details || 'غير متوفر'}`, `المعرف: \`${p.id}\``].join('\n'), inline: false });
  });

  return applyEmbedImage(embed, 'PAYMENTS', user);
}

/**
 * Item added embed
 * Purpose: notify admins that an item was successfully added to stock.
 * Usage: returned after `additem` command completes.
 */
function itemAddedEmbed(item, user = null) {
  const qty = Array.isArray(item.contents) ? item.contents.length : (item.quantity ?? 0);
  const embed = new EmbedBuilder()
    .setColor(COLOR.SUCCESS)
    .setTitle('✨ تمت إضافة المنتج بنجاح')
    .setDescription('أصبح هذا المنتج الآن جاهزًا للعرض والشراء.')
    .addFields(
      { name: 'الاسم', value: item.name, inline: true },
      { name: 'السعر', value: item.price, inline: true },
      { name: 'المخزون', value: `${qty} عنصرًا`, inline: true },
      { name: 'الوصف', value: item.description || 'غير متوفر', inline: false },
      { name: 'المعرف', value: `\`${item.id}\``, inline: false },
    )
    .setTimestamp();

  return applyEmbedImage(embed, 'ITEM_ADDED', user);
}

/**
 * Item removed embed
 * Purpose: confirm removal of an item from the store.
 * Usage: shown after `removeitem` is executed.
 */
function itemRemovedEmbed(id, user = null) {
  return applyEmbedImage(
    new EmbedBuilder()
      .setColor(COLOR.REMOVE)
      .setTitle('تم حذف المنتج')
      .setDescription(`تم حذف المنتج ذو المعرف \`${id}\` من المخزون.`)
      .setTimestamp(),
    'ITEM_REMOVED',
    user
  );
}

/**
 * Item edited embed
 * Purpose: summarize changes made to an existing item.
 * Usage: shown after `edititem` is executed.
 */
function itemEditedEmbed(item, user = null) {
  const qty = Array.isArray(item.contents) ? item.contents.length : (item.quantity ?? 0);
  const embed = new EmbedBuilder()
    .setColor(COLOR.WARNING)
    .setTitle('تم تحديث المنتج')
    .setDescription('تم تحديث تفاصيل المنتج بنجاح.')
    .addFields(
      { name: 'الاسم', value: item.name, inline: true },
      { name: 'السعر', value: item.price, inline: true },
      { name: 'المخزون', value: `${qty} عنصرًا`, inline: true },
      { name: 'الوصف', value: item.description || 'غير متوفر', inline: false },
      { name: 'المعرف', value: `\`${item.id}\``, inline: false },
    )
    .setTimestamp();

  return applyEmbedImage(embed, 'ITEM_EDITED', user);
}

/**
 * Payment added embed
 * Purpose: confirm a new payment method was added.
 * Usage: used after `addpayment` succeeds.
 */
function paymentAddedEmbed(payment, user = null) {
  return applyEmbedImage(
    new EmbedBuilder()
      .setColor(COLOR.SUCCESS)
      .setTitle('💳 تمت إضافة طريقة الدفع')
      .setDescription('أصبحت هذه الوسيلة متاحة للعملاء الآن.')
      .addFields(
        { name: 'الاسم', value: payment.name, inline: true },
        { name: 'المعرف', value: `\`${payment.id}\``, inline: true },
        { name: 'التفاصيل', value: payment.details || 'غير متوفر', inline: false },
      )
      .setTimestamp(),
    'PAYMENT_ADDED',
    user
  );
}

/**
 * Payment removed embed
 * Purpose: confirm removal of a payment method.
 * Usage: shown after `removepayment` is executed.
 */
function paymentRemovedEmbed(id, user = null) {
  return applyEmbedImage(
    new EmbedBuilder()
      .setColor(COLOR.REMOVE)
      .setTitle('تم حذف طريقة الدفع')
      .setDescription(`تم حذف طريقة الدفع ذات المعرف \`${id}\`.`)
      .setTimestamp(),
    'PAYMENT_REMOVED',
    user
  );
}

/**
 * Help embed
 * Purpose: list available commands and usage examples.
 * Usage: shown by the `help` command.
 */
function buildHelpEmbed(prefix, user = null) {
  const embed = new EmbedBuilder()
    .setTitle('📜 الأوامر المتاحة')
    .setColor(COLOR.WARNING)
    .setDescription('إليك دليلًا سريعًا ومميزًا لما يمكن لهذا البوت فعله.')
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
      {
        name: '🛡️ Moderation',
        value: [
          `\`${prefix}say <message>\` / \`/say\` — Make the bot send a message`,
          `\`${prefix}kick <@user> [reason]\` / \`/kick\` — Kick a user`,
          `\`${prefix}ban <@user> [days] [reason]\` / \`/ban\` — Ban a user`,
          `\`${prefix}clear <amount>\` / \`/clear\` — Delete recent messages`,
        ].join('\n'),
      },
    );

  return applyEmbedImage(embed, 'HELP', user);
}

// Buy-flow embed: centralized transfer embed
/**
 * Transfer instruction embed
 * Purpose: instruct the buyer how to transfer credits to the shop.
 * Usage: posted publicly when a purchase is initiated; contains the copy-paste command and required amount.
 */
function transferEmbed({ shopId, amountRaw, amountFormatted, productName, paymentName }) {
  // Use the user's requested static format but allow replacing values if provided
  const codeAmount = amountRaw ? String(amountRaw).replace(/[,\.]/g, '') : '3157895';
  const codeShopId = shopId || '1113796546010558474';
  const formatted = amountFormatted || (amountRaw ? Number(amountRaw).toLocaleString('en-US') : '3,157,895');

  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`<a:Loading:1531454495790207266> إتمام الشراء — ${productName || 'المنتج'}`)
    .setDescription([
      '⏳ انسخ الأمر التالي وأرسله:',
      '```',
      `#credit ${codeShopId} ${codeAmount}`,
      '```',
      `💰 المطلوب: ${formatted} <:credits:1531454322028576778>`,
    ].join('\n'))
    .setTimestamp();
}

/**
 * Select payment embed
 * Purpose: prompt the buyer to choose a payment method for the selected item.
 * Usage: shown during the buy flow before posting transfer instructions.
 */
function selectPaymentEmbed(item, user = null) {
  return applyEmbedImage(
    new EmbedBuilder()
      .setColor(COLOR.PRIMARY)
      .setTitle('💎 اختر طريقة الدفع')
      .setDescription('اختر الوسيلة الأنسب لك لإكمال عملية الشراء بكل سهولة.')
      .addFields(
        { name: '🏷️ Item',      value: item.name,            inline: true },
        { name: '💰 Price',     value: item.price,           inline: true },
        { name: '📊 Quantity',  value: String(item.quantity), inline: true },
      )
      .setTimestamp(),
    'PAYMENT_CHOICE',
    user
  );
}

/**
 * Payment instructions embed
 * Purpose: provide detailed instructions and the payment method details before transfer.
 * Usage: used in the buy flow as an informational embed.
 */
function paymentInstructionsEmbed(item, payment, user = null) {
  return applyEmbedImage(
    new EmbedBuilder()
      .setColor(COLOR.WARNING)
      .setTitle('⚡ أرسل الدفع')
      .setDescription(
        `يرجى إرسال **${item.price}** باستخدام التعليمات أدناه.\n\n` +
        `بعد إكمال الدفع، اضغط على **أدفع الآن** لإعلام البائع فورًا.`
      )
      .addFields(
        { name: '🏷️ Item',           value: item.name,    inline: true  },
        { name: '💰 Price',          value: item.price,   inline: true  },
        { name: '💳 Payment Method', value: payment.name, inline: false },
        { name: '📋 Instructions',   value: payment.details,            inline: false },
      )
      .setFooter({ text: 'Your order will be delivered after the seller confirms payment.' })
      .setTimestamp(),
    'PAYMENT_INSTRUCTIONS',
    user
  );
}

/**
 * Pending order embed
 * Purpose: notify admins that a new order requires confirmation/delivery.
 * Usage: sent to admin channels when an order awaits review.
 */
function pendingOrderEmbed(order, item, payment, user) {
  return applyEmbedImage(
    new EmbedBuilder()
      .setColor(COLOR.WARNING)
      .setTitle('🛎️ طلب جديد - في انتظار التأكيد')
      .setDescription('وصل طلب شراء جديد ويحتاج إلى مراجعة سريعة من قبلك.')
      .addFields(
        { name: '👤 Buyer',          value: `${user.tag} (<@${user.id}>)`, inline: false },
        { name: '🏷️ Item',           value: item.name,                     inline: true  },
        { name: '💰 Price',          value: item.price,                    inline: true  },
        { name: '💳 Payment Method', value: payment.name,                  inline: false },
        { name: '📋 Payment Details',value: payment.details,               inline: false },
        { name: '🔑 Order ID',       value: `\`${order.id}\``,             inline: false },
      )
      .setFooter({ text: 'Click ✅ Confirm to deliver the item, or ❌ Reject to cancel.' })
      .setTimestamp(),
    'ORDER_PENDING',
    user
  );
}

/**
 * Order delivered embed
 * Purpose: inform the buyer that their order was confirmed and delivered.
 * Usage: DM'd to the buyer after automatic delivery.
 */
function orderDeliveredEmbed(item, content, user = null) {
  return applyEmbedImage(
    new EmbedBuilder()
      .setColor(COLOR.SUCCESS)
      .setTitle('تم تأكيد الطلب وتسليمه')
      .setDescription('تم تأكيد الدفع بنجاح. استمتع بالشراء ونتمنى لك تجربة ممتازة.')
      .addFields(
        { name: '🏷️ Item',    value: item.name,                        inline: true  },
        { name: '💰 Price',   value: item.price,                       inline: true  },
        { name: '📦 Content', value: content || '*(no content set)*',  inline: false },
      )
      .setTimestamp(),
    'ORDER_DELIVERED',
    user
  );
}

/**
 * Order rejected embed
 * Purpose: inform buyer that the order was rejected and show reason.
 * Usage: used when a seller/admin declines an order.
 */
function orderRejectedEmbed(item, reason, user = null) {
  return applyEmbedImage(
    new EmbedBuilder()
      .setColor(COLOR.DANGER)
      .setTitle('تم رفض الطلب')
      .setDescription('تعذر على البائع تأكيد الدفع في هذا الوقت.')
      .addFields(
        { name: '🏷️ Item',   value: item.name,               inline: true },
        { name: '💰 Price',  value: item.price,              inline: true },
        { name: '📝 Reason', value: reason || 'Not provided', inline: false },
      )
      .setFooter({ text: 'Please contact the seller if you believe this is a mistake.' })
      .setTimestamp(),
    'ORDER_REJECTED',
    user
  );
}

/**
 * Admin confirmed embed
 * Purpose: confirm to admins that an order was marked as delivered.
 * Usage: used in admin notifications or logs.
 */
function adminConfirmedEmbed(order, item, user) {
  return applyEmbedImage(
    new EmbedBuilder()
      .setColor(COLOR.SUCCESS)
      .setTitle('تم تأكيد الطلب وتسليمه')
      .setDescription('تم إكمال الطلب بنجاح.')
      .addFields(
        { name: '👤 Buyer',   value: `${user.tag}`,     inline: true },
        { name: '🏷️ Item',   value: item.name,          inline: true },
        { name: '🔑 Order',  value: `\`${order.id}\``,  inline: false },
      )
      .setTimestamp(),
    'ORDER_CONFIRMED_ADMIN',
    user
  );
}

/**
 * Admin rejected embed
 * Purpose: inform admins that an order was rejected/cancelled.
 * Usage: used in admin channels when rejecting orders.
 */
function adminRejectedEmbed(order, item, user) {
  return applyEmbedImage(
    new EmbedBuilder()
      .setColor(COLOR.REMOVE)
      .setTitle('تم رفض الطلب')
      .setDescription('تم إلغاء الطلب وتم إبلاغ المشتري.')
      .addFields(
        { name: '👤 Buyer',   value: `${user.tag}`,     inline: true },
        { name: '🏷️ Item',   value: item.name,          inline: true },
        { name: '🔑 Order',  value: `\`${order.id}\``,  inline: false },
      )
      .setTimestamp(),
    'ORDER_REJECTED_ADMIN',
    user
  );
}

module.exports = {
  // utilities
  normalizeEnvKey,
  getEmbedImageUrl,
  isValidImageUrl,
  applyBrandTheme,
  applyEmbedImage,
  generateId,
  COLOR,
  getStockItemEmoji,
  buildPremiumDescription,
  // embeds
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
  selectPaymentEmbed,
  paymentInstructionsEmbed,
  pendingOrderEmbed,
  orderDeliveredEmbed,
  orderRejectedEmbed,
  adminConfirmedEmbed,
  adminRejectedEmbed,
  transferEmbed,
};
