const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const { getDB } = require('../database');
const { COLOR, successEmbed, errorEmbed, hasAdminAccess, buildPremiumDescription } = require('../helpers');

const STAR_BUTTON_IDS = ['feedback_1', 'feedback_2', 'feedback_3', 'feedback_4', 'feedback_5'];

function buildFeedbackEmbed(userId) {
  const embed = new EmbedBuilder()
    .setTitle('✨ تقييم التذكرة')
    .setColor(COLOR.PRIMARY)
    .setDescription(buildPremiumDescription(userId
      ? `قيّم تجربة الدعم الخاصة بـ <@${userId}>، فكل ملاحظة منك تعزز جودة الخدمة وتُظهر قيمتنا لك.`
      : 'قيّمنا باستخدام أحد النجوم أدناه أو شاركنا رأيك عبر الزر اللامع، لتكون تجربتك أكثر فخامة واحترافية.'))
    .addFields({ name: '✦ رأيك', value: 'اضغط على الزر أدناه لإرسال أفكارك وملاحظاتك.', inline: false })
    .setFooter({ text: 'ملاحظاتك تساعدنا على التطوير والتميز.' })
    .setTimestamp();

  return embed;
}

function buildStarButtons() {
  return new ActionRowBuilder().addComponents(
    STAR_BUTTON_IDS.map((id, index) =>
      new ButtonBuilder()
        .setCustomId(id)
        .setLabel('⭐'.repeat(index + 1))
        .setStyle(ButtonStyle.Primary)
    )
  );
}

function buildOpinionButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('feedback_opinion')
      .setLabel('رأيك')
      .setStyle(ButtonStyle.Secondary)
  );
}

async function sendTicketFeedbackPrompt(targets, userId) {
  const payload = {
    embeds: [buildFeedbackEmbed(userId)],
    components: [buildStarButtons(), buildOpinionButton()],
  };

  const results = [];
  for (const target of targets) {
    if (!target) continue;
    try {
      await target.send(payload);
      results.push(true);
    } catch (error) {
      results.push(false);
    }
  }

  return results.some(Boolean);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('feedback')
    .setDescription('إعداد قناة لاستقبال تقييمات وتعليقات التذاكر')
    .addChannelOption((opt) =>
      opt.setName('channel')
        .setDescription('اختر القناة التي سيتم إرسال تعليقات التذاكر إليها تلقائيًا')
        .setRequired(false)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    if (channel) {
      if (!hasAdminAccess(interaction.user.id, interaction.member)) {
        return interaction.reply({ embeds: [errorEmbed('تحتاج إلى صلاحية الإدارة لتعيين قناة التعليقات.')], ephemeral: true });
      }

      if (!channel.isTextBased()) {
        return interaction.reply({ embeds: [errorEmbed('يرجى اختيار قناة نصية صالحة.')], ephemeral: true });
      }

      const db = await getDB();
      db.data.feedbackChannelId = channel.id;
      await db.write();

      return interaction.reply({ embeds: [successEmbed('تم تعيين قناة التعليقات', `سيتم إرسال تقييمات وملاحظات التذاكر إلى ${channel} الآن.`)], ephemeral: true });
    }

    if (!interaction.options.getChannel('channel')) {
      return interaction.reply({
        embeds: [successEmbed('إعداد قناة التعليقات', 'استخدم /feedback #القناة لتعيين القناة التي ستستقبل تعليقات التذاكر.')],
        ephemeral: true,
      });
    }

  },

  async handleButton(interaction) {
    if (!interaction.customId.startsWith('feedback_') && interaction.customId !== 'feedback_opinion') return;

    if (interaction.customId === 'feedback_opinion') {
      const modal = new ModalBuilder()
        .setCustomId('feedback_modal')
        .setTitle('✨ شارك رأيك معنا')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('opinion')
              .setLabel('💬 ما الذي تريد أن تقوله لنا؟')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('💫 رأيك يساهم في تحسين تجربتك معنا.')
              .setRequired(true)
              .setMaxLength(4000)
          )
        );

      return interaction.showModal(modal);
    }

    const rating = Number(interaction.customId.split('_')[1]);
    if (!rating || rating < 1 || rating > 5) {
      return interaction.reply({ embeds: [errorEmbed('تقييم غير صالح.')], flags: MessageFlags.Ephemeral });
    }

    const stars = '⭐'.repeat(rating);
    return interaction.reply({
      embeds: [successEmbed('شكرًا على تقييمك', `لقد قيّمتنا ${stars} (${rating}/5)، ونسعد بوجودك معنا.`)],
      flags: MessageFlags.Ephemeral,
    });
  },

  async handleModal(interaction) {
    if (interaction.customId !== 'feedback_modal') return;

    const opinion = interaction.fields.getTextInputValue('opinion').trim();
    if (!opinion) {
      return interaction.reply({ embeds: [errorEmbed('يرجى إدخال رأيك قبل الإرسال.')], flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({
      embeds: [successEmbed('تم استلام رأيك', 'شكرًا لك! تم تسجيل رأيك بنجاح وسيُؤخذ بعين الاعتبار.')],
      flags: MessageFlags.Ephemeral,
    });
  },

  buildFeedbackEmbed,
  buildStarButtons,
  buildOpinionButton,
  sendTicketFeedbackPrompt,
};
