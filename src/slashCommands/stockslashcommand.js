const { SlashCommandBuilder } = require('discord.js');
const { getDB } = require('../database');
const { buildStockEmbed } = require('../helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stock')
    .setDescription('View the current stock'),

  async execute(interaction) {
    const db = await getDB();
    const embed = buildStockEmbed(db.data.stock);
    await interaction.reply({ embeds: [embed] });
  },
};
