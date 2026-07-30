const { PermissionFlagsBits } = require('discord.js');
const { getEmbed, getErrorEmbed } = require('./dynamicEmbeds');

function hasAdminAccess(userId, memberOrPermissions) {
  const permissions = memberOrPermissions?.permissions || memberOrPermissions;
  if (permissions?.has?.(PermissionFlagsBits?.Administrator)) return true;

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

// Configuration helper functions
async function getConfig(db = null) {
  if (!db) {
    const { getDB } = require('./database');
    db = await getDB();
  }
  
  if (!db.data.config) {
    db.data.config = {
      roles: {},
      channels: {},
      categories: {},
      shop: {}
    };
    await db.write();
  }
  
  return db.data.config;
}

async function getConfigRole(roleType, db = null) {
  const config = await getConfig(db);
  return config.roles[roleType] || null;
}

async function getConfigChannel(channelType, db = null) {
  const config = await getConfig(db);
  return config.channels[channelType] || null;
}

async function getConfigCategory(categoryType, db = null) {
  const config = await getConfig(db);
  return config.categories[categoryType] || null;
}

async function getShopSetting(settingName, db = null) {
  const config = await getConfig(db);
  return config.shop[settingName] || null;
}

// Helper functions for dynamic embeds
function errorEmbed(message, user = null) {
  return getErrorEmbed(message, user);
}

function transferEmbed({ shopId, amountRaw, amountFormatted, productName, paymentName }) {
  const codeAmount = amountRaw ? String(amountRaw).replace(/[,\.]/g, '') : '3157895';
  const codeShopId = shopId || '1113796546010558474';
  const formatted = amountFormatted || (amountRaw ? Number(amountRaw).toLocaleString('en-US') : '3,157,895');

  return getEmbed('shop', 'transfer', {
    item: productName || 'المنتج',
    command: `#credit ${codeShopId} ${codeAmount}`,
    amount: `${formatted}`,
    shop: `<@${codeShopId}>`
  });
}

function successEmbed(title, description, user = null) {
  return getEmbed('shop', 'success', {
    title: title,
    message: description
  }, user);
}

function deliveryEmbed(item, content, order, priceNum, user = null) {
  return getEmbed('shop', 'delivery', {
    item: item.name,
    price: priceNum,
    content: content,
    order: order
  }, user);
}

function timeoutEmbed(user, shopId, priceNum) {
  return getEmbed('shop', 'timeout', {
    user: `<@${user.id}>`,
    command: `#credit ${shopId} ${String(priceNum).replace(/[,\.]/g, '')}`
  });
}

function itemAddedEmbed(item, user = null) {
  const qty = Array.isArray(item.contents) ? item.contents.length : (item.quantity ?? 0);
  return getEmbed('stock', 'item_added', {
    name: item.name,
    price: item.price,
    quantity: qty,
    description: item.description || 'غير متوفر',
    id: item.id
  }, user);
}

function itemRemovedEmbed(id, user = null) {
  return getEmbed('stock', 'item_removed', { id }, user);
}

function stockEmbed(stock, user = null) {
  if (stock.length === 0) {
    return getEmbed('stock', 'empty', {}, user);
  }
  
  return getEmbed('stock', 'list', {
    count: stock.length
  }, user);
}

// Legacy constants for backwards compatibility
const COLOR = {
  PRIMARY:  0x6c63ff,
  SUCCESS:  0x2ecc71,
  WARNING:  0xffc857,
  DANGER:   0xff4d6d,
  REMOVE:   0xff6b9a,
  PREMIUM:  0x7b61ff,
};

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function buildPremiumDescription(text) {
  return `✨ ${text}\n\n💫━━━━━━━━━━━━━━━💫\n\n🌟 تجربة فاخرة ومميزة`;
}

module.exports = {
  hasAdminAccess,
  getConfig,
  getConfigRole,
  getConfigChannel, 
  getConfigCategory,
  getShopSetting,
  // Dynamic embeds
  errorEmbed,
  transferEmbed,
  successEmbed,
  deliveryEmbed,
  timeoutEmbed,
  itemAddedEmbed,
  itemRemovedEmbed,
  stockEmbed,
  // Legacy
  COLOR,
  generateId,
  buildPremiumDescription,
  // Re-export dynamic embed functions
  getEmbed,
  getErrorEmbed
};
