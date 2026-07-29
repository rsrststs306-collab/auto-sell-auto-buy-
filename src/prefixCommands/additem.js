const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getDB } = require('../database');
const { generateId, errorEmbed, infoEmbed, COLOR, hasAdminAccess } = require('../helpers');

module.exports = {
  name: 'additem',
  description: 'Create a new store item. Usage: !additem <name> | <price> | [description] | [content] | [emoji]',

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
            '`!additem <name> | <price> | [description] | [content] | [emoji]`\n\n' +
            '**Example:**\n`!additem Steam Key | 500 | Random steam game key | STEAM123456 | 🎮`\n\n' +
            '> The optional content is the first account/key to deliver. You can add more with `!addstock <id> <content>`.\n' +
            '> The optional emoji will be displayed in the stock list. If not provided, a random emoji will be used.',
          ),
        ],
      });
    }

    const [name, price, description = '', content = '', emoji = ''] = parts;

    const db   = await getDB();
    const item = { 
      id: generateId(), 
      name, 
      description, 
      price, 
      contents: content ? [content] : [], 
      quantity: content ? 1 : 0,
      emoji: emoji || '🛍️' // Default emoji if none provided
    };
    db.data.stock.push(item);
    await db.write();

    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.SUCCESS)
          .setTitle('✅ Item Created')
          .setDescription(`**${item.emoji} ${name}** added to the store.\nUse \`!addstock ${item.id} <content>\` to add more accounts/keys.`)
          .addFields(
            { name: '🏷️ Name',        value: `${item.emoji} ${name}`,        inline: true  },
            { name: '💰 Price',       value: price,                          inline: true  },
            { name: '📊 Stock',       value: `${item.contents.length} entr${item.contents.length === 1 ? 'y' : 'ies'}`, inline: true  },
            { name: '📝 Description', value: description || 'N/A',           inline: false },
            { name: '🔑 ID',          value: `\`${item.id}\``,                inline: false },
          )
          .setTimestamp(),
      ],
    });
  },
};
