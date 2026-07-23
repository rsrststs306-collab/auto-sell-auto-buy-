require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const token    = process.env.BOT_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId  = process.env.GUILD_ID;  // set this for instant registration

if (!token) {
  console.error('❌ BOT_TOKEN is not set in .env');
  process.exit(1);
}
if (!clientId) {
  console.error('❌ CLIENT_ID is not set in .env');
  process.exit(1);
}

// Load all slash command definitions
const commands = [];
const slashDir = path.join(__dirname, 'src', 'slashCommands');

fs.readdirSync(slashDir)
  .filter((f) => f.endsWith('.js'))
  .forEach((file) => {
    const cmd = require(path.join(slashDir, file));
    commands.push(cmd.data.toJSON());
    console.log(`  📌 Loaded: /${cmd.data.name}`);
  });

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    if (guildId) {
      // Guild registration = instant (appears in seconds)
      console.log(`\n🔄 Registering ${commands.length} command(s) to guild ${guildId} (instant)...`);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log('✅ Slash commands registered to guild instantly!');
    } else {
      // Global registration = up to 1 hour delay
      console.log(`\n🔄 Registering ${commands.length} command(s) globally (may take up to 1 hour)...`);
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log('✅ Slash commands registered globally!');
    }
  } catch (err) {
    console.error('❌ Failed to register commands:');
    console.error(err.message || err);
  }
})();
