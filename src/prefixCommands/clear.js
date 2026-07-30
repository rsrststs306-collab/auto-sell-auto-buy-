const { PermissionFlagsBits } = require('discord.js');
const { errorEmbed, infoEmbed, successEmbed } = require('../helpers');

module.exports = {
  name: 'clear',
  description: 'Delete a number of messages from the current channel. Usage: !clear <amount>',

  async execute(message, args) {
    if (!message.guild) {
      return message.reply({ embeds: [errorEmbed('This command can only be used in a server.')] });
    }

    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply({ embeds: [errorEmbed('You need **Manage Messages** permission to use this command.')] });
    }

    const amount = Number.parseInt(args[0], 10);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      return message.reply({ embeds: [infoEmbed('🧹 Usage', '`!clear <amount>` (1-100)')] });
    }

    const messages = await message.channel.bulkDelete(amount, true).catch(() => null);
    if (!messages) {
      return message.channel.send({ embeds: [errorEmbed('I could not delete those messages. They may be older than 14 days.')] });
    }

    await message.channel.send({ embeds: [successEmbed('🧹 Messages Deleted', `${messages.size} message(s) removed from this channel.`)] }).then((reply) => setTimeout(() => reply.delete().catch(() => {}), 4000));
  },
};
