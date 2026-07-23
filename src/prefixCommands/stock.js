const { getDB } = require('../database');
const { buildStockEmbed } = require('../helpers');

module.exports = {
  name: 'stock',
  description: 'View the current stock',
  async execute(message) {
    const db = await getDB();
    const embed = buildStockEmbed(db.data.stock);
    await message.reply({ embeds: [embed] });
  },
};
