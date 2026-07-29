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
const { errorEmbed, successEmbed, COLOR } = require('../helpers');

const MAX_BUTTON_ITEMS = 25;

function splitEntries(content) {
  return content.split(/\r?\n|\s*\|\s*/).map((entry) => entry.trim()).filter(Boolean);
}

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

async function downloadFileContent(attachment) {
  try {
    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error('Failed to download file');
    const content = await response.text();
    return content;
  } catch (error) {
    throw new Error(`Failed to read file: ${error.message}`);
  }
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
    '🔸 **Manual Entry:** Choose an item below and enter account details in the modal',
    '🔸 **File Upload:** Use `/addstock id:<item_id> file:<accounts.txt>`',
    '🔸 **Direct Text:** Use `/addstock id:<item_id> content:<account_details>`',
    '',
    'Supported file formats: `.txt`, `.csv` - One account per line',
    items.length < db.data.stock.length ? `Only the first ${MAX_BUTTON_ITEMS} items are shown. Use the direct command for the rest.` : '',
  ].filter(Boolean).join('\n');

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR.PRIMARY)
        .setTitle('إدارة المخزون')
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

async function addStockEntries(interaction, itemId, content, quantity, isFromFile = false) {
  const db = await getDB();
  const item = db.data.stock.find((entry) => entry.id === itemId);

  if (!item) {
    return interaction.reply({ embeds: [errorEmbed(`No item found with ID \`${itemId}\`.`, interaction.user)], flags: MessageFlags.Ephemeral });
  }

  const entries = splitEntries(content);
  if (entries.length === 0) {
    return interaction.reply({ 
      embeds: [errorEmbed('No valid content found. Make sure your text or file contains account details.', interaction.user)], 
      flags: MessageFlags.Ephemeral 
    });
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    return interaction.reply({ 
      embeds: [errorEmbed('Quantity must be between 1 and 100.', interaction.user)], 
      flags: MessageFlags.Ephemeral 
    });
  }

  if (!Array.isArray(item.contents)) item.contents = [];
  item.contents.push(...entries.flatMap((entry) => Array(quantity).fill(entry)));
  item.quantity = item.contents.length;
  await db.write();

  const added = entries.length * quantity;
  const sourceText = isFromFile ? 'from uploaded file' : 'manually';
  
  return interaction.reply({
    embeds: [
      successEmbed(
        '✅ Stock Added Successfully',
        `Added **${added} entries** to **${item.name}** ${sourceText}\n\n` +
        `**Total Stock:** ${item.contents.length} entries\n` +
        `**Item ID:** \`${item.id}\``,
        interaction.user
      )
    ],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addstock')
    .setDescription('Add account entries to an item - via text, file upload, or interactive panel')
    .addStringOption((opt) =>
      opt.setName('id').setDescription('Item ID (leave empty to open the stock panel)').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('content')
        .setDescription('Account info; use one account per line for multiple accounts')
        .setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt.setName('file')
        .setDescription('Upload a .txt or .csv file containing account details (one per line)')
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
    if (!isAdmin(interaction)) {
      return interaction.reply({ 
        embeds: [errorEmbed('You need **Administrator** permission to add stock.', interaction.user)], 
        flags: MessageFlags.Ephemeral 
      });
    }

    const itemId     = interaction.options.getString('id');
    const content    = interaction.options.getString('content');
    const file       = interaction.options.getAttachment('file');
    const quantity   = interaction.options.getInteger('quantity') ?? 1;

    // If no parameters provided, show the stock panel
    if (!itemId && !content && !file) {
      return sendStockPanel(interaction);
    }

    // Validate that we have an item ID
    if (!itemId) {
      return interaction.reply({ 
        embeds: [errorEmbed('You must provide an `id` when adding content or uploading a file.', interaction.user)], 
        flags: MessageFlags.Ephemeral 
      });
    }

    // Handle file upload
    if (file) {
      // Validate file type
      const allowedTypes = ['.txt', '.csv'];
      const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      
      if (!allowedTypes.includes(fileExtension)) {
        return interaction.reply({
          embeds: [errorEmbed(`Invalid file type. Please upload a \`.txt\` or \`.csv\` file.\n\nUploaded: \`${file.name}\``, interaction.user)],
          flags: MessageFlags.Ephemeral,
        });
      }

      // Check file size (Discord limit is 8MB, but we'll be more conservative)
      if (file.size > 1024 * 1024) { // 1MB limit
        return interaction.reply({
          embeds: [errorEmbed('File too large. Please upload files smaller than 1MB.', interaction.user)],
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const fileContent = await downloadFileContent(file);
        
        if (!fileContent.trim()) {
          return interaction.editReply({
            embeds: [errorEmbed('The uploaded file is empty or contains no readable content.', interaction.user)],
          });
        }

        return addStockEntries(interaction, itemId, fileContent, quantity, true);
      } catch (error) {
        return interaction.editReply({
          embeds: [errorEmbed(`Failed to process file: ${error.message}`, interaction.user)],
        });
      }
    }

    // Handle text content
    if (content) {
      return addStockEntries(interaction, itemId, content, quantity, false);
    }

    // If we get here, something went wrong
    return interaction.reply({ 
      embeds: [errorEmbed('Please provide either `content` text or upload a `file` with account details.', interaction.user)], 
      flags: MessageFlags.Ephemeral 
    });
  },

  async handleButton(interaction) {
    if (!interaction.customId.startsWith('addstock_item_')) return;
    if (!isAdmin(interaction)) {
      return interaction.reply({ embeds: [errorEmbed('You need **Administrator** permission to add stock.', interaction.user)], flags: MessageFlags.Ephemeral });
    }

    const itemId = interaction.customId.slice('addstock_item_'.length);
    const db = await getDB();
    const item = db.data.stock.find((entry) => entry.id === itemId);
    if (!item) return interaction.reply({ embeds: [errorEmbed('That stock item no longer exists.', interaction.user)], flags: MessageFlags.Ephemeral });

    const modal = new ModalBuilder()
      .setCustomId(`addstock_modal_${itemId}`)
      .setTitle(`Add Stock: ${item.name}`.slice(0, 45))
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('content')
            .setLabel('Account info or key (one per line)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('email1:password1\nemail2:password2\nOR\nsteam_key_1\nsteam_key_2')
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
      return interaction.reply({ embeds: [errorEmbed('You need **Administrator** permission to add stock.', interaction.user)], flags: MessageFlags.Ephemeral });
    }

    const itemId = interaction.customId.slice('addstock_modal_'.length);
    const content = interaction.fields.getTextInputValue('content');
    const quantity = Number.parseInt(interaction.fields.getTextInputValue('quantity'), 10);
    return addStockEntries(interaction, itemId, content, quantity, false);
  },
};
