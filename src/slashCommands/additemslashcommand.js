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
      opt.setName('description').setDescription('Short description shown in the store').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('content')
        .setDescription('First account, key, or item information to deliver after purchase')
        .setRequired(false)
    ),

  async execute(interaction) {
    const name        = interaction.options.getString('name');
    const price       = interaction.options.getString('price');
    const description = interaction.options.getString('description') ?? '';
    const content     = interaction.options.getString('content');

    const db   = await getDB();
    const item = { id: generateId(), name, description, price, contents: content ? [content] : [], quantity: content ? 1 : 0 };
    db.data.stock.push(item);
    await db.write();

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.SUCCESS)
          .setTitle('✅ Item Created')
          .setDescription(`**${name}** has been added to the store.\nUse \`/addstock\` or \`!addstock\` to add more individual content entries (accounts, keys, etc.)`)
          .addFields(
            { name: '🏷️ Name',        value: name,              inline: true  },
            { name: '💰 Price',       value: price,             inline: true  },
            { name: '📊 Stock',       value: `${item.contents.length} entr${item.contents.length === 1 ? 'y' : 'ies'}`, inline: true },
            { name: '📝 Description', value: description || 'N/A', inline: false },
            { name: '🔑 ID',          value: `\`${item.id}\``,   inline: false },
          )
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
