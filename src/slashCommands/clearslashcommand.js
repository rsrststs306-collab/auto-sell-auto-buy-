const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { errorEmbed, successEmbed } = require('../helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete a number of messages from the current channel')
    .addIntegerOption((option) => option.setName('amount').setDescription('How many messages to delete').setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [errorEmbed('This command can only be used in a server.')], flags: MessageFlags.Ephemeral });
    }

    const amount = interaction.options.getInteger('amount', true);
    const messages = await interaction.channel.bulkDelete(amount, true).catch(() => null);
    if (!messages) {
      return interaction.reply({ embeds: [errorEmbed('I could not delete those messages. They may be older than 14 days.')], flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({ embeds: [successEmbed('تم حذف الرسائل', `${messages.size} رسالة تم حذفها من هذا الروم.`)], flags: MessageFlags.Ephemeral });
  },
};
