const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getDB } = require('../database');
const { generateId, errorEmbed, infoEmbed, COLOR, hasAdminAccess } = require('../helpers');

module.exports = {
  name: 'additem',
  description: 'Create a new store item. Usage: !additem <name> | <price> | <type> | [description] | [content] | [emoji]',

  async execute(message, args) {
    if (!hasAdminAccess(message.author.id, message.member)) {
      return message.reply({ embeds: [errorEmbed('You need **Administrator** permission.')] });
    }

    const parts = args.join(' ').split('|').map((s) => s.trim());

    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
      return message.reply({
        embeds: [
          infoEmbed(
            '📋 Usage',
            '`!additem <name> | <price> | <type> | [description] | [content] | [emoji]`\n\n' +
            '**Types:**\n`account` - 👤 Each line = 1 account (email:password)\n`cookies` - 🍪 Entire content = 1 account (cookie data)\n\n' +
            '**Example:**\n`!additem Steam Account | 500 | account | Steam game account | user@email.com:password | 🎮`\n' +
            '`!additem Netflix Cookies | 100 | cookies | Netflix cookie access | | 🍪`\n\n' +
            '> The optional content is the first account/key to deliver. You can add more with `!addstock <id> <content>`.\n' +
            '> The optional emoji will be displayed in the stock list.',
          ),
        ],
      });
    }

    const [name, price, type, description = '', content = '', emoji = ''] = parts;

    // Validate type
    if (type !== 'account' && type !== 'cookies') {
      return message.reply({
        embeds: [errorEmbed('Invalid type. Use `account` or `cookies`.')],
      });
    }

    const db   = await getDB();
    const defaultEmoji = type === 'cookies' ? '🍪' : '👤';
    const item = { 
      id: generateId(), 
      name, 
      description, 
      price,
      type, // Add the type field
      contents: content ? [content] : [], 
      quantity: content ? 1 : 0,
      emoji: emoji || defaultEmoji
    };
    db.data.stock.push(item);
    await db.write();

    const typeEmoji = type === 'cookies' ? '🍪' : '👤';
    const typeText = type === 'cookies' ? 'Cookies' : 'Accounts';

    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.SUCCESS)
          .setTitle('✅ Item Created')
          .setDescription(`**${item.emoji} ${name}** added to the store.\nUse \`!addstock ${item.id} <content>\` to add more content.\n\n**Type:** ${typeEmoji} ${typeText}`)
          .addFields(
            { name: '🏷️ Name',        value: `${item.emoji} ${name}`,        inline: true  },
            { name: '💰 Price',       value: price,                          inline: true  },
            { name: '📊 Stock',       value: `${item.contents.length} entr${item.contents.length === 1 ? 'y' : 'ies'}`, inline: true  },
            { name: '🔧 Type',        value: `${typeEmoji} ${typeText}`,     inline: true },
            { name: '📝 Description', value: description || 'N/A',           inline: false },
            { name: '🔑 ID',          value: `\`${item.id}\``,                inline: false },
          )
          .setTimestamp(),
      ],
    });
  },
};
