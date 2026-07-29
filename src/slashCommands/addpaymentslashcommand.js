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
    )
    .addStringOption((opt) =>
      opt.setName('emoji').setDescription('Custom emoji to display with this payment method (e.g. 💳)').setRequired(false)
    ),

  async execute(interaction) {
    const name    = interaction.options.getString('name');
    const details = interaction.options.getString('details');
    const emoji   = interaction.options.getString('emoji') ?? '💳';

    const db      = await getDB();
    const payment = { 
      id: generateId(), 
      name, 
      details, 
      emoji: emoji || '💳'
    };
    db.data.payments.push(payment);
    await db.write();

    await interaction.reply({ embeds: [paymentAddedEmbed(payment)] });
  },
};
