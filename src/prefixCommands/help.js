const { buildHelpEmbed } = require('../helpers');

module.exports = {
  name: 'help',
  description: 'Show all available commands',

  async execute(message) {
    const prefix = process.env.PREFIX || '!';
    await message.reply({ embeds: [buildHelpEmbed(prefix)] });
  },
};
