const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getEmbed, getErrorEmbed, listAvailableEmbeds, reloadEmbeds } = require('../dynamicEmbeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embeds')
    .setDescription('Manage dynamic embeds')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all available embeds')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('test')
        .setDescription('Test an embed')
        .addStringOption(option =>
          option
            .setName('file')
            .setDescription('Embed file name (without .json)')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Embed name within the file')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('reload')
        .setDescription('Reload all embed files')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'list') {
      const availableEmbeds = listAvailableEmbeds();
      
      if (Object.keys(availableEmbeds).length === 0) {
        return await interaction.reply({
          embeds: [getErrorEmbed('No embed files found. Add JSON files to the /embeds folder.')],
          flags: MessageFlags.Ephemeral
        });
      }

      let description = '**📋 Available Embeds:**\n\n';
      
      for (const [fileName, embedNames] of Object.entries(availableEmbeds)) {
        description += `**📁 ${fileName}.json**\n`;
        for (const embedName of embedNames) {
          description += `  • \`${embedName}\`\n`;
        }
        description += '\n';
      }

      description += '**💡 Usage:** `/embeds test file:filename name:embedname`';

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🎨 Dynamic Embeds System')
            .setDescription(description)
            .setColor('#6c63ff')
            .addFields(
              {
                name: '📝 How to Add Embeds',
                value: '1. Create a `.json` file in the `embeds/` folder\n2. Add your embed definitions\n3. Use `/embeds reload` to refresh\n4. Test with `/embeds test`',
                inline: false
              },
              {
                name: '🔧 Variable Support',
                value: 'Use `{variable}` in your embeds for dynamic content:\n`{user}`, `{item}`, `{price}`, `{amount}`, etc.',
                inline: false
              }
            )
            .setTimestamp()
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    else if (subcommand === 'test') {
      const fileName = interaction.options.getString('file');
      const embedName = interaction.options.getString('name');

      try {
        const testEmbed = getEmbed(fileName, embedName, {
          user: `<@${interaction.user.id}>`,
          username: interaction.user.username,
          server: interaction.guild?.name || 'Test Server',
          channel: interaction.channel?.name || 'test-channel',
          item: 'Test Item',
          price: '500',
          amount: '500 credits',
          command: '#credit 123456789 500',
          shop: '<@123456789>',
          order: 'TEST123',
          content: 'Test content here',
          quantity: '10',
          count: '5'
        }, interaction.user);

        await interaction.reply({
          content: `🧪 **Testing embed:** \`${fileName}.json\` → \`${embedName}\``,
          embeds: [testEmbed],
          flags: MessageFlags.Ephemeral
        });
      } catch (error) {
        await interaction.reply({
          embeds: [getErrorEmbed(`Failed to test embed: ${error.message}`)],
          flags: MessageFlags.Ephemeral
        });
      }
    }

    else if (subcommand === 'reload') {
      try {
        const embedData = reloadEmbeds();
        const fileCount = Object.keys(embedData).length;
        let totalEmbeds = 0;
        
        for (const file in embedData) {
          totalEmbeds += Object.keys(embedData[file]).length;
        }

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('✅ Embeds Reloaded')
              .setDescription(`Successfully reloaded ${fileCount} files with ${totalEmbeds} embeds.`)
              .setColor('#2ecc71')
              .setTimestamp()
          ],
          flags: MessageFlags.Ephemeral
        });
      } catch (error) {
        await interaction.reply({
          embeds: [getErrorEmbed(`Failed to reload embeds: ${error.message}`)],
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};