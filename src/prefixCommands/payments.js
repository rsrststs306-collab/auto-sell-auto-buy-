const { getDB } = require('../database');
const { buildPaymentsEmbed } = require('../helpers');

module.exports = {
  name: 'payments',
  description: 'View all payment methods',
  async execute(message) {
    const db = await getDB();
    const embed = buildPaymentsEmbed(db.data.payments);
    await message.reply({ embeds: [embed] });
  },
};
