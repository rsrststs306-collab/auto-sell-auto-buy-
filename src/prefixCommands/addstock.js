const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getDB } = require('../database');
const { errorEmbed, infoEmbed, COLOR, hasAdminAccess } = require('../helpers');

module.exports = {
  name: 'addstock',
  description: 'Add stock in bulk. Usage: !addstock <itemId> [quantity] <content1> | <content2>',

  async execute(message, args) {
    if (!hasAdminAccess(message.author.id, message.member)) {
      return message.reply({ embeds: [errorEmbed('You need **Administrator** permission.')] });
    }

    const [itemId, quantityOrContent, ...rest] = args;
    const parsedQuantity = Number.parseInt(quantityOrContent, 10);
    const quantity = Number.isInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;
    const contentParts = Number.isInteger(parsedQuantity) && parsedQuantity > 0 ? rest : [quantityOrContent, ...rest];
    const content = contentParts.join(' ').trim();
    const entries = content.split(/\r?\n|\s*\|\s*/).map((entry) => entry.trim()).filter(Boolean);

    if (!itemId || entries.length === 0 || quantity > 100) {
      return message.reply({
        embeds: [
          infoEmbed(
            '📋 Usage',
            '`!addstock <itemId> [quantity] <content1> | <content2>`\n\n' +
            '**Examples:**\n' +
            '`!addstock abc123 email@example.com:password123`\n' +
            '`!addstock abc123 email1:pass1 | email2:pass2 | email3:pass3`\n' +
            '`!addstock abc123 10 email@example.com:password123`\n\n' +
            '> Separate different accounts with `|`. Quantity can be 1–100 and repeats every account entry.',
          ),
        ],
      });
    }

    const db   = await getDB();
    const item = db.data.stock.find((i) => i.id === itemId);

    if (!item) {
      return message.reply({ embeds: [errorEmbed(`No item found with ID \`${itemId}\`.`)] });
    }

    if (!Array.isArray(item.contents)) item.contents = [];
    item.contents.push(...entries.flatMap((entry) => Array(quantity).fill(entry)));
    item.quantity = item.contents.length;
    await db.write();

    // Delete the command message to keep content private
    message.delete().catch(() => {});

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.SUCCESS)
          .setTitle('✅ Stock Added')
          .addFields(
            { name: '🏷️ Item',        value: item.name,                         inline: true },
            { name: '📊 Total Stock', value: `${item.contents.length} entries`,  inline: true },
            { name: '📦 Added',       value: `${entries.length * quantity} entr${entries.length * quantity === 1 ? 'y' : 'ies'}`, inline: true },
          )
          .setFooter({ text: 'Content kept private — command message deleted.' })
          .setTimestamp(),
      ],
    });
  },
};
