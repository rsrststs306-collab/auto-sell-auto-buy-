const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getDB } = require('../database');
const { errorEmbed, itemRemovedEmbed } = require('../helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removeitem')
    .setDescription('Remove an item from stock by its ID')
    .addStringOption((opt) =>
      opt.setName('id').setDescription('The item ID to remove').setRequired(true)
    ),

  async execute(interaction) {
    const id = interaction.options.getString('id');
    const db = await getDB();
    const before = db.data.stock.length;
    db.data.stock = db.data.stock.filter((i) => i.id !== id);

    if (db.data.stock.length === before) {
      return interaction.reply({ embeds: [errorEmbed(`No item found with ID \`${id}\`.`)], flags: MessageFlags.Ephemeral });
    }

    await db.write();
    await interaction.reply({ embeds: [itemRemovedEmbed(id)] });
  },
};
