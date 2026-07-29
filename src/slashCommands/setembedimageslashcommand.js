const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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
    .setDescription('استخدم `/setembedimage key url` لتعيين صورة مخصصة لنوع الإيمبد هذا.')
    .addFields(
      { name: 'Valid keys', value: VALID_KEYS.join(', '), inline: false },
    )
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setembedimage')
    .setDescription('تعيين رابط صورة الإيمبد لنوع محدد')
    .addStringOption((opt) =>
      opt.setName('key')
        .setDescription('اختر نوع الإيمبد الذي تريد تحديثه')
        .setRequired(true)
        .addChoices(
          { name: 'Default', value: 'DEFAULT' },
          { name: 'Error', value: 'ERROR' },
          { name: 'Success', value: 'SUCCESS' },
          { name: 'Info', value: 'INFO' },
          { name: 'Stock', value: 'STOCK' },
          { name: 'Payments', value: 'PAYMENTS' },
          { name: 'Feedback', value: 'FEEDBACK' },
          { name: 'Orders', value: 'ORDERS' },
          { name: 'Ticket', value: 'TICKET' },
          { name: 'Buy', value: 'BUY' },
          { name: 'Help', value: 'HELP' },
          { name: 'Item Added', value: 'ITEM_ADDED' },
          { name: 'Item Removed', value: 'ITEM_REMOVED' },
          { name: 'Item Edited', value: 'ITEM_EDITED' },
          { name: 'Payment Added', value: 'PAYMENT_ADDED' },
          { name: 'Payment Removed', value: 'PAYMENT_REMOVED' },
          { name: 'Payment Choice', value: 'PAYMENT_CHOICE' },
          { name: 'Payment Instructions', value: 'PAYMENT_INSTRUCTIONS' },
          { name: 'Order Pending', value: 'ORDER_PENDING' },
          { name: 'Order Delivered', value: 'ORDER_DELIVERED' },
          { name: 'Order Rejected', value: 'ORDER_REJECTED' },
          { name: 'Order Confirmed Admin', value: 'ORDER_CONFIRMED_ADMIN' },
          { name: 'Order Rejected Admin', value: 'ORDER_REJECTED_ADMIN' },
        )
    )
    .addStringOption((opt) =>
      opt.setName('url')
        .setDescription('رابط الصورة الذي سيستخدم للإيمبد')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [errorEmbed('This command can only be used in a server.')], ephemeral: true });
    }

    if (!hasAdminAccess(interaction.user.id, interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed('You need **Administrator** permission to use this command.')], ephemeral: true });
    }

    const rawKey = interaction.options.getString('key');
    const url = interaction.options.getString('url');
    const key = normalizeKey(rawKey);

    if (!rawKey || rawKey.toLowerCase() === 'list') {
      return interaction.reply({ embeds: [buildValidKeysEmbed()], ephemeral: true });
    }

    if (!VALID_KEYS.includes(key)) {
      return interaction.reply({ embeds: [errorEmbed('مفتاح غير صالح. استخدم `/setembedimage list` للاطلاع على المفاتيح المتاحة.')], ephemeral: true });
    }

    if (!url || !/^https?:\/\//i.test(url)) {
      return interaction.reply({ embeds: [errorEmbed('يرجى إدخال رابط صورة صالح يبدأ بـ http:// أو https://.')], ephemeral: true });
    }

    try {
      writeEnvFile(key, url);
      return interaction.reply({ embeds: [successEmbed('✅ Embed Image Set', `Saved ${envVarName(key)} to the bot environment.`)], ephemeral: true });
    } catch (err) {
      return interaction.reply({ embeds: [errorEmbed('Failed to update .env file.')], ephemeral: true });
    }
  },
};
