const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { errorEmbed, successEmbed, infoEmbed, COLOR } = require('../helpers');
const { getDB } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('probotid')
    .setDescription('إدارة معرف ProBot للسيرفر')
    .addSubcommand(subcommand =>
      subcommand
        .setName('get')
        .setDescription('عرض معرف ProBot الحالي')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('تعيين معرف ProBot جديد')
        .addStringOption(option =>
          option
            .setName('id')
            .setDescription('معرف ProBot (Discord ID)')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('حذف معرف ProBot المحفوظ')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('معلومات حول معرف ProBot وكيفية الحصول عليه')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    try {
      const db = await getDB();
      
      // Ensure config.probot exists
      if (!db.data.config.probot) {
        db.data.config.probot = {};
      }
      
      if (subcommand === 'get') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const currentId = db.data.config.probot.id;
        
        if (!currentId) {
          return await interaction.editReply({
            embeds: [infoEmbed(
              '📊 معرف ProBot',
              'لم يتم تعيين معرف ProBot بعد.\n\n**لتعيين معرف جديد:**\n`/probotid set`',
              interaction.user
            )]
          });
        }
        
        const updatedAt = db.data.config.probot.updatedAt;
        const updatedBy = db.data.config.probot.updatedBy;
        
        let description = `**المعرف المحفوظ:** \`${currentId}\``;
        
        if (updatedAt && updatedBy) {
          const user = await interaction.client.users.fetch(updatedBy).catch(() => null);
          const username = user ? user.tag : 'مستخدم محذوف';
          const date = new Date(updatedAt).toLocaleString('ar-SA');
          description += `\n\n**آخر تحديث:** ${date}\n**بواسطة:** ${username}`;
        }
        
        description += '\n\n**لتغيير المعرف:** `/probotid set`\n**لحذف المعرف:** `/probotid remove`';
        
        return await interaction.editReply({
          embeds: [successEmbed(
            '📊 معرف ProBot الحالي',
            description,
            interaction.user
          )]
        });
      }
      
      if (subcommand === 'set') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const newId = interaction.options.getString('id');
        
        // Validate ID format (Discord ID should be 17-19 digits)
        if (!/^\d{17,19}$/.test(newId)) {
          return await interaction.editReply({
            embeds: [errorEmbed(
              'معرف ProBot غير صحيح. يجب أن يكون معرف Discord صالح (17-19 رقم).\n\n**مثال صحيح:** `282859044593598464`\n\n**للحصول على معرف ProBot:** `/probotid info`',
              interaction.user
            )]
          });
        }
        
        const oldId = db.data.config.probot.id;
        db.data.config.probot.id = newId;
        db.data.config.probot.updatedAt = new Date().toISOString();
        db.data.config.probot.updatedBy = interaction.user.id;
        
        await db.write();
        
        const description = oldId 
          ? `تم تحديث معرف ProBot بنجاح!\n\n**المعرف السابق:** \`${oldId}\`\n**المعرف الجديد:** \`${newId}\``
          : `تم تعيين معرف ProBot بنجاح!\n\n**المعرف:** \`${newId}\``;
        
        return await interaction.editReply({
          embeds: [successEmbed(
            '✅ تم تحديث معرف ProBot',
            description + '\n\n**ملاحظة:** البوت الآن سيتعرف على رسائل ProBot من هذا المعرف.',
            interaction.user
          )]
        });
      }
      
      if (subcommand === 'remove') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const currentId = db.data.config.probot.id;
        
        if (!currentId) {
          return await interaction.editReply({
            embeds: [infoEmbed(
              '📊 معرف ProBot',
              'لا يوجد معرف ProBot محفوظ للحذف.',
              interaction.user
            )]
          });
        }
        
        delete db.data.config.probot.id;
        db.data.config.probot.removedAt = new Date().toISOString();
        db.data.config.probot.removedBy = interaction.user.id;
        
        await db.write();
        
        return await interaction.editReply({
          embeds: [successEmbed(
            '🗑️ تم حذف معرف ProBot',
            `تم حذف معرف ProBot (\`${currentId}\`) بنجاح.\n\nالبوت لن يتعرف على رسائل ProBot حتى يتم تعيين معرف جديد.`,
            interaction.user
          )]
        });
      }
      
      if (subcommand === 'info') {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(COLOR.INFO)
              .setTitle('ℹ️ معلومات حول معرف ProBot')
              .setDescription('معرف ProBot هو المعرف الفريد لبوت ProBot في Discord والذي يستخدمه البوت للتعرف على رسائل التحويلات.')
              .addFields(
                {
                  name: '🔍 كيفية الحصول على معرف ProBot',
                  value: [
                    '**الطريقة الأولى - من الملف الشخصي:**',
                    '• اضغط على ProBot بالزر الأيمن في قائمة الأعضاء',
                    '• اختر "Copy User ID"',
                    '• إذا لم تظهر هذه الخيارات، فعّل Developer Mode من إعدادات Discord',
                    '',
                    '**الطريقة الثانية - من رسالة ProBot:**',
                    '• ابحث عن أي رسالة من ProBot',
                    '• اضغط على اسم ProBot بالزر الأيمن',
                    '• اختر "Copy User ID"'
                  ].join('\n'),
                  inline: false
                },
                {
                  name: '⚙️ تفعيل Developer Mode',
                  value: [
                    '1. اذهب إلى إعدادات Discord',
                    '2. اختر "Advanced" أو "متقدم"',
                    '3. فعّل "Developer Mode"',
                    '4. الآن ستظهر خيارات "Copy ID" عند النقر بالزر الأيمن'
                  ].join('\n'),
                  inline: false
                },
                {
                  name: '📝 معرف ProBot الافتراضي',
                  value: [
                    'معرف ProBot الرسمي عادة هو:',
                    '`282859044593598464`',
                    '',
                    '**ملاحظة:** قد يكون مختلف إذا كنت تستخدم نسخة خاصة من ProBot'
                  ].join('\n'),
                  inline: false
                },
                {
                  name: '🎯 الفائدة من تعيين المعرف',
                  value: [
                    '✅ التعرف على رسائل التحويلات تلقائياً',
                    '✅ رصد دقيق للمدفوعات',
                    '✅ تجنب الرسائل الخاطئة من بوتات أخرى',
                    '✅ عمل البوت بشكل موثوق'
                  ].join('\n'),
                  inline: false
                }
              )
              .setFooter({ 
                text: 'بعد الحصول على المعرف، استخدم /probotid set لتعيينه' 
              })
          ],
          flags: MessageFlags.Ephemeral
        });
      }
      
    } catch (error) {
      console.error('Error in probotid slash command:', error);
      
      const errorReply = {
        embeds: [errorEmbed(
          `حدث خطأ أثناء معالجة الأمر: ${error.message}`,
          interaction.user
        )]
      };
      
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(errorReply);
      } else {
        await interaction.reply({ ...errorReply, flags: MessageFlags.Ephemeral });
      }
    }
  }
};