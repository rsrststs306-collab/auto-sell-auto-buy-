const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getDB } = require('../database');
const { errorEmbed, itemEditedEmbed } = require('../helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('edititem')
    .setDescription('Edit an existing stock item')
    .addStringOption((opt) =>
      opt.setName('id').setDescription('The item ID to edit').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('name').setDescription('New name').setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt.setName('quantity').setDescription('New quantity').setRequired(false).setMinValue(0)
    )
    .addStringOption((opt) =>
      opt.setName('price').setDescription('New price').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('description').setDescription('New description').setRequired(false)
    ),

  async execute(interaction) {
    const id = interaction.options.getString('id');
    const db = await getDB();
    const item = db.data.stock.find((i) => i.id === id);

    if (!item) {
      return interaction.reply({ embeds: [errorEmbed(`No item found with ID \`${id}\`.`)], flags: MessageFlags.Ephemeral });
    }

    const name        = interaction.options.getString('name');
    const quantity    = interaction.options.getInteger('quantity');
    const price       = interaction.options.getString('price');
    const description = interaction.options.getString('description');

    if (name        !== null) item.name        = name;
    if (quantity    !== null) item.quantity     = quantity;
    if (price       !== null) item.price        = price;
    if (description !== null) item.description  = description;

    await db.write();
    await interaction.reply({ embeds: [itemEditedEmbed(item)] });
  },
};
