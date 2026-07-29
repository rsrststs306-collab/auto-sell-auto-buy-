const { PermissionFlagsBits } = require('discord.js');
const { errorEmbed, infoEmbed, successEmbed } = require('../helpers');

module.exports = {
  name: 'ban',
  description: 'Ban a user from the server. Usage: !ban <user> [days] [reason]',

  async execute(message, args) {
    if (!message.guild) {
      return message.reply({ embeds: [errorEmbed('This command can only be used in a server.')] });
    }

    if (!message.member?.permissions?.has(PermissionFlagsBits.BanMembers)) {
      return message.reply({ embeds: [errorEmbed('You need **Ban Members** permission to use this command.')] });
    }

    const targetUser = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!targetUser) {
      return message.reply({ embeds: [infoEmbed('🚫 Usage', '`!ban <@user> [days] [reason]`')] });
    }

    const deleteDays = Number.parseInt(args[1], 10) || 0;
    const reason = args.slice(deleteDays ? 2 : 1).join(' ').trim() || 'No reason provided';

    await message.guild.members.ban(targetUser.id, {
      deleteMessageSeconds: Math.min(Math.max(deleteDays, 0), 7) * 24 * 60 * 60,
      reason,
    });

    await message.reply({ embeds: [successEmbed('✅ User Banned', `${targetUser.tag} was banned from the server.`)] });
  },
};
