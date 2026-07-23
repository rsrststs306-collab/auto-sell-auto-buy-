const { SlashCommandBuilder } = require('discord.js');
const { getDB } = require('../database');
const { buildPaymentsEmbed } = require('../helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('payments')
    .setDescription('View all payment methods'),

  async execute(interaction) {
    const db = await getDB();
    const embed = buildPaymentsEmbed(db.data.payments);
    await interaction.reply({ embeds: [embed] });
  },
};
