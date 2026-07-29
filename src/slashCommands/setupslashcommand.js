const { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  EmbedBuilder,
  MessageFlags,
  ChannelType 
} = require('discord.js');
const { getDB } = require('../database');
const { successEmbed, errorEmbed, infoEmbed, COLOR, hasAdminAccess } = require('../helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure bot settings, roles, channels, and categories')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('roles')
        .setDescription('Configure bot roles (admin, customer, etc.)')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Type of role to configure')
            .setRequired(true)
            .addChoices(
              { name: 'Admin Role', value: 'admin' },
              { name: 'Customer Role', value: 'customer' },
              { name: 'Support Role', value: 'support' },
              { name: 'VIP Role', value: 'vip' }
            ))
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to assign')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('channels')
        .setDescription('Configure bot channels (logs, orders, support, etc.)')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Type of channel to configure')
            .setRequired(true)
            .addChoices(
              { name: 'Order Logs', value: 'order_logs' },
              { name: 'Admin Logs', value: 'admin_logs' },
              { name: 'Support Channel', value: 'support' },
              { name: 'Announcements', value: 'announcements' },
              { name: 'Store Channel', value: 'store' }
            ))
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('The channel to assign')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('categories')
        .setDescription('Configure channel categories')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Type of category to configure')
            .setRequired(true)
            .addChoices(
              { name: 'Tickets Category', value: 'tickets' },
              { name: 'Support Category', value: 'support' },
              { name: 'Store Category', value: 'store' },
              { name: 'Admin Category', value: 'admin' }
            ))
        .addChannelOption(option =>
          option.setName('category')
            .setDescription('The category to assign')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildCategory)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('shop')
        .setDescription('Configure shop settings')
        .addStringOption(option =>
          option.setName('setting')
            .setDescription('Shop setting to configure')
            .setRequired(true)
            .addChoices(
              { name: 'Shop User ID (ProBot Target)', value: 'shop_user_id' },
              { name: 'Economy Bot ID', value: 'economy_bot_id' },
              { name: 'Shop Name', value: 'shop_name' },
              { name: 'Currency Symbol', value: 'currency' }
            ))
        .addStringOption(option =>
          option.setName('value')
            .setDescription('The value to set')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View current configuration'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription('Reset specific configuration')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('What to reset')
            .setRequired(true)
            .addChoices(
              { name: 'All Settings', value: 'all' },
              { name: 'Roles Only', value: 'roles' },
              { name: 'Channels Only', value: 'channels' },
              { name: 'Categories Only', value: 'categories' },
              { name: 'Shop Settings Only', value: 'shop' }
            ))),

  async execute(interaction) {
    // Check admin access
    if (!hasAdminAccess(interaction.user.id, interaction.member)) {
      return interaction.reply({
        embeds: [errorEmbed('You need **Administrator** permission to use this command.', interaction.user)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const db = await getDB();
    
    // Initialize config if it doesn't exist
    if (!db.data.config) {
      db.data.config = {
        roles: {},
        channels: {},
        categories: {},
        shop: {}
      };
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'roles':
        await handleRoleSetup(interaction, db);
        break;
      case 'channels':
        await handleChannelSetup(interaction, db);
        break;
      case 'categories':
        await handleCategorySetup(interaction, db);
        break;
      case 'shop':
        await handleShopSetup(interaction, db);
        break;
      case 'view':
        await handleViewConfig(interaction, db);
        break;
      case 'reset':
        await handleResetConfig(interaction, db);
        break;
    }
  },
};

async function handleRoleSetup(interaction, db) {
  const roleType = interaction.options.getString('type');
  const role = interaction.options.getRole('role');

  db.data.config.roles[roleType] = role.id;
  await db.write();

  const roleTypeNames = {
    admin: 'Admin Role',
    customer: 'Customer Role', 
    support: 'Support Role',
    vip: 'VIP Role'
  };

  await interaction.reply({
    embeds: [successEmbed(
      '✅ Role Configured',
      `**${roleTypeNames[roleType]}** has been set to ${role}\n\nRole ID: \`${role.id}\``,
      interaction.user
    )],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleChannelSetup(interaction, db) {
  const channelType = interaction.options.getString('type');
  const channel = interaction.options.getChannel('channel');

  db.data.config.channels[channelType] = channel.id;
  await db.write();

  const channelTypeNames = {
    order_logs: 'Order Logs Channel',
    admin_logs: 'Admin Logs Channel',
    support: 'Support Channel',
    announcements: 'Announcements Channel',
    store: 'Store Channel'
  };

  await interaction.reply({
    embeds: [successEmbed(
      '✅ Channel Configured',
      `**${channelTypeNames[channelType]}** has been set to ${channel}\n\nChannel ID: \`${channel.id}\``,
      interaction.user
    )],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCategorySetup(interaction, db) {
  const categoryType = interaction.options.getString('type');
  const category = interaction.options.getChannel('category');

  db.data.config.categories[categoryType] = category.id;
  await db.write();

  const categoryTypeNames = {
    tickets: 'Tickets Category',
    support: 'Support Category',
    store: 'Store Category',
    admin: 'Admin Category'
  };

  await interaction.reply({
    embeds: [successEmbed(
      '✅ Category Configured',
      `**${categoryTypeNames[categoryType]}** has been set to ${category.name}\n\nCategory ID: \`${category.id}\``,
      interaction.user
    )],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleShopSetup(interaction, db) {
  const setting = interaction.options.getString('setting');
  const value = interaction.options.getString('value');

  db.data.config.shop[setting] = value;
  await db.write();

  const settingNames = {
    shop_user_id: 'Shop User ID (ProBot Target)',
    economy_bot_id: 'Economy Bot ID',
    shop_name: 'Shop Name',
    currency: 'Currency Symbol'
  };

  await interaction.reply({
    embeds: [successEmbed(
      '✅ Shop Setting Configured',
      `**${settingNames[setting]}** has been set to: \`${value}\``,
      interaction.user
    )],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleViewConfig(interaction, db) {
  const config = db.data.config || { roles: {}, channels: {}, categories: {}, shop: {} };

  const embed = new EmbedBuilder()
    .setColor(COLOR.PRIMARY)
    .setTitle('🔧 Current Bot Configuration')
    .setDescription('Here are all the current bot settings:')
    .setTimestamp();

  // Roles Section
  let rolesText = '';
  const roleTypes = {
    admin: 'Admin Role',
    customer: 'Customer Role',
    support: 'Support Role', 
    vip: 'VIP Role'
  };

  for (const [key, name] of Object.entries(roleTypes)) {
    const roleId = config.roles[key];
    if (roleId) {
      rolesText += `**${name}:** <@&${roleId}> (\`${roleId}\`)\n`;
    } else {
      rolesText += `**${name}:** Not configured\n`;
    }
  }
  if (rolesText) embed.addFields({ name: '👥 Roles', value: rolesText, inline: false });

  // Channels Section
  let channelsText = '';
  const channelTypes = {
    order_logs: 'Order Logs',
    admin_logs: 'Admin Logs',
    support: 'Support Channel',
    announcements: 'Announcements',
    store: 'Store Channel'
  };

  for (const [key, name] of Object.entries(channelTypes)) {
    const channelId = config.channels[key];
    if (channelId) {
      channelsText += `**${name}:** <#${channelId}> (\`${channelId}\`)\n`;
    } else {
      channelsText += `**${name}:** Not configured\n`;
    }
  }
  if (channelsText) embed.addFields({ name: '📋 Channels', value: channelsText, inline: false });

  // Categories Section
  let categoriesText = '';
  const categoryTypes = {
    tickets: 'Tickets Category',
    support: 'Support Category',
    store: 'Store Category',
    admin: 'Admin Category'
  };

  for (const [key, name] of Object.entries(categoryTypes)) {
    const categoryId = config.categories[key];
    if (categoryId) {
      const categoryName = interaction.guild.channels.cache.get(categoryId)?.name || 'Unknown';
      categoriesText += `**${name}:** ${categoryName} (\`${categoryId}\`)\n`;
    } else {
      categoriesText += `**${name}:** Not configured\n`;
    }
  }
  if (categoriesText) embed.addFields({ name: '📁 Categories', value: categoriesText, inline: false });

  // Shop Settings Section
  let shopText = '';
  const shopSettings = {
    shop_user_id: 'Shop User ID',
    economy_bot_id: 'Economy Bot ID',
    shop_name: 'Shop Name',
    currency: 'Currency Symbol'
  };

  for (const [key, name] of Object.entries(shopSettings)) {
    const value = config.shop[key];
    if (value) {
      if (key === 'shop_user_id') {
        shopText += `**${name}:** <@${value}> (\`${value}\`)\n`;
      } else {
        shopText += `**${name}:** \`${value}\`\n`;
      }
    } else {
      shopText += `**${name}:** Not configured\n`;
    }
  }
  if (shopText) embed.addFields({ name: '🛒 Shop Settings', value: shopText, inline: false });

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleResetConfig(interaction, db) {
  const resetType = interaction.options.getString('type');

  switch (resetType) {
    case 'all':
      db.data.config = { roles: {}, channels: {}, categories: {}, shop: {} };
      break;
    case 'roles':
      db.data.config.roles = {};
      break;
    case 'channels':
      db.data.config.channels = {};
      break;
    case 'categories':
      db.data.config.categories = {};
      break;
    case 'shop':
      db.data.config.shop = {};
      break;
  }

  await db.write();

  const resetMessages = {
    all: 'All bot configuration has been reset.',
    roles: 'All role configurations have been reset.',
    channels: 'All channel configurations have been reset.',
    categories: 'All category configurations have been reset.',
    shop: 'All shop settings have been reset.'
  };

  await interaction.reply({
    embeds: [successEmbed(
      '✅ Configuration Reset',
      resetMessages[resetType],
      interaction.user
    )],
    flags: MessageFlags.Ephemeral,
  });
}