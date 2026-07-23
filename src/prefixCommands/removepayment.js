const { PermissionFlagsBits } = require('discord.js');
const { getDB } = require('../database');
const { errorEmbed, paymentRemovedEmbed, infoEmbed, hasAdminAccess } = require('../helpers');

module.exports = {
  name: 'removepayment',
  description: 'Remove a payment method. Usage: !removepayment <id>',

  async execute(message, args) {
    if (!hasAdminAccess(message.author.id, message.member)) {
      return message.reply({ embeds: [errorEmbed('You need **Administrator** permission.')] });
    }

    const id = args[0];
    if (!id) {
      return message.reply({
        embeds: [infoEmbed('📋 Usage', '`!removepayment <id>`\n\nUse `!payments` to find payment IDs.')],
      });
    }

    const db     = await getDB();
    const before = db.data.payments.length;
    db.data.payments = db.data.payments.filter((p) => p.id !== id);

    if (db.data.payments.length === before) {
      return message.reply({ embeds: [errorEmbed(`No payment method with ID \`${id}\`.`)] });
    }

    await db.write();
    await message.reply({ embeds: [paymentRemovedEmbed(id)] });
  },
};
