const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { errorEmbed, successEmbed } = require('../helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('طرد مستخدم من السيرفر')
    .addUserOption((option) => option.setName('user').setDescription('The user to kick').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for kicking the user').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [errorEmbed('This command can only be used in a server.')], flags: MessageFlags.Ephemeral });
    }

    const targetUser = interaction.options.getUser('user', true);
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.reply({ embeds: [errorEmbed('That user is not in this server.')], flags: MessageFlags.Ephemeral });
    }

    if (!targetMember.kickable) {
      return interaction.reply({ embeds: [errorEmbed('I cannot kick that user.')], flags: MessageFlags.Ephemeral });
    }

    const reason = interaction.options.getString('reason') || 'No reason provided';
    await targetMember.kick(reason);

    await interaction.reply({ embeds: [successEmbed('تم طرد المستخدم', `${targetUser.tag} تم طرده من السيرفر.`)], flags: MessageFlags.Ephemeral });
  },
};
