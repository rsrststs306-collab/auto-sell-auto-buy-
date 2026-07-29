require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Partials, MessageFlags } = require('discord.js');
const { errorEmbed, hasAdminAccess } = require('./src/helpers');
const { handleGuildCreate, handleButton: handleGuildControlButton, isGuildDisabled } = require('./src/guildControl');
const { createKeepAliveServer, setupExternalPing } = require('./keep-alive');
const fs   = require('fs');
const path = require('path');

// ── Validate required env ─────────────────────────────────────────────────
const TOKEN  = process.env.BOT_TOKEN;
const PREFIX = process.env.PREFIX || '!';
const ADMIN_COMMANDS = new Set([
  'additem',
  'addpayment',
  'addstock',
  'edititem',
  'removeitem',
  'removepayment',
  'ticketpanel',
  'orders',
]);

if (!TOKEN || TOKEN === 'YOUR_BOT_TOKEN_HERE') {
  console.error('❌ BOT_TOKEN is not set in .env');
  process.exit(1);
}

// ── Client ────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.slashCommands  = new Collection();
client.prefixCommands = new Collection();

// ── Load slash commands ───────────────────────────────────────────────────
const slashDir = path.join(__dirname, 'src', 'slashCommands');
fs.readdirSync(slashDir)
  .filter((f) => f.endsWith('.js'))
  .forEach((file) => {
    const cmd = require(path.join(slashDir, file));
    client.slashCommands.set(cmd.data.name, cmd);
  });

// ── Load prefix commands ──────────────────────────────────────────────────
const prefixDir = path.join(__dirname, 'src', 'prefixCommands');
fs.readdirSync(prefixDir)
  .filter((f) => f.endsWith('.js'))
  .forEach((file) => {
    const cmd = require(path.join(prefixDir, file));
    client.prefixCommands.set(cmd.name, cmd);
  });

// ── Ready ─────────────────────────────────────────────────────────────────
client.once('clientReady', async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`📦 Slash:  ${[...client.slashCommands.keys()].map((n) => `/${n}`).join(', ')}`);
  console.log(`⌨️  Prefix: ${[...client.prefixCommands.keys()].map((n) => `${PREFIX}${n}`).join(', ')}`);

  let watchingIndex = 0;
  const updatePresence = () => {
    const guilds = [...client.guilds.cache.values()];
    const serverName = guilds.length > 0
      ? guilds[watchingIndex % guilds.length].name.slice(0, 128)
      : 'no servers';

    c.user.setPresence({
      status: 'online',
      activities: [
        {
          name: 'dev:onlyzoro1',
          type: 1,
          url: 'https://twitch.tv/onlyzoro1',
        },
        {
          name: serverName,
          type: 3,
        },
      ],
    });

    watchingIndex += 1;
  };

  updatePresence();
  setInterval(updatePresence, 30_000);
});

client.on('guildCreate', async (guild) => {
  try {
    await handleGuildCreate(client, guild);
  } catch (err) {
    console.error(`Error logging joined guild ${guild.id}:`, err);
  }
});

// ── Slash commands + button interactions ─────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton() && interaction.customId.startsWith('guild_control_')) {
      return await handleGuildControlButton(interaction, client);
    }

    if (interaction.guild && await isGuildDisabled(interaction.guild.id)) {
      if (interaction.isRepliable()) {
        return await interaction.reply({
          embeds: [errorEmbed('The bot is disabled in this server.')],
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('feedback_')) {
      return await client.slashCommands.get('feedback')?.handleButton(interaction);
    }

    if (interaction.isButton() && interaction.customId.startsWith('addstock_item_')) {
      return await client.slashCommands.get('addstock')?.handleButton(interaction);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'feedback_modal') {
      return await client.slashCommands.get('feedback')?.handleModal(interaction);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('addstock_modal_')) {
      return await client.slashCommands.get('addstock')?.handleModal(interaction);
    }

    if (interaction.isButton() && (
      interaction.customId.startsWith('ticket_open_') ||
      interaction.customId === 'ticket_claim' ||
      interaction.customId === 'ticket_close'
    )) {
      return await client.slashCommands.get('ticketpanel')?.handleButton(interaction);
    }

    if (interaction.isButton() && interaction.customId.startsWith('copy_command_')) {
      // Handle copy command button
      const userId = interaction.customId.split('_')[2];
      if (interaction.user.id !== userId) {
        return await interaction.reply({
          embeds: [errorEmbed('هذا الزر مخصص للمشتري فقط.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      // Extract shop ID and amount from the embed
      const embed = interaction.message.embeds[0];
      if (!embed || !embed.description) {
        return await interaction.reply({
          embeds: [errorEmbed('لم يتم العثور على معلومات الأمر.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      // Extract command from code block
      const codeMatch = embed.description.match(/```\s*([^`]+)\s*```/);
      if (!codeMatch) {
        return await interaction.reply({
          embeds: [errorEmbed('لم يتم العثور على الأمر في الرسالة.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const command = codeMatch[1].trim();
      
      // Send the command as a message that can be easily copied
      await interaction.reply({
        content: `📋 **أمر التحويل:**\n\`${command}\`\n\n💡 **انسخ الأمر أعلاه وألصقه لإتمام الدفع**`,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const cmd = client.slashCommands.get(interaction.commandName);
    if (!cmd) return;

    if (ADMIN_COMMANDS.has(interaction.commandName) && !hasAdminAccess(interaction.user.id, interaction.member)) {
      return await interaction.reply({
        embeds: [errorEmbed('You need **Administrator** permission to use this command.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    await cmd.execute(interaction);
  } catch (err) {
    if (err?.code === 10062 || err?.rawError?.code === 10062) {
      console.warn('Interaction expired before the bot could respond.');
      return;
    }

    console.error('Error handling interaction:', err);
    const payload = {
      embeds: [errorEmbed('An unexpected error occurred. Please try again.')],
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

// ── Prefix commands ───────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  // Enhanced ProBot message logging for debugging
  if (message.author.id === process.env.ECONOMY_BOT_ID || message.author.id === '567703512763334685') {
    console.log('\n🔍 ═══ PROBOT MESSAGE DETECTED ═══');
    console.log(`📅 Time: ${new Date().toISOString()}`);
    console.log(`📍 Channel: ${message.channel.name} (${message.channel.id})`);
    console.log(`💬 Content: "${message.content}"`);
    
    if (message.embeds.length > 0) {
      console.log(`📎 Embeds (${message.embeds.length}):`);
      message.embeds.forEach((embed, i) => {
        console.log(`  📋 Embed ${i + 1}:`);
        if (embed.title) console.log(`    🏷️ Title: "${embed.title}"`);
        if (embed.description) console.log(`    📝 Description: "${embed.description}"`);
        if (embed.author?.name) console.log(`    👤 Author: "${embed.author.name}"`);
        if (embed.footer?.text) console.log(`    🔻 Footer: "${embed.footer.text}"`);
        if (embed.fields && embed.fields.length > 0) {
          console.log(`    📋 Fields (${embed.fields.length}):`);
          embed.fields.forEach((field, j) => {
            console.log(`      ${j + 1}. ${field.name}: ${field.value}`);
          });
        }
      });
    }
    
    // Check if this looks like a transfer message
    const fullText = [
      message.content,
      ...message.embeds.flatMap(e => [e.title, e.description, e.author?.name, e.footer?.text].filter(Boolean)),
      ...message.embeds.flatMap(e => e.fields?.map(f => `${f.name} ${f.value}`) || [])
    ].join(' ').toLowerCase();
    
    const hasTransferKeywords = ['transfer', 'sent', 'credits', 'تحويل', 'كريدت'].some(keyword => 
      fullText.includes(keyword.toLowerCase())
    );
    
    if (hasTransferKeywords) {
      console.log('🎯 POTENTIAL TRANSFER MESSAGE DETECTED!');
    }
    
    console.log('═══════════════════════════════════════\n');
  }

  // Let awaitMessages collectors see all messages — only skip our own bot's messages
  if (message.author.id === client.user?.id) return;
  // Only process prefix commands from non-bot users
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  if (message.guild && await isGuildDisabled(message.guild.id)) return;

  const args    = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmdName = args.shift().toLowerCase();

  const cmd = client.prefixCommands.get(cmdName);
  if (!cmd) return;

  try {
    if (ADMIN_COMMANDS.has(cmdName) && !hasAdminAccess(message.author.id, message.member)) {
      return await message.reply({
        embeds: [errorEmbed('You need **Administrator** permission to use this command.')],
      });
    }

    await cmd.execute(message, args);
  } catch (err) {
    console.error(`Error in ${PREFIX}${cmdName}:`, err);
    await message.reply({
      embeds: [errorEmbed('An unexpected error occurred. Please try again.')],
    }).catch(() => {});
  }
});

// ── Login ─────────────────────────────────────────────────────────────────
// Start keep-alive server for 24/7 hosting
createKeepAliveServer();
setupExternalPing();

client.login(TOKEN);
