const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { listAvailableEmbeds, reloadEmbeds, getEmbed } = require('../dynamicEmbeds');
const { hasAdminAccess } = require('../helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embeds')
    .setDescription('Manage dynamic embeds system')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all available embeds')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('test')
        .setDescription('Test a specific embed')
        .addStringOption(option =>
          option
            .setName('file')
            .setDescription('Embed file name (e.g., shop, errors)')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Embed name within the file')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('variables')
            .setDescription('Variables in JSON format: {"key":"value"}')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('reload')
        .setDescription('Reload all embed files')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'reload' && !hasAdminAccess(interaction.user.id, interaction.member)) {
      return await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ صلاحيات غير كافية')
            .setDescription('تحتاج إلى صلاحية **Administrator** لاستخدام هذا الأمر.')
            .setColor('#ff4d6d')
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === 'list') {
      const embedsList = listAvailableEmbeds();
      
      if (Object.keys(embedsList).length === 0) {
        return await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('📋 لا توجد embeds')
              .setDescription('لم يتم العثور على أي ملفات embeds في مجلد `/embeds`')
              .setColor('#ffc857')
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      let description = '**📁 الملفات المتاحة:**\n\n';
      let totalEmbeds = 0;
      
      for (const [fileName, embeds] of Object.entries(embedsList)) {
        totalEmbeds += embeds.length;
        description += `**${fileName}.json** (${embeds.length} embeds)\n`;
        const embedNames = embeds.slice(0, 5).map(name => `\`${name}\``).join(', ');
        description += `└ ${embedNames}${embeds.length > 5 ? ` وأكثر...` : ''}\n\n`;
      }

      return await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('📋 قائمة Embeds المتاحة')
            .setDescription(description)
            .addFields(
              {
                name: '📊 الإحصائيات',
                value: `**${Object.keys(embedsList).length}** ملف\n**${totalEmbeds}** embed`,
                inline: true
              },
              {
                name: '🔧 الاستخدام',
                value: 'استخدم `/embeds test` لاختبار embed معين',
                inline: true
              }
            )
            .setColor('#7b61ff')
            .setTimestamp()
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    else if (subcommand === 'test') {
      const fileName = interaction.options.getString('file');
      const embedName = interaction.options.getString('name');
      const variablesStr = interaction.options.getString('variables');

      let variables = {};
      if (variablesStr) {
        try {
          variables = JSON.parse(variablesStr);
        } catch (error) {
          return await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle('❌ خطأ في المتغيرات')
                .setDescription('تنسيق JSON غير صحيح. مثال: `{"user":"<@123>","amount":"1000"}`')
                .setColor('#ff4d6d')
            ],
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      try {
        const testEmbed = getEmbed(fileName, embedName, variables, interaction.user);
        
        await interaction.reply({
          content: `🧪 **اختبار Embed:** \`${fileName}/${embedName}\``,
          embeds: [testEmbed],
          flags: MessageFlags.Ephemeral,
        });

      } catch (error) {
        return await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('❌ فشل في اختبار Embed')
              .setDescription(`لم يتم العثور على \`${embedName}\` في ملف \`${fileName}\``)
              .setColor('#ff4d6d')
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    else if (subcommand === 'reload') {
      try {
        const embeds = reloadEmbeds();
        const totalFiles = Object.keys(embeds).length;
        const totalEmbeds = Object.values(embeds).reduce((sum, file) => sum + Object.keys(file).length, 0);

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('🔄 تم إعادة تحميل Embeds')
              .setDescription([
                '✅ تم إعادة تحميل جميع ملفات Embeds بنجاح',
                '',
                `📁 **الملفات:** ${totalFiles}`,
                `📋 **Embeds:** ${totalEmbeds}`,
                '',
                '💡 يمكن الآن استخدام الـ embeds المحدثة في جميع الأوامر'
              ].join('\n'))
              .setColor('#2ecc71')
              .setTimestamp()
          ],
          flags: MessageFlags.Ephemeral,
        });

      } catch (error) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('❌ فشل في إعادة التحميل')
              .setDescription(`خطأ: ${error.message}`)
              .setColor('#ff4d6d')
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};