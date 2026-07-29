const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { errorEmbed, infoEmbed, successEmbed, hasAdminAccess } = require('../helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('اجعل البوت يرسل رسالة في الروم الحالي')
    .addStringOption((option) =>
      option.setName('message').setDescription('الرسالة التي يريد البوت إرسالها').setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [errorEmbed('This command can only be used in a server.')], flags: MessageFlags.Ephemeral });
    }

    if (!hasAdminAccess(interaction.user.id, interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed('You need **Administrator** permission to use this command.')], flags: MessageFlags.Ephemeral });
    }

    const text = interaction.options.getString('message', true).trim();
    if (!text) {
      return interaction.reply({ embeds: [infoEmbed('🗣️ Usage', 'Use `/say <message>` to send a message.')], flags: MessageFlags.Ephemeral });
    }

    await interaction.channel.send(text);
    await interaction.reply({ embeds: [successEmbed('تم إرسال الرسالة', 'تم إرسال الرسالة إلى هذا الروم.')], flags: MessageFlags.Ephemeral });
  },
};
