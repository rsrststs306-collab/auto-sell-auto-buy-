const { successEmbed, errorEmbed, infoEmbed } = require('../helpers');
const { getDB } = require('../database');

module.exports = {
  name: 'probotid',
  description: 'إدارة معرف ProBot للسيرفر',
  usage: '!probotid [set <id> | get | remove]',
  aliases: ['pbot', 'pid'],
  
  async execute(message, args) {
    try {
      const db = await getDB();
      
      // Ensure config.probot exists
      if (!db.data.config.probot) {
        db.data.config.probot = {};
      }
      
      const subcommand = args[0]?.toLowerCase();
      
      if (!subcommand || subcommand === 'get') {
        // Show current ProBot ID
        const currentId = db.data.config.probot.id;
        
        if (!currentId) {
          return message.reply({
            embeds: [infoEmbed(
              '📊 معرف ProBot',
              'لم يتم تعيين معرف ProBot بعد.\n\n**لتعيين معرف جديد:**\n`!probotid set <probot_id>`',
              message.author
            )]
          });
        }
        
        return message.reply({
          embeds: [successEmbed(
            '📊 معرف ProBot الحالي',
            `**المعرف المحفوظ:** \`${currentId}\`\n\n**لتغيير المعرف:**\n\`!probotid set <new_id>\`\n**لحذف المعرف:**\n\`!probotid remove\``,
            message.author
          )]
        });
      }
      
      if (subcommand === 'set') {
        const newId = args[1];
        
        if (!newId) {
          return message.reply({
            embeds: [errorEmbed(
              'يرجى تقديم معرف ProBot.\n\n**الاستخدام:** `!probotid set <probot_id>`\n**مثال:** `!probotid set 282859044593598464`',
              message.author
            )]
          });
        }
        
        // Validate ID format (Discord ID should be 17-19 digits)
        if (!/^\d{17,19}$/.test(newId)) {
          return message.reply({
            embeds: [errorEmbed(
              'معرف ProBot غير صحيح. يجب أن يكون معرف Discord صالح (17-19 رقم).\n\n**مثال صحيح:** `282859044593598464`',
              message.author
            )]
          });
        }
        
        const oldId = db.data.config.probot.id;
        db.data.config.probot.id = newId;
        db.data.config.probot.updatedAt = new Date().toISOString();
        db.data.config.probot.updatedBy = message.author.id;
        
        await db.write();
        
        const description = oldId 
          ? `تم تحديث معرف ProBot بنجاح!\n\n**المعرف السابق:** \`${oldId}\`\n**المعرف الجديد:** \`${newId}\``
          : `تم تعيين معرف ProBot بنجاح!\n\n**المعرف:** \`${newId}\``;
        
        return message.reply({
          embeds: [successEmbed(
            '✅ تم تحديث معرف ProBot',
            description + '\n\n**ملاحظة:** البوت الآن سيتعرف على رسائل ProBot من هذا المعرف.',
            message.author
          )]
        });
      }
      
      if (subcommand === 'remove' || subcommand === 'delete') {
        const currentId = db.data.config.probot.id;
        
        if (!currentId) {
          return message.reply({
            embeds: [infoEmbed(
              '📊 معرف ProBot',
              'لا يوجد معرف ProBot محفوظ للحذف.',
              message.author
            )]
          });
        }
        
        delete db.data.config.probot.id;
        db.data.config.probot.removedAt = new Date().toISOString();
        db.data.config.probot.removedBy = message.author.id;
        
        await db.write();
        
        return message.reply({
          embeds: [successEmbed(
            '🗑️ تم حذف معرف ProBot',
            `تم حذف معرف ProBot (\`${currentId}\`) بنجاح.\n\nالبوت لن يتعرف على رسائل ProBot حتى يتم تعيين معرف جديد.`,
            message.author
          )]
        });
      }
      
      // Invalid subcommand
      return message.reply({
        embeds: [errorEmbed(
          `أمر فرعي غير صحيح: \`${subcommand}\`\n\n**الأوامر المتاحة:**\n\`!probotid get\` - عرض المعرف الحالي\n\`!probotid set <id>\` - تعيين معرف جديد\n\`!probotid remove\` - حذف المعرف`,
          message.author
        )]
      });
      
    } catch (error) {
      console.error('Error in probotid command:', error);
      return message.reply({
        embeds: [errorEmbed(
          `حدث خطأ أثناء معالجة الأمر: ${error.message}`,
          message.author
        )]
      });
    }
  }
};