const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const { getDB } = require('./database');
const { COLOR, errorEmbed, hasAdminAccess, successEmbed, infoEmbed } = require('./helpers');

const JOIN_LOG_CHANNEL_ID = process.env.JOIN_LOG_CHANNEL_ID || '';
const SERVER_CONTROL_USER_IDS = new Set(
  (process.env.SERVER_CONTROL_USER_IDS || '').split(',').map((id) => id.trim()).filter(Boolean)
);
const SERVER_CONTROL_ROLE_IDS = new Set(
  (process.env.SERVER_CONTROL_ROLE_IDS || '').split(',').map((id) => id.trim()).filter(Boolean)
);
const OWNER_NOTICE_MESSAGE = process.env.OWNER_NOTICE_MESSAGE ||
  'Hello! You invited this bot, but it was not given the permissions it needs. Please review the bot permissions and invite it again with the required permissions.';

function canControlServer(interaction) {
  if (hasAdminAccess(interaction.user.id, interaction.member)) return true;
  if (SERVER_CONTROL_USER_IDS.has(interaction.user.id)) return true;

  const roleIds = interaction.member?.roles?.cache?.keys?.() || [];
  return [...roleIds].some((roleId) => SERVER_CONTROL_ROLE_IDS.has(roleId));
}

function controlButtons(guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`guild_control_leave_${guildId}`)
      .setLabel('Leave Server')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`guild_control_message_${guildId}`)
      .setLabel('Message Owner')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`guild_control_disable_${guildId}`)
      .setLabel('Disable Bot')
      .setStyle(ButtonStyle.Secondary),
  );
}

function joinEmbed(guild, inviteUrl, status = 'active') {
  return new EmbedBuilder()
    .setColor(status === 'disabled' ? COLOR.DANGER : COLOR.SUCCESS)
    .setTitle(status === 'disabled' ? '⛔ Server Disabled' : '📥 Bot Joined a New Server')
    .setDescription(`The bot joined **${guild.name}**.`)
    .addFields(
      { name: 'Server ID', value: `\`${guild.id}\``, inline: true },
      { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
      { name: 'Members', value: String(guild.memberCount), inline: true },
      { name: 'Server Invite', value: inviteUrl || 'Unable to create an invite. Give the bot Create Instant Invite permission.', inline: false },
    )
    .setTimestamp();
}

async function createInvite(guild) {
  const me = guild.members.me;
  const inviteChannel = guild.channels.cache.find((channel) => {
    if (!channel.isTextBased?.() || !channel.permissionsFor || !me) return false;
    return channel.permissionsFor(me).has(PermissionFlagsBits.CreateInstantInvite);
  });

  if (!inviteChannel) return '';
  const invite = await inviteChannel.createInvite({ maxAge: 0, maxUses: 0, reason: 'Server join audit log' });
  return invite.url;
}

async function getLogChannel(client) {
  if (!JOIN_LOG_CHANNEL_ID) return null;
  const channel = await client.channels.fetch(JOIN_LOG_CHANNEL_ID).catch(() => null);
  return channel?.isTextBased?.() ? channel : null;
}

async function isGuildDisabled(guildId) {
  const db = await getDB();
  return Array.isArray(db.data.disabledGuilds) && db.data.disabledGuilds.includes(guildId);
}

async function setGuildDisabled(guildId, disabled) {
  const db = await getDB();
  if (!Array.isArray(db.data.disabledGuilds)) db.data.disabledGuilds = [];

  db.data.disabledGuilds = disabled
    ? [...new Set([...db.data.disabledGuilds, guildId])]
    : db.data.disabledGuilds.filter((id) => id !== guildId);
  await db.write();
}

async function handleGuildCreate(client, guild) {
  const logChannel = await getLogChannel(client);
  if (!logChannel) {
    console.warn('JOIN_LOG_CHANNEL_ID is missing or does not point to a text channel.');
    return;
  }

  let inviteUrl = '';
  try {
    inviteUrl = await createInvite(guild);
  } catch (error) {
    console.warn(`Could not create an invite for guild ${guild.id}:`, error.message || error);
  }

  const disabled = await isGuildDisabled(guild.id);
  await logChannel.send({
    embeds: [joinEmbed(guild, inviteUrl, disabled ? 'disabled' : 'active')],
    components: [controlButtons(guild.id)],
  });
}

async function handleButton(interaction, client) {
  if (!interaction.customId.startsWith('guild_control_')) return false;

  if (!canControlServer(interaction)) {
    await interaction.reply({ embeds: [errorEmbed('You are not allowed to use server-control buttons.')], flags: MessageFlags.Ephemeral });
    return true;
  }

  const [, , action, guildId] = interaction.customId.split('_');
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    await interaction.reply({ embeds: [errorEmbed('The bot is no longer in that server.')], flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (action === 'leave') {
    await interaction.editReply({ embeds: [infoEmbed('Leaving Server', `Leaving **${guild.name}**...`)] });
    await guild.leave();
    return true;
  }

  if (action === 'message') {
    const owner = await client.users.fetch(guild.ownerId).catch((error) => {
      console.warn(`Could not fetch owner ${guild.ownerId} for guild ${guild.id}:`, error.message || error);
      return null;
    });
    if (!owner) return interaction.editReply({ embeds: [errorEmbed('I could not fetch the server owner.')] });

    try {
      await owner.send({ content: OWNER_NOTICE_MESSAGE, allowedMentions: { parse: [] } });
      return interaction.editReply({ embeds: [successEmbed('Message Sent', `Message sent successfully to **${owner.tag}**.`)] });
    } catch (error) {
      console.warn(`Could not DM owner ${owner.id} for guild ${guild.id}:`, error.message || error);
      return interaction.editReply({
        embeds: [errorEmbed(`I could not send a DM to **${owner.tag}**. Their DMs may be closed or they may not share a DM route with the bot.`)],
      });
    }
  }

  if (action === 'disable') {
    await setGuildDisabled(guild.id, true);
    return interaction.editReply({ embeds: [successEmbed('Server Disabled', `The bot is now disabled in **${guild.name}**. It will ignore commands there.`)] });
  }

  return interaction.editReply({ embeds: [errorEmbed('Unknown server-control action.')] });
}

module.exports = {
  handleGuildCreate,
  handleButton,
  isGuildDisabled,
};
