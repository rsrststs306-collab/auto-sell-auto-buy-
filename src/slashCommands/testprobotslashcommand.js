const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { errorEmbed, successEmbed, COLOR } = require('../helpers');
const { getProbotId, isMessageFromProbot } = require('../probotAPI');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testprobot')
    .setDescription('Test ProBot message detection - captures next ProBot message')
    .addIntegerOption(option =>
      option
        .setName('timeout')
        .setDescription('How long to wait for ProBot message (seconds)')
        .setRequired(false)
        .setMinValue(10)
        .setMaxValue(300)
    ),

  async execute(interaction) {
    const timeout = (interaction.options.getInteger('timeout') || 60) * 1000;
    
    // Get current ProBot ID
    const currentProbotId = await getProbotId();
    const displayId = currentProbotId || '282859044593598464 (افتراضي)';

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.PRIMARY)
          .setTitle('🔍 ProBot Message Capture')
          .setDescription([
            '**اختبار رصد رسائل البروبوت**',
            '',
            '🎯 البوت الآن في وضع الانتظار لرصد أي رسالة من ProBot',
            '📨 قم بإرسال أي أمر للبروبوت (مثل `#credits` أو `#daily`)',
            '⏰ المهلة الزمنية: ' + (timeout / 1000) + ' ثانية',
            '',
            `🤖 **ProBot ID المتوقع:** ${displayId}`,
            currentProbotId ? '' : '\n⚠️ **تحذير:** لم يتم تعيين معرف ProBot. استخدم `/probotid set` لتعيينه.'
          ].filter(Boolean).join('\n'))
          .setTimestamp()
      ],
      flags: MessageFlags.Ephemeral
    });

    console.log('\n🔍 ═══ PROBOT TEST MODE ACTIVATED ═══');
    console.log(`⏰ Waiting for ProBot message for ${timeout/1000} seconds...`);
    console.log(`🎯 Monitoring channel: ${interaction.channel.name} (${interaction.channel.id})`);
    console.log(`🤖 Expected ProBot ID: ${currentProbotId || 'Not configured (using default)'}`);

    try {
      const message = await interaction.channel.awaitMessages({
        filter: async (msg) => {
          console.log(`\n📨 Message from: ${msg.author.username} (${msg.author.id})`);
          
          const isProBot = await isMessageFromProbot(msg);
          console.log(`🤖 Is ProBot? ${isProBot ? '✅ YES' : '❌ NO'}`);
          
          if (isProBot) {
            console.log('🎉 PROBOT MESSAGE CAPTURED!');
            return true;
          }
          return false;
        },
        max: 1,
        time: timeout,
        errors: ['time'],
      });

      const probotMessage = message.first();
      
      console.log('\n🎯 ═══ DETAILED MESSAGE ANALYSIS ═══');
      console.log(`📅 Timestamp: ${probotMessage.createdAt.toISOString()}`);
      console.log(`👤 Author: ${probotMessage.author.username} (${probotMessage.author.id})`);
      console.log(`💬 Content: "${probotMessage.content}"`);
      console.log(`📎 Embeds Count: ${probotMessage.embeds.length}`);

      // Analyze embeds
      let embedAnalysis = '';
      if (probotMessage.embeds.length > 0) {
        embedAnalysis = '\n**📋 Embed Analysis:**\n';
        probotMessage.embeds.forEach((embed, i) => {
          embedAnalysis += `\n**Embed ${i + 1}:**\n`;
          if (embed.title) embedAnalysis += `• Title: "${embed.title}"\n`;
          if (embed.description) embedAnalysis += `• Description: "${embed.description}"\n`;
          if (embed.author?.name) embedAnalysis += `• Author: "${embed.author.name}"\n`;
          if (embed.footer?.text) embedAnalysis += `• Footer: "${embed.footer.text}"\n`;
          if (embed.color) embedAnalysis += `• Color: ${embed.color}\n`;
          if (embed.fields && embed.fields.length > 0) {
            embedAnalysis += `• Fields (${embed.fields.length}):\n`;
            embed.fields.forEach((field, j) => {
              embedAnalysis += `  ${j + 1}. **${field.name}**: ${field.value}\n`;
            });
          }
        });
      }

      // Create comprehensive analysis
      const fullText = [
        probotMessage.content,
        ...probotMessage.embeds.flatMap(e => [
          e.title, e.description, e.author?.name, e.footer?.text
        ].filter(Boolean)),
        ...probotMessage.embeds.flatMap(e => 
          e.fields?.map(f => `${f.name} ${f.value}`) || []
        )
      ].join(' ');

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.SUCCESS)
            .setTitle('✅ ProBot Message Captured!')
            .setDescription([
              '**تم رصد رسالة من ProBot بنجاح!**',
              '',
              `🕐 **الوقت:** ${probotMessage.createdAt.toLocaleString('ar-SA')}`,
              `👤 **المرسل:** ${probotMessage.author.username}`,
              `🆔 **User ID:** \`${probotMessage.author.id}\``,
              `💬 **المحتوى:** \`${probotMessage.content || 'فارغ'}\``,
              `📎 **عدد الـ Embeds:** ${probotMessage.embeds.length}`,
              embedAnalysis,
              '\n**🔍 النص الكامل للتحليل:**',
              `\`\`\`${fullText.substring(0, 1000)}${fullText.length > 1000 ? '...' : ''}\`\`\``
            ].join('\n'))
            .setFooter({ text: 'استخدم هذه المعلومات لفهم شكل رسائل ProBot' })
            .setTimestamp()
        ]
      });

      // Log to console for debugging
      console.log('\n📊 ═══ FULL TEXT ANALYSIS ═══');
      console.log(`Full Combined Text: "${fullText}"`);
      console.log(`Text Length: ${fullText.length} characters`);
      console.log('═══════════════════════════════════════\n');

    } catch (error) {
      await interaction.editReply({
        embeds: [errorEmbed(
          `لم يتم رصد أي رسالة من ProBot خلال ${timeout/1000} ثانية. تأكد من أن ProBot موجود في السيرفر وقم بإرسال أمر مثل \`#credits\`.`,
          interaction.user
        )]
      });
      
      console.log('\n❌ ProBot test timed out - no message received');
      console.log('═══════════════════════════════════════\n');
    }
  }
};