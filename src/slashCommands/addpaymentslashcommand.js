const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getDB } = require('../database');
const { generateId, paymentAddedEmbed } = require('../helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addpayment')
    .setDescription('Add a payment method')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Payment method name (e.g. PayPal, Crypto)').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('details').setDescription('Details / address / instructions').setRequired(true)
    ),

  async execute(interaction) {
    const name    = interaction.options.getString('name');
    const details = interaction.options.getString('details');

    const db      = await getDB();
    const payment = { id: generateId(), name, details };
    db.data.payments.push(payment);
    await db.write();

    await interaction.reply({ embeds: [paymentAddedEmbed(payment)] });
  },
};
