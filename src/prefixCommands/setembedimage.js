const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { errorEmbed, successEmbed, hasAdminAccess, COLOR } = require('../helpers');

const VALID_KEYS = [
  'DEFAULT', 'ERROR', 'SUCCESS', 'INFO', 'STOCK', 'PAYMENTS', 'FEEDBACK', 'ORDERS', 'TICKET', 'BUY', 'HELP',
  'ITEM_ADDED', 'ITEM_REMOVED', 'ITEM_EDITED', 'PAYMENT_ADDED', 'PAYMENT_REMOVED',
  'PAYMENT_CHOICE', 'PAYMENT_INSTRUCTIONS', 'ORDER_PENDING', 'ORDER_DELIVERED', 'ORDER_REJECTED',
  'ORDER_CONFIRMED_ADMIN', 'ORDER_REJECTED_ADMIN',
];

function normalizeKey(key) {
  return String(key || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function envVarName(key) {
  return `EMBED_IMAGE_${normalizeKey(key)}`;
}

function writeEnvFile(key, url) {
  const envPath = path.join(__dirname, '..', '..', '.env');
  const envName = envVarName(key);
  let contents = '';

  if (fs.existsSync(envPath)) {
    contents = fs.readFileSync(envPath, 'utf8');
  }

  const lines = contents.split(/\r?\n/);
  const existingIndex = lines.findIndex((line) => line.trim().startsWith(`${envName}=`));
  const newLine = `${envName}=${url}`;

  if (existingIndex >= 0) {
    lines[existingIndex] = newLine;
  } else {
    lines.push(newLine);
  }

  const filtered = lines.filter((line, index) => line !== '' || index === lines.length - 1);
  fs.writeFileSync(envPath, filtered.join('\n') + '\n', 'utf8');
  process.env[envName] = url;
}

function buildValidKeysEmbed() {
  return new EmbedBuilder()
    .setTitle('🖼️ Embed Image Keys')
    .setColor(COLOR.PRIMARY)
    .setDescription('استخدم `!setembedimage <key> <url>` لتعيين صورة مخصصة لنوع الإيمبد هذا.')
    .addFields(
      { name: 'Valid keys', value: VALID_KEYS.join(', '), inline: false },
    )
    .setTimestamp();
}

module.exports = {
  name: 'setembedimage',
  description: 'Set the embed image URL for a specific embed type.',

  async execute(message, args) {
    if (!hasAdminAccess(message.author.id, message.member)) {
      return message.reply({ embeds: [errorEmbed('You need **Administrator** permission to use this command.')] });
    }

    const [rawKey, ...urlParts] = args;
    const key = normalizeKey(rawKey);

    if (!rawKey || rawKey.toLowerCase() === 'list') {
      return message.reply({ embeds: [buildValidKeysEmbed()] });
    }

    if (!VALID_KEYS.includes(key)) {
      return message.reply({ embeds: [errorEmbed('مفتاح غير صالح. استخدم `!setembedimage list` للاطلاع على المفاتيح المتاحة.')] });
    }

    const url = urlParts.join(' ').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return message.reply({ embeds: [errorEmbed('Please provide a valid image URL starting with http:// or https://.')] });
    }

    try {
      writeEnvFile(key, url);
      return message.reply({ embeds: [successEmbed('✅ Embed Image Set', `Saved ${envVarName(key)} to the bot environment.`)] });
    } catch (err) {
      return message.reply({ embeds: [errorEmbed('Failed to update .env file.')] });
    }
  },
};
