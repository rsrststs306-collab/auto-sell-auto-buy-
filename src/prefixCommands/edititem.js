const { PermissionFlagsBits } = require('discord.js');
const { getDB } = require('../database');
const { errorEmbed, itemEditedEmbed, infoEmbed, hasAdminAccess } = require('../helpers');

const ALLOWED_FIELDS = ['name', 'price', 'description'];

module.exports = {
  name: 'edititem',
  description: 'Edit a stock item. Usage: !edititem <id> <field> <value>',

  async execute(message, args) {
    if (!hasAdminAccess(message.author.id, message.member)) {
      return message.reply({ embeds: [errorEmbed('You need **Administrator** permission.')] });
    }

    const [id, field, ...rest] = args;
    const value = rest.join(' ');

    if (!id || !field || !value) {
      return message.reply({
        embeds: [
          infoEmbed(
            '📋 Usage',
            '`!edititem <id> <field> <value>`\n\n' +
            `**Fields:** ${ALLOWED_FIELDS.join(', ')}\n\n` +
            '**Example:**\n`!edititem abc123 price $9.99`',
          ),
        ],
      });
    }

    if (!ALLOWED_FIELDS.includes(field)) {
      return message.reply({
        embeds: [errorEmbed(`Unknown field \`${field}\`.\nAllowed fields: ${ALLOWED_FIELDS.join(', ')}`)],
      });
    }

    const db   = await getDB();
    const item = db.data.stock.find((i) => i.id === id);
    if (!item) return message.reply({ embeds: [errorEmbed(`No item with ID \`${id}\`.`)] });

    if (field === 'quantity') {
      return message.reply({ embeds: [errorEmbed('Quantity is managed automatically by stock entries. Use `!addstock` to add content.')] });
    } else {
      item[field] = value;
    }

    await db.write();
    await message.reply({ embeds: [itemEditedEmbed(item)] });
  },
};
