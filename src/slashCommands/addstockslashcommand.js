const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { getDB } = require('../database');
const { errorEmbed, COLOR } = require('../helpers');

const MAX_BUTTON_ITEMS = 25;

function splitEntries(content) {
  return content.split(/\r?\n|\s*\|\s*/).map((entry) => entry.trim()).filter(Boolean);
}

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

async function sendStockPanel(interaction) {
  const db = await getDB();
  const items = db.data.stock.slice(0, MAX_BUTTON_ITEMS);

  if (items.length === 0) {
    return interaction.reply({ embeds: [errorEmbed('No items exist yet. Create one with `/additem` first.')], flags: MessageFlags.Ephemeral });
  }

  const rows = [];
  for (let index = 0; index < items.length; index += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        items.slice(index, index + 5).map((item) =>
          new ButtonBuilder()
            .setCustomId(`addstock_item_${item.id}`)
            .setLabel(`Add: ${item.name}`.slice(0, 80))
            .setStyle(ButtonStyle.Primary)
        )
      )
    );
  }

  const description = [
    'Choose an item below to add account information, keys, or other content.',
    'Use one entry per line, or separate entries with `|`.',
    items.length < db.data.stock.length ? `Only the first ${MAX_BUTTON_ITEMS} items are shown. Use the direct command for the rest.` : '',
  ].filter(Boolean).join('\n');

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR.PRIMARY)
        .setTitle('📦 Stock Management')
        .setDescription(description)
        .addFields(items.map((item) => ({
          name: item.name,
          value: `${Array.isArray(item.contents) ? item.contents.length : 0} available • ID: \`${item.id}\``,
          inline: true,
        })))
        .setTimestamp(),
    ],
    components: rows,
    flags: MessageFlags.Ephemeral,
  });
}

async function addStockEntries(interaction, itemId, content, quantity) {
  const db = await getDB();
  const item = db.data.stock.find((entry) => entry.id === itemId);

  if (!item) {
    return interaction.reply({ embeds: [errorEmbed(`No item found with ID \`${itemId}\`.`)], flags: MessageFlags.Ephemeral });
  }

  const entries = splitEntries(content);
  if (entries.length === 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    return interaction.reply({ embeds: [errorEmbed('Enter valid content and a quantity from 1 to 100.')], flags: MessageFlags.Ephemeral });
  }

  if (!Array.isArray(item.contents)) item.contents = [];
  item.contents.push(...entries.flatMap((entry) => Array(quantity).fill(entry)));
  item.quantity = item.contents.length;
  await db.write();

  const added = entries.length * quantity;
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR.SUCCESS)
        .setTitle('✅ Stock Added')
        .addFields(
          { name: '🏷️ Item', value: item.name, inline: true },
          { name: '📦 Added', value: `${added} entr${added === 1 ? 'y' : 'ies'}`, inline: true },
          { name: '📊 Total Stock', value: `${item.contents.length} entries`, inline: true },
        )
        .setTimestamp(),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addstock')
    .setDescription('Open the stock panel or add account/key entries directly')
    .addStringOption((opt) =>
      opt.setName('id').setDescription('Item ID (leave empty to open the stock panel)').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('content')
        .setDescription('Account info; use one account per line for multiple accounts')
        .setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt.setName('quantity')
        .setDescription('How many copies to add (default: 1)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(false)
    ),

  async execute(interaction) {
    const itemId  = interaction.options.getString('id');
    const content = interaction.options.getString('content');
    const quantity = interaction.options.getInteger('quantity') ?? 1;

    if (!itemId && !content) return sendStockPanel(interaction);
    if (!itemId || !content) {
      return interaction.reply({ embeds: [errorEmbed('Provide both `id` and `content`, or leave both empty to open the stock panel.')], flags: MessageFlags.Ephemeral });
    }

    return addStockEntries(interaction, itemId, content, quantity);
  },

  async handleButton(interaction) {
    if (!interaction.customId.startsWith('addstock_item_')) return;
    if (!isAdmin(interaction)) {
      return interaction.reply({ embeds: [errorEmbed('You need **Administrator** permission to add stock.')], flags: MessageFlags.Ephemeral });
    }

    const itemId = interaction.customId.slice('addstock_item_'.length);
    const db = await getDB();
    const item = db.data.stock.find((entry) => entry.id === itemId);
    if (!item) return interaction.reply({ embeds: [errorEmbed('That stock item no longer exists.')], flags: MessageFlags.Ephemeral });

    const modal = new ModalBuilder()
      .setCustomId(`addstock_modal_${itemId}`)
      .setTitle(`Add Stock: ${item.name}`.slice(0, 45))
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('content')
            .setLabel('Account info or key (one per line)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('email1:password1\nemail2:password2')
            .setRequired(true)
            .setMaxLength(4000)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('quantity')
            .setLabel('Copies per entry (1-100)')
            .setStyle(TextInputStyle.Short)
            .setValue('1')
            .setRequired(true)
            .setMaxLength(3)
        )
      );

    return interaction.showModal(modal);
  },

  async handleModal(interaction) {
    if (!interaction.customId.startsWith('addstock_modal_')) return;
    if (!isAdmin(interaction)) {
      return interaction.reply({ embeds: [errorEmbed('You need **Administrator** permission to add stock.')], flags: MessageFlags.Ephemeral });
    }

    const itemId = interaction.customId.slice('addstock_modal_'.length);
    const content = interaction.fields.getTextInputValue('content');
    const quantity = Number.parseInt(interaction.fields.getTextInputValue('quantity'), 10);
    return addStockEntries(interaction, itemId, content, quantity);
  },
};
