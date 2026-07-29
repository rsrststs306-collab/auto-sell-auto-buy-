const { PermissionFlagsBits } = require('discord.js');
const { getDB } = require('../database');
const { generateId, paymentAddedEmbed, errorEmbed, infoEmbed, hasAdminAccess } = require('../helpers');

module.exports = {
  name: 'addpayment',
  description: 'Add a payment method. Usage: !addpayment <name> | <details> | [emoji]',

  async execute(message, args) {
    if (!hasAdminAccess(message.author.id, message.member)) {
      return message.reply({ embeds: [errorEmbed('You need **Administrator** permission.')] });
    }

    const parts = args.join(' ').split('|').map((s) => s.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      return message.reply({
        embeds: [
          infoEmbed(
            '📋 Usage',
            '`!addpayment <name> | <details> | [emoji]`\n\n' +
            '**Example:**\n`!addpayment PayPal | Send to: shop@email.com | 💳`\n\n' +
            '> The optional emoji will be displayed in the payment selection. If not provided, 💳 will be used.',
          ),
        ],
      });
    }

    const [name, details, emoji = '💳'] = parts;
    const db      = await getDB();
    const payment = { 
      id: generateId(), 
      name, 
      details, 
      emoji: emoji || '💳' // Default emoji if none provided
    };
    db.data.payments.push(payment);
    await db.write();

    await message.reply({ embeds: [paymentAddedEmbed(payment)] });
  },
};
