const { PermissionFlagsBits } = require('discord.js');
const embeds = require('./embeds');

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

module.exports = {
  // re-export everything from embeds
  ...embeds,
  // plus helpers defined here
  hasAdminAccess,
  // configuration helpers
  getConfig,
  getConfigRole,
  getConfigChannel, 
  getConfigCategory,
  getShopSetting,
};
