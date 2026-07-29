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
const { getDB } = require('../database');
const { sendTicketFeedbackPrompt } = require('./feedbackslashcommand');
const { COLOR, errorEmbed, successEmbed, infoEmbed, buildPremiumDescription } = require('../helpers');

const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || '';
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || '';
const TRANSCRIPT_CHANNEL_ID = process.env.TRANSCRIPT_CHANNEL_ID || '';

function ticketButtons(type) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_open_support_${type}`)
      .setLabel('✨ الدعم')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ticket_open_buy_${type}`)
      .setLabel('🛍️ الشراء')
      .setStyle(ButtonStyle.Success),
  );
}

function ticketControls() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel('⚡ استلام التذكرة')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('🔒 إغلاق التذكرة')
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
        .setDescription('النص المعروض أعلى أزرار الدعم والشراء')
        .setRequired(true)
        .setMaxLength(4000)
    )
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('نوع داخلي للوحة لمنع التذاكر المكررة')
        .setRequired(false)
        .setMaxLength(30)
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [errorEmbed('يمكن إرسال لوحات التذاكر فقط داخل السيرفر.')], flags: MessageFlags.Ephemeral });
    }

    if (!STAFF_ROLE_ID) {
      return interaction.reply({ embeds: [errorEmbed('يرجى تعيين `STAFF_ROLE_ID` في ملف `.env` قبل إنشاء لوحة التذاكر.')], flags: MessageFlags.Ephemeral });
    }

    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const type = (interaction.options.getString('type') || 'general').toLowerCase().replace(/[^a-z0-9-]/g, '-');

    await interaction.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.PRIMARY)
          .setTitle(title)
          .setDescription(buildPremiumDescription(description))
          .setFooter({ text: 'اختر الدعم أو الشراء لفتح تذكرة خاصة وبدء رحلتك مع الخدمة المميزة.' })
          .setTimestamp(),
      ],
      components: [ticketButtons(type)],
    });

    return interaction.reply({ embeds: [successEmbed('تم إرسال لوحة التذاكر', 'تم إرسال لوحة التذاكر بنجاح.')], flags: MessageFlags.Ephemeral });
  },

  async handleButton(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [errorEmbed('يمكن فتح التذاكر فقط داخل السيرفر.')], flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId === 'ticket_claim') {
      if (!isStaff(interaction)) {
        return interaction.reply({ embeds: [errorEmbed('فقط الإدارة يمكنها أخذ التذاكر.')], flags: MessageFlags.Ephemeral });
      }

      const claimedBy = interaction.member.displayName || interaction.user.username;
      await interaction.channel.setTopic(`${interaction.channel.topic || ''} claimed-by:${interaction.user.id}`.trim()).catch(() => {});
      return interaction.reply({ embeds: [successEmbed('تم أخذ التذكرة', `تم أخذ التذكرة من قبل **${claimedBy}**.`)] });
    }

    if (interaction.customId === 'ticket_close') {
      const { owner } = parseTicketTopic(interaction.channel.topic);
      if (!isStaff(interaction) && owner !== interaction.user.id) {
        return interaction.reply({ embeds: [errorEmbed('فقط صاحب التذكرة أو الإدارة يمكنهم إغلاق هذه التذكرة.')], flags: MessageFlags.Ephemeral });
      }

      if (!TRANSCRIPT_CHANNEL_ID) {
        return interaction.reply({ embeds: [errorEmbed('لم يتم تكوين نسخ التذاكر. يرجى تعيين `TRANSCRIPT_CHANNEL_ID` في `.env` أولًا.')], flags: MessageFlags.Ephemeral });
      }

      const transcriptChannel = await interaction.guild.channels.fetch(TRANSCRIPT_CHANNEL_ID).catch(() => null);
      if (!transcriptChannel || !transcriptChannel.isTextBased()) {
        return interaction.reply({ embeds: [errorEmbed('قيمة `TRANSCRIPT_CHANNEL_ID` لا تشير إلى روم نصي صالح.')], flags: MessageFlags.Ephemeral });
      }

      await interaction.reply({ embeds: [infoEmbed('جارٍ حفظ النسخة', 'جارٍ حفظ نسخة التذكرة وإغلاقها...')] });

      const transcript = await buildTranscript(interaction.channel);
      const { type } = parseTicketTopic(interaction.channel.topic);
      await transcriptChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.WARNING)
            .setTitle('تم إغلاق التذكرة')
            .setDescription(`تم حفظ النسخة الخاصة بـ **#${interaction.channel.name}**.`)
            .addFields(
              { name: 'النوع', value: type || 'غير معروف', inline: true },
              { name: 'تم الإغلاق بواسطة', value: `<@${interaction.user.id}>`, inline: true },
            )
            .setTimestamp(),
        ],
        files: [{ attachment: transcript, name: `${interaction.channel.name}-transcript.txt` }],
      });

      const db = await getDB();
      const targets = [];

      if (db.data.feedbackChannelId) {
        const feedbackChannel = await interaction.guild.channels.fetch(db.data.feedbackChannelId).catch(() => null);
        if (feedbackChannel?.isTextBased()) {
          targets.push(feedbackChannel);
        }
      }

      if (owner) {
        const ownerUser = await interaction.client.users.fetch(owner).catch(() => null);
        if (ownerUser) {
          targets.push(ownerUser);
        }
      }

      if (targets.length > 0) {
        await sendTicketFeedbackPrompt(targets, owner);
      }

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
      return interaction.editReply({ embeds: [errorEmbed(`لديك بالفعل تذكرة مفتوحة من النوع ${ticketType}: ${existing}`)] });
    }

    const staffRole = interaction.guild.roles.cache.get(STAFF_ROLE_ID);
    if (!staffRole) {
      return interaction.editReply({ embeds: [errorEmbed('الدور `STAFF_ROLE_ID` المحدد غير موجود في هذا السيرفر.')] });
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
          .setTitle(`${ticketType === 'buy' ? 'تذكرة شراء' : 'تذكرة دعم'} `)
          .setDescription(`مرحبًا <@${interaction.user.id}>. سيتولى أحد أعضاء الإدارة مساعدتك قريبًا.\n\n<@&${STAFF_ROLE_ID}>`)
          .addFields({ name: 'مفتوح من قبل', value: `<@${interaction.user.id}>`, inline: true })
          .setTimestamp(),
      ],
      components: [ticketControls()],
    });

    return interaction.editReply({ embeds: [successEmbed('التذكرة جاهزة', `تذكرتك الخاصة جاهزة: ${channel}`)] });
  },
};
