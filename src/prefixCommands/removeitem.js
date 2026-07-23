const { PermissionFlagsBits } = require('discord.js');
const { getDB } = require('../database');
const { errorEmbed, itemRemovedEmbed, infoEmbed, hasAdminAccess } = require('../helpers');

module.exports = {
  name: 'removeitem',
  description: 'Remove an item from stock. Usage: !removeitem <id>',

  async execute(message, args) {
    if (!hasAdminAccess(message.author.id, message.member)) {
      return message.reply({ embeds: [errorEmbed('You need **Administrator** permission.')] });
    }

    const id = args[0];
    if (!id) {
      return message.reply({
        embeds: [infoEmbed('📋 Usage', '`!removeitem <id>`\n\nUse `!stock` to find item IDs.')],
      });
    }

    const db     = await getDB();
    const before = db.data.stock.length;
    db.data.stock = db.data.stock.filter((i) => i.id !== id);

    if (db.data.stock.length === before) {
      return message.reply({ embeds: [errorEmbed(`No item found with ID \`${id}\`.`)] });
    }

    await db.write();
    await message.reply({ embeds: [itemRemovedEmbed(id)] });
  },
};
