const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getDB } = require('../database');
const { errorEmbed, infoEmbed, successEmbed, COLOR, hasAdminAccess } = require('../helpers');

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

module.exports = {
  name: 'addstock',
  description: 'Add stock in bulk via text or file upload. Usage: !addstock <itemId> [quantity] <content> OR attach a .txt/.csv file',

  async execute(message, args) {
    if (!hasAdminAccess(message.author.id, message.member)) {
      return message.reply({ embeds: [errorEmbed('You need **Administrator** permission.', message.author)] });
    }

    // Check for file attachments first
    const attachments = message.attachments;
    const textFile = attachments.find(att => {
      const ext = att.name.toLowerCase().substring(att.name.lastIndexOf('.'));
      return ['.txt', '.csv'].includes(ext);
    });

    if (textFile) {
      // Handle file upload
      return await handleFileUpload(message, args, textFile);
    }

    // Handle text-based content
    return await handleTextContent(message, args);
  },
};

async function handleFileUpload(message, args, file) {
  const [itemId, quantityArg] = args;
  const quantity = Number.parseInt(quantityArg, 10) || 1;

  if (!itemId) {
    return message.reply({
      embeds: [errorEmbed('Please provide an item ID when uploading a file.\n\nUsage: `!addstock <itemId> [quantity]` + attach file', message.author)],
    });
  }

  if (quantity < 1 || quantity > 100) {
    return message.reply({
      embeds: [errorEmbed('Quantity must be between 1 and 100.', message.author)],
    });
  }

  // Check file size (1MB limit)
  if (file.size > 1024 * 1024) {
    return message.reply({
      embeds: [errorEmbed('File too large. Please upload files smaller than 1MB.', message.author)],
    });
  }

  try {
    const fileContent = await downloadFileContent(file);
    
    if (!fileContent.trim()) {
      return message.reply({
        embeds: [errorEmbed('The uploaded file is empty or contains no readable content.', message.author)],
      });
    }

    const db = await getDB();
    const item = db.data.stock.find((i) => i.id === itemId);

    if (!item) {
      return message.reply({ embeds: [errorEmbed(`No item found with ID \`${itemId}\`.`, message.author)] });
    }

    // Handle different item types
    const itemType = item.type || 'account';
    let entries;
    
    if (itemType === 'cookies') {
      // For cookies, treat the entire content as one entry
      entries = [fileContent.trim()].filter(Boolean);
    } else {
      // For accounts, split by lines as before
      entries = fileContent.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
    }
    
    if (entries.length === 0) {
      return message.reply({
        embeds: [errorEmbed('No valid account entries found in the file.', message.author)],
      });
    }

    if (!Array.isArray(item.contents)) item.contents = [];
    item.contents.push(...entries.flatMap((entry) => Array(quantity).fill(entry)));
    item.quantity = item.contents.length;
    await db.write();

    // Delete the command message to keep content private
    message.delete().catch(() => {});

    const added = entries.length * quantity;
    const typeText = (item.type === 'cookies') ? 'cookie set(s)' : 'account(s)';
    await message.channel.send({
      embeds: [
        successEmbed(
          '✅ Stock Added from File',
          `Successfully added **${added} ${typeText}** to **${item.name}** from \`${file.name}\`\n\n` +
          `**Item Type:** ${item.type === 'cookies' ? '🍪 Cookies' : '👤 Accounts'}\n` +
          `**Total Stock:** ${item.contents.length} entries\n` +
          `**File Size:** ${(file.size / 1024).toFixed(2)} KB`,
          message.author
        )
      ],
    });

  } catch (error) {
    return message.reply({
      embeds: [errorEmbed(`Failed to process file: ${error.message}`, message.author)],
    });
  }
}

async function handleTextContent(message, args) {
  const [itemId, quantityOrContent, ...rest] = args;
  const parsedQuantity = Number.parseInt(quantityOrContent, 10);
  const quantity = Number.isInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;
  const contentParts = Number.isInteger(parsedQuantity) && parsedQuantity > 0 ? rest : [quantityOrContent, ...rest];
  const content = contentParts.join(' ').trim();

  const db = await getDB();
  const item = db.data.stock.find((i) => i.id === itemId);

  if (!item) {
    return message.reply({ embeds: [errorEmbed(`No item found with ID \`${itemId}\`.`, message.author)] });
  }

  // Handle different item types
  const itemType = item.type || 'account';
  let entries;
  
  if (itemType === 'cookies') {
    // For cookies, treat the entire content as one entry
    entries = [content].filter(Boolean);
  } else {
    // For accounts, split by lines or pipes as before
    entries = content.split(/\r?\n|\s*\|\s*/).map((entry) => entry.trim()).filter(Boolean);
  }

  if (!itemId || entries.length === 0 || quantity > 100) {
    const itemTypeText = item ? (item.type === 'cookies' ? 'cookies' : 'accounts') : 'content';
    return message.reply({
      embeds: [
        infoEmbed(
          '📋 Usage',
          '**Text Method:**\n' +
          '`!addstock <itemId> [quantity] <content>`\n\n' +
          '**File Method:**\n' +
          '`!addstock <itemId> [quantity]` + attach .txt/.csv file\n\n' +
          '**Item Types:**\n' +
          '👤 **Accounts:** Separate with `|` or new lines\n' +
          '🍪 **Cookies:** Paste entire cookie data as one block\n\n' +
          '**Examples:**\n' +
          '`!addstock abc123 email@example.com:password123`\n' +
          '`!addstock abc123 email1:pass1 | email2:pass2` (accounts)\n' +
          '`!addstock abc123 [cookie data here]` (cookies)\n' +
          '`!addstock abc123 10 email@example.com:password123`\n\n' +
          '> Quantity can be 1–100.',
          message.author
        ),
      ],
    });
  }

  if (!item) {
    return message.reply({ embeds: [errorEmbed(`No item found with ID \`${itemId}\`.`, message.author)] });
  }

  if (!Array.isArray(item.contents)) item.contents = [];
  item.contents.push(...entries.flatMap((entry) => Array(quantity).fill(entry)));
  item.quantity = item.contents.length;
  await db.write();

  // Delete the command message to keep content private
  message.delete().catch(() => {});

  const added = entries.length * quantity;
  const typeText = (item.type === 'cookies') ? 'cookie set(s)' : 'account(s)';
  await message.channel.send({
    embeds: [
      successEmbed(
        '✅ Stock Added',
        `Successfully added **${added} ${typeText}** to **${item.name}**\n\n` +
        `**Item Type:** ${item.type === 'cookies' ? '🍪 Cookies' : '👤 Accounts'}\n` +
        `**Total Stock:** ${item.contents.length} entries`,
        message.author
      )
    ],
  });
}
