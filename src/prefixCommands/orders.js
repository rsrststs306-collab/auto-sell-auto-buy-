const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getDB } = require('../database');
const { errorEmbed, COLOR, hasAdminAccess } = require('../helpers');

module.exports = {
  name: 'orders',
  description: 'View recent orders. Usage: !orders [all|pending|delivered]',

  async execute(message, args) {
    if (!hasAdminAccess(message.author.id, message.member)) {
      return message.reply({ embeds: [errorEmbed('You need **Administrator** permission.')] });
    }

    const db     = await getDB();
    const filter = (args[0] || 'all').toLowerCase();

    let orders = db.data.orders;
    if (filter !== 'all') {
      orders = orders.filter((o) => o.status === filter);
    }

    // Show latest 10
    const recent = orders.slice(-10).reverse();

    if (recent.length === 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.PRIMARY)
            .setTitle('📋 Orders')
            .setDescription(`No orders found${filter !== 'all' ? ` with status **${filter}**` : ''}.`),
        ],
      });
    }

    const embed = new EmbedBuilder()
      .setColor(COLOR.PRIMARY)
      .setTitle(`📋 Orders — ${filter === 'all' ? 'Recent 10' : filter}`)
      .setFooter({ text: `Total: ${orders.length} order(s)` })
      .setTimestamp();

    for (const order of recent) {
      const item = db.data.stock.find((i) => i.id === order.itemId);
      const statusIcon = order.status === 'delivered' ? '✅' : order.status === 'rejected' ? '❌' : '⏳';
      embed.addFields({
        name: `${statusIcon} ${order.id}`,
        value: [
          `👤 **Buyer:** ${order.userTag} (<@${order.userId}>)`,
          `🏷️ **Item:** ${item ? item.name : `deleted (${order.itemId})`}`,
          `📊 **Status:** ${order.status}`,
          `🕐 **Date:** <t:${Math.floor(new Date(order.createdAt).getTime() / 1000)}:R>`,
        ].join('\n'),
        inline: false,
      });
    }

    await message.reply({ embeds: [embed] });
  },
};
