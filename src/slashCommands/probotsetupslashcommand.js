const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { errorEmbed, successEmbed, infoEmbed, COLOR } = require('../helpers');
const { testConnection, getUserBalance } = require('../probotAPI');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('probotsetup')
    .setDescription('Configure and test ProBot API integration')
    .addSubcommand(subcommand =>
      subcommand
        .setName('test')
        .setDescription('Test ProBot API connection')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('balance')
        .setDescription('Check a user\'s ProBot credit balance')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User to check balance for')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('guide')
        .setDescription('Show setup guide for ProBot API integration')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'test') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const isConnected = await testConnection();
      
      if (isConnected) {
        return await interaction.editReply({
          embeds: [successEmbed(
            '✅ ProBot API متصل',
            'تم الاتصال بـ ProBot API بنجاح. البوت يمكنه الآن رصد التحويلات تلقائياً.',
            interaction.user
          )]
        });
      } else {
        return await interaction.editReply({
          embeds: [errorEmbed(
            'فشل في الاتصال بـ ProBot API. تأكد من إعداد PROBOT_API_TOKEN و PROBOT_GUILD_ID في متغيرات البيئة.',
            interaction.user
          )]
        });
      }
    }

    if (subcommand === 'balance') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const user = interaction.options.getUser('user') || interaction.user;
      
      try {
        const balance = await getUserBalance(user.id);
        
        if (balance === null) {
          return await interaction.editReply({
            embeds: [errorEmbed(
              'فشل في الحصول على الرصيد. تأكد من إعداد ProBot API.',
              interaction.user
            )]
          });
        }

        return await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(COLOR.SUCCESS)
              .setTitle('💰 رصيد ProBot')
              .addFields(
                { name: 'المستخدم', value: `${user.tag}`, inline: true },
                { name: 'الرصيد', value: `${balance.toLocaleString()} كريدت`, inline: true }
              )
              .setTimestamp()
          ]
        });
      } catch (error) {
        return await interaction.editReply({
          embeds: [errorEmbed(
            `خطأ في جلب الرصيد: ${error.message}`,
            interaction.user
          )]
        });
      }
    }

    if (subcommand === 'guide') {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.PRIMARY)
            .setTitle('🔧 دليل إعداد ProBot API')
            .setDescription('اتبع هذه الخطوات لربط البوت مع ProBot API للحصول على رصد موثوق للتحويلات:')
            .addFields(
              {
                name: '1️⃣ الحصول على API Token',
                value: [
                  '• اذهب إلى [ProBot Dashboard](https://probot.io/dashboard)',
                  '• اختر السيرفر الخاص بك',
                  '• اذهب إلى قسم "API" أو "Developers"',
                  '• انشئ API Token جديد',
                  '• انسخ الـ Token'
                ].join('\n'),
                inline: false
              },
              {
                name: '2️⃣ تجهيز متغيرات البيئة',
                value: [
                  '```env',
                  'PROBOT_API_TOKEN=your_actual_token_here',
                  'PROBOT_GUILD_ID=your_server_id_here',
                  '```',
                  '**مهم:** ضع الـ Token الحقيقي ومعرف السيرفر'
                ].join('\n'),
                inline: false
              },
              {
                name: '3️⃣ إعادة تشغيل البوت',
                value: [
                  '• احفظ الإعدادات',
                  '• أعد تشغيل البوت',
                  '• اختبر الاتصال باستخدام `/probotsetup test`'
                ].join('\n'),
                inline: false
              },
              {
                name: '✨ المميزات بعد الإعداد',
                value: [
                  '🔍 رصد التحويلات في الوقت الحقيقي',
                  '⚡ لا حاجة لرصد رسائل ProBot',
                  '🎯 دقة 100% في اكتشاف التحويلات',
                  '📊 إمكانية جلب الأرصدة والمعاملات'
                ].join('\n'),
                inline: false
              }
            )
            .setFooter({ text: 'إذا واجهت مشاكل، تأكد من أن البوت مخول للوصول إلى ProBot API' })
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};