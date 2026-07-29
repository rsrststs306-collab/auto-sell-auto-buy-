const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require('discord.js');
const { COLOR } = require('../helpers');

function buildFeedbackEmbed() {
  return new EmbedBuilder()
    .setTitle('ملاحظاتك تهمنا')
    .setColor(COLOR.PRIMARY)
    .setDescription('قيّم تجربتك باستخدام أحد الأزرار أدناه، أو شاركنا رأيك بشكل أعمق.')
    .addFields({ name: 'رأيك', value: 'اضغط على الزر أدناه لإرسال ملاحظاتك.', inline: false })
    .setFooter({ text: 'تساعدنا ملاحظاتك على التطوير والتميز.' })
    .setTimestamp();
}

function buildStarButtons() {
  return new ActionRowBuilder().addComponents(
    [1, 2, 3, 4, 5].map((star) =>
      new ButtonBuilder()
        .setCustomId(`feedback_${star}`)
        .setLabel(`${star} Star${star === 1 ? '' : 's'}`)
        .setStyle(ButtonStyle.Primary)
    )
  );
}

function buildOpinionButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('feedback_opinion')
      .setLabel('Your Opinion')
      .setStyle(ButtonStyle.Secondary)
  );
}

module.exports = {
  name: 'feedback',
  description: 'إرسال لوحة ملاحظات مع تقييم نجمي ومربع رأي',

  async execute(message) {
    await message.reply({
      embeds: [buildFeedbackEmbed()],
      components: [buildStarButtons(), buildOpinionButton()],
    });
  },
};
