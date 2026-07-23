const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ChannelType,
} = require('discord.js');
const { COLOR, errorEmbed } = require('../helpers');

const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || '';
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || '';
const TRANSCRIPT_CHANNEL_ID = process.env.TRANSCRIPT_CHANNEL_ID || '';

function ticketButtons(type) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_open_support_${type}`)
      .setLabel('Support')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ticket_open_buy_${type}`)
      .setLabel('Buy')
      .setStyle(ButtonStyle.Success),
  );
}

function ticketControls() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel('Claim Ticket')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger),
  );
}

function isStaff(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    (STAFF_ROLE_ID && interaction.member?.roles?.cache?.has(STAFF_ROLE_ID))
  );
}

function parseTicketTopic(topic = '') {
  topic = topic || '';
  const owner = topic.match(/ticket-owner:([^ ]+)/)?.[1];
  const type = topic.match(/ticket-type:([^ ]+)/)?.[1];
  return { owner, type };
}

function safeChannelName(user, type) {
  const name = user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 60);
  return `ticket-${type}-${name || user.id.slice(-6)}`;
}

async function buildTranscript(channel) {
  const messages = [];
  let before;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    messages.push(...batch.values());
    if (batch.size < 100) break;
    before = batch.last().id;
  }

  messages.sort((first, second) => first.createdTimestamp - second.createdTimestamp);

  const lines = [
    `Ticket transcript: #${channel.name}`,
    `Server: ${channel.guild.name} (${channel.guild.id})`,
    `Created: ${channel.createdAt.toISOString()}`,
    `Exported: ${new Date().toISOString()}`,
    '',
  ];

  for (const message of messages) {
    const timestamp = message.createdAt.toISOString();
    const author = `${message.author.tag} (${message.author.id})`;
    const content = message.content || '[no text]';
    const attachments = [...message.attachments.values()].map((attachment) => attachment.url);
    lines.push(`[${timestamp}] ${author}: ${content}`);
    if (attachments.length > 0) lines.push(`Attachments: ${attachments.join(', ')}`);
    if (message.embeds.length > 0) lines.push(`Embeds: ${message.embeds.map((embed) => embed.title || embed.description || '[embed]').join(' | ')}`);
  }

  return Buffer.from(lines.join('\n'), 'utf8');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Send a ticket panel with editable text')
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Panel title')
        .setRequired(true)
        .setMaxLength(256)
    )
    .addStringOption((option) =>
      option
        .setName('description')
        .setDescription('Panel text shown above the Support and Buy buttons')
        .setRequired(true)
        .setMaxLength(4000)
    )
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Internal panel type used to prevent duplicate tickets')
        .setRequired(false)
        .setMaxLength(30)
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [errorEmbed('Ticket panels can only be sent in a server.')], flags: MessageFlags.Ephemeral });
    }

    if (!STAFF_ROLE_ID) {
      return interaction.reply({ embeds: [errorEmbed('Set `STAFF_ROLE_ID` in `.env` before creating a ticket panel.')], flags: MessageFlags.Ephemeral });
    }

    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const type = (interaction.options.getString('type') || 'general').toLowerCase().replace(/[^a-z0-9-]/g, '-');

    await interaction.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.PRIMARY)
          .setTitle(title)
          .setDescription(description)
          .setFooter({ text: 'Choose Support or Buy to open a private ticket.' })
          .setTimestamp(),
      ],
      components: [ticketButtons(type)],
    });

    return interaction.reply({ content: 'Ticket panel sent.', flags: MessageFlags.Ephemeral });
  },

  async handleButton(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [errorEmbed('Tickets can only be opened inside a server.')], flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId === 'ticket_claim') {
      if (!isStaff(interaction)) {
        return interaction.reply({ embeds: [errorEmbed('Only staff can claim tickets.')], flags: MessageFlags.Ephemeral });
      }

      const claimedBy = interaction.member.displayName || interaction.user.username;
      await interaction.channel.setTopic(`${interaction.channel.topic || ''} claimed-by:${interaction.user.id}`.trim()).catch(() => {});
      return interaction.reply({ content: `📌 Ticket claimed by **${claimedBy}**.` });
    }

    if (interaction.customId === 'ticket_close') {
      const { owner } = parseTicketTopic(interaction.channel.topic);
      if (!isStaff(interaction) && owner !== interaction.user.id) {
        return interaction.reply({ embeds: [errorEmbed('Only the ticket owner or staff can close this ticket.')], flags: MessageFlags.Ephemeral });
      }

      if (!TRANSCRIPT_CHANNEL_ID) {
        return interaction.reply({ embeds: [errorEmbed('Ticket transcripts are not configured. Set `TRANSCRIPT_CHANNEL_ID` in `.env` first.')], flags: MessageFlags.Ephemeral });
      }

      const transcriptChannel = await interaction.guild.channels.fetch(TRANSCRIPT_CHANNEL_ID).catch(() => null);
      if (!transcriptChannel || !transcriptChannel.isTextBased()) {
        return interaction.reply({ embeds: [errorEmbed('The configured `TRANSCRIPT_CHANNEL_ID` does not point to a text channel.')], flags: MessageFlags.Ephemeral });
      }

      await interaction.reply({ content: '🔒 Saving the ticket transcript and closing this ticket...' });

      const transcript = await buildTranscript(interaction.channel);
      const { type } = parseTicketTopic(interaction.channel.topic);
      await transcriptChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.WARNING)
            .setTitle('🧾 Ticket Closed')
            .setDescription(`Transcript saved for **#${interaction.channel.name}**.`)
            .addFields(
              { name: 'Type', value: type || 'unknown', inline: true },
              { name: 'Closed by', value: `<@${interaction.user.id}>`, inline: true },
            )
            .setTimestamp(),
        ],
        files: [{ attachment: transcript, name: `${interaction.channel.name}-transcript.txt` }],
      });

      return interaction.channel.delete('Ticket closed').catch(() => {});
    }

    if (!interaction.customId.startsWith('ticket_open_')) return;
    const [, , ticketType, panelType] = interaction.customId.split('_');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const existing = interaction.guild.channels.cache.find((channel) => {
      if (channel.type !== ChannelType.GuildText) return false;
      const ticket = parseTicketTopic(channel.topic);
      return ticket.owner === interaction.user.id && ticket.type === ticketType;
    });

    if (existing) {
      return interaction.editReply({ content: `You already have an open ${ticketType} ticket: ${existing}` });
    }

    const staffRole = interaction.guild.roles.cache.get(STAFF_ROLE_ID);
    if (!staffRole) {
      return interaction.editReply({ embeds: [errorEmbed('The configured `STAFF_ROLE_ID` does not exist in this server.')] });
    }

    const overwrites = [
      {
        id: interaction.guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: staffRole.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
    ];

    const channel = await interaction.guild.channels.create({
      name: safeChannelName(interaction.user, ticketType),
      type: ChannelType.GuildText,
      parent: TICKET_CATEGORY_ID && interaction.guild.channels.cache.has(TICKET_CATEGORY_ID) ? TICKET_CATEGORY_ID : undefined,
      topic: `ticket-owner:${interaction.user.id} ticket-type:${ticketType} panel:${panelType}`,
      permissionOverwrites: overwrites,
    });

    await channel.send({
      content: `<@${interaction.user.id}> <@&${STAFF_ROLE_ID}>`,
      allowedMentions: { users: [interaction.user.id], roles: [STAFF_ROLE_ID] },
      embeds: [
        new EmbedBuilder()
          .setColor(ticketType === 'buy' ? COLOR.SUCCESS : COLOR.PRIMARY)
          .setTitle(`${ticketType === 'buy' ? '🛒 Buy' : '🛠️ Support'} Ticket`)
          .setDescription(`Welcome <@${interaction.user.id}>. A staff member will help you soon.\n\n<@&${STAFF_ROLE_ID}>`)
          .addFields({ name: 'Opened by', value: `<@${interaction.user.id}>`, inline: true })
          .setTimestamp(),
      ],
      components: [ticketControls()],
    });

    return interaction.editReply({ content: `Your private ticket is ready: ${channel}` });
  },
};
