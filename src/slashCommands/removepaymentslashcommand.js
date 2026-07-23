const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getDB } = require('../database');
const { errorEmbed, paymentRemovedEmbed } = require('../helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removepayment')
    .setDescription('Remove a payment method by ID')
    .addStringOption((opt) =>
      opt.setName('id').setDescription('Payment method ID').setRequired(true)
    ),

  async execute(interaction) {
    const id = interaction.options.getString('id');
    const db = await getDB();
    const before = db.data.payments.length;
    db.data.payments = db.data.payments.filter((p) => p.id !== id);

    if (db.data.payments.length === before) {
      return interaction.reply({ embeds: [errorEmbed(`No payment method with ID \`${id}\`.`)], flags: MessageFlags.Ephemeral });
    }

    await db.write();
    await interaction.reply({ embeds: [paymentRemovedEmbed(id)] });
  },
};
