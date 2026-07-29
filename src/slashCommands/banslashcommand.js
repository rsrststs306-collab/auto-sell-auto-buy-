const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { errorEmbed, successEmbed } = require('../helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('حظر مستخدم من السيرفر')
    .addUserOption((option) => option.setName('user').setDescription('The user to ban').setRequired(true))
    .addIntegerOption((option) => option.setName('deletemessages').setDescription('Delete message history for the last N days').setRequired(false).setMinValue(0).setMaxValue(7))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for banning the user').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [errorEmbed('This command can only be used in a server.')], flags: MessageFlags.Ephemeral });
    }

    const targetUser = interaction.options.getUser('user', true);
    const deleteDays = interaction.options.getInteger('deletemessages') || 0;
    const reason = interaction.options.getString('reason') || 'No reason provided';

    await interaction.guild.members.ban(targetUser.id, {
      deleteMessageSeconds: deleteDays * 24 * 60 * 60,
      reason,
    });

    await interaction.reply({ embeds: [successEmbed('تم حظر المستخدم', `${targetUser.tag} تم حظره من السيرفر.`)], flags: MessageFlags.Ephemeral });
  },
};
