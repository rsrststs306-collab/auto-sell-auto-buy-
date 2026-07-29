const { PermissionFlagsBits } = require('discord.js');
const { errorEmbed, infoEmbed, successEmbed, hasAdminAccess } = require('../helpers');

module.exports = {
  name: 'say',
  description: 'Make the bot send a message in the current channel. Usage: !say <message>',

  async execute(message, args) {
    if (!message.guild) {
      return message.reply({ embeds: [errorEmbed('This command can only be used in a server.')] });
    }

    if (!hasAdminAccess(message.author.id, message.member)) {
      return message.reply({ embeds: [errorEmbed('You need **Administrator** permission to use this command.')] });
    }

    const text = args.join(' ').trim();
    if (!text) {
      return message.reply({ embeds: [infoEmbed('🗣️ Usage', '`!say <message>`')] });
    }

    await message.channel.send(text);
    await message.reply({ embeds: [successEmbed('✅ Message Sent', 'The message was sent to this channel.')] });
  },
};
