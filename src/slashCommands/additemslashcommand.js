const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const { getDB } = require('../database');
const { generateId, COLOR } = require('../helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('additem')
    .setDescription('Create a new item in the store (then use /addstock to add content)')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Item name shown in the store').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('price').setDescription('Price in credits (e.g. 500)').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('type')
        .setDescription('Type of item - affects how stock is added')
        .setRequired(true)
        .addChoices(
          { name: '👤 Account (email:password, one per line)', value: 'account' },
          { name: '🍪 Cookies (entire content as one account)', value: 'cookies' }
        )
    )
    .addStringOption((opt) =>
      opt.setName('description').setDescription('Short description shown in the store').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('content')
        .setDescription('First account, key, or item information to deliver after purchase')
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('emoji').setDescription('Custom emoji to display with this item (e.g. 🎮)').setRequired(false)
    ),

  async execute(interaction) {
    const name        = interaction.options.getString('name');
    const price       = interaction.options.getString('price');
    const type        = interaction.options.getString('type');
    const description = interaction.options.getString('description') ?? '';
    const content     = interaction.options.getString('content');
    const emoji       = interaction.options.getString('emoji') ?? (type === 'cookies' ? '🍪' : '👤');

    const db   = await getDB();
    const item = { 
      id: generateId(), 
      name, 
      description, 
      price,
      type, // Add the type field
      contents: content ? [content] : [], 
      quantity: content ? 1 : 0,
      emoji: emoji || '🛍️'
    };
    db.data.stock.push(item);
    await db.write();

    const typeEmoji = type === 'cookies' ? '🍪' : '👤';
    const typeText = type === 'cookies' ? 'Cookies' : 'Accounts';

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.SUCCESS)
          .setTitle('تم إنشاء المنتج')
          .setDescription(`تمت إضافة **${item.emoji} ${name}** إلى المتجر.\nاستخدم \`/addstock\` أو \`!addstock\` لإضافة المزيد من المحتويات.\n\n**نوع المنتج:** ${typeEmoji} ${typeText}`)
          .addFields(
            { name: '🏷️ Name',        value: `${item.emoji} ${name}`,      inline: true  },
            { name: '💰 Price',       value: price,                        inline: true  },
            { name: '📊 Stock',       value: `${item.contents.length} entr${item.contents.length === 1 ? 'y' : 'ies'}`, inline: true },
            { name: '🔧 Type',        value: `${typeEmoji} ${typeText}`,   inline: true },
            { name: '📝 Description', value: description || 'N/A',         inline: false },
            { name: '🔑 ID',          value: `\`${item.id}\``,              inline: false },
          )
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
