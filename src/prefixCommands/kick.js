const { PermissionFlagsBits } = require('discord.js');
const { errorEmbed, infoEmbed, successEmbed } = require('../helpers');

module.exports = {
  name: 'kick',
  description: 'Kick a user from the server. Usage: !kick <user> [reason]',

  async execute(message, args) {
    if (!message.guild) {
      return message.reply({ embeds: [errorEmbed('This command can only be used in a server.')] });
    }

    if (!message.member?.permissions?.has(PermissionFlagsBits.KickMembers)) {
      return message.reply({ embeds: [errorEmbed('You need **Kick Members** permission to use this command.')] });
    }

    const targetUser = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!targetUser) {
      return message.reply({ embeds: [infoEmbed('🦶 Usage', '`!kick <@user> [reason]`')] });
    }

    const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return message.reply({ embeds: [errorEmbed('That user is not in this server.')] });
    }

    if (!targetMember.kickable) {
      return message.reply({ embeds: [errorEmbed('I cannot kick that user.')] });
    }

    const reason = args.slice(1).join(' ').trim() || 'No reason provided';
    await targetMember.kick(reason);

    await message.reply({ embeds: [successEmbed('✅ User Kicked', `${targetUser.tag} was kicked from the server.`)] });
  },
};
