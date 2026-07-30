const { SlashCommandBuilder, EmbedBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const { getErrorEmbed } = require('../helpers');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('extractembeds')
    .setDescription('Extract embeds from bot code files and convert to JSON format')
    .addSubcommand(subcommand =>
      subcommand
        .setName('file')
        .setDescription('Extract embeds from a specific file')
        .addAttachmentOption(option =>
          option
            .setName('botfile')
            .setDescription('Upload a bot file (.js) to extract embeds from')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('text')
        .setDescription('Extract embeds from pasted code')
        .addStringOption(option =>
          option
            .setName('code')
            .setDescription('Paste the bot code containing embeds')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'file') {
      const attachment = interaction.options.getAttachment('botfile');
      
      if (!attachment.name.endsWith('.js') && !attachment.name.endsWith('.ts')) {
        return await interaction.reply({
          embeds: [getErrorEmbed('يجب أن يكون الملف من نوع .js أو .ts')],
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        // Download the file content
        const response = await fetch(attachment.url);
        const fileContent = await response.text();
        
        const extractedEmbeds = extractEmbedsFromCode(fileContent, attachment.name);
        await sendExtractedEmbeds(interaction, extractedEmbeds, attachment.name);
        
      } catch (error) {
        await interaction.editReply({
          embeds: [getErrorEmbed(`خطأ في قراءة الملف: ${error.message}`)]
        });
      }
    }
    
    else if (subcommand === 'text') {
      const code = interaction.options.getString('code');
      
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      try {
        const extractedEmbeds = extractEmbedsFromCode(code, 'pasted-code');
        await sendExtractedEmbeds(interaction, extractedEmbeds, 'pasted-code');
        
      } catch (error) {
        await interaction.editReply({
          embeds: [getErrorEmbed(`خطأ في معالجة الكود: ${error.message}`)]
        });
      }
    }
  }
};

/**
 * Extract embed definitions from JavaScript/TypeScript code
 */
function extractEmbedsFromCode(code, fileName) {
  const embeds = {};
  let embedCounter = 1;
  
  // Patterns to match different embed creation styles
  const patterns = [
    // new EmbedBuilder() patterns
    /new\s+EmbedBuilder\(\)\s*((?:\.[\w\s\(\)'"`,\[\]\{\}:\n\r\t\\\/\-\.\!\@\#\$\%\^\&\*\+\=\|\?\<\>]+)*)/g,
    
    // EmbedBuilder.from() patterns  
    /EmbedBuilder\.from\([^)]+\)\s*((?:\.[\w\s\(\)'"`,\[\]\{\}:\n\r\t\\\/\-\.\!\@\#\$\%\^\&\*\+\=\|\?\<\>]+)*)/g,
    
    // Direct embed objects
    /embeds?\s*:\s*\[\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g,
    
    // MessageEmbed (legacy)
    /new\s+MessageEmbed\(\)\s*((?:\.[\w\s\(\)'"`,\[\]\{\}:\n\r\t\\\/\-\.\!\@\#\$\%\^\&\*\+\=\|\?\<\>]+)*)/g
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      try {
        const embedCode = match[0];
        const embedData = parseEmbedFromCode(embedCode);
        
        if (embedData && Object.keys(embedData).length > 0) {
          const embedName = generateEmbedName(embedCode, embedCounter);
          embeds[embedName] = embedData;
          embedCounter++;
        }
      } catch (error) {
        console.error('Error parsing embed:', error.message);
      }
    }
  });
  
  return embeds;
}

/**
 * Parse embed properties from code string
 */
function parseEmbedFromCode(embedCode) {
  const embedData = {};
  
  // Extract title
  const titleMatch = embedCode.match(/\.setTitle\(\s*['"`]([^'"`]*?)['"`]\s*\)/);
  if (titleMatch) {
    embedData.title = cleanString(titleMatch[1]);
  }
  
  // Extract description
  const descMatch = embedCode.match(/\.setDescription\(\s*['"`]([^'"`]*?)['"`]\s*\)/);
  if (descMatch) {
    embedData.description = cleanString(descMatch[1]);
  }
  
  // Extract color
  const colorMatch = embedCode.match(/\.setColor\(\s*['"`]?([^'"`\)]*?)['"`]?\s*\)/);
  if (colorMatch) {
    let color = colorMatch[1].trim();
    if (color.startsWith('0x')) {
      color = '#' + color.slice(2);
    } else if (color.match(/^\d+$/)) {
      color = '#' + parseInt(color).toString(16).padStart(6, '0');
    }
    embedData.color = color;
  }
  
  // Extract footer
  const footerMatch = embedCode.match(/\.setFooter\(\s*\{[^}]*text\s*:\s*['"`]([^'"`]*?)['"`][^}]*\}/);
  if (footerMatch) {
    embedData.footer = { text: cleanString(footerMatch[1]) };
  }
  
  // Extract thumbnail
  const thumbnailMatch = embedCode.match(/\.setThumbnail\(\s*['"`]([^'"`]*?)['"`]\s*\)/);
  if (thumbnailMatch) {
    embedData.thumbnail = { url: cleanString(thumbnailMatch[1]) };
  }
  
  // Extract image
  const imageMatch = embedCode.match(/\.setImage\(\s*['"`]([^'"`]*?)['"`]\s*\)/);
  if (imageMatch) {
    embedData.image = { url: cleanString(imageMatch[1]) };
  }
  
  // Extract fields
  const fieldsMatches = embedCode.matchAll(/\.addFields?\(\s*(\{[^}]+\}(?:\s*,\s*\{[^}]+\})*)/g);
  const fields = [];
  
  for (const fieldMatch of fieldsMatches) {
    const fieldContent = fieldMatch[1];
    const fieldObjects = fieldContent.match(/\{[^}]+\}/g) || [];
    
    for (const fieldObj of fieldObjects) {
      const nameMatch = fieldObj.match(/name\s*:\s*['"`]([^'"`]*?)['"`]/);
      const valueMatch = fieldObj.match(/value\s*:\s*['"`]([^'"`]*?)['"`]/);
      const inlineMatch = fieldObj.match(/inline\s*:\s*(true|false)/);
      
      if (nameMatch && valueMatch) {
        fields.push({
          name: cleanString(nameMatch[1]),
          value: cleanString(valueMatch[1]),
          inline: inlineMatch ? inlineMatch[1] === 'true' : false
        });
      }
    }
  }
  
  if (fields.length > 0) {
    embedData.fields = fields;
  }
  
  // Check for timestamp
  if (embedCode.includes('.setTimestamp()')) {
    embedData.timestamp = true;
  }
  
  return embedData;
}

/**
 * Clean and preserve special characters in strings
 */
function cleanString(str) {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/**
 * Generate a meaningful embed name from code context
 */
function generateEmbedName(embedCode, counter) {
  // Look for common patterns to determine embed type
  const code = embedCode.toLowerCase();
  
  if (code.includes('error') || code.includes('❌')) return `error_${counter}`;
  if (code.includes('success') || code.includes('✅')) return `success_${counter}`;
  if (code.includes('warning') || code.includes('⚠️')) return `warning_${counter}`;
  if (code.includes('help') || code.includes('📜')) return `help_${counter}`;
  if (code.includes('stock') || code.includes('🛒')) return `stock_${counter}`;
  if (code.includes('payment') || code.includes('💳')) return `payment_${counter}`;
  if (code.includes('buy') || code.includes('purchase')) return `buy_${counter}`;
  if (code.includes('welcome') || code.includes('🎉')) return `welcome_${counter}`;
  if (code.includes('info') || code.includes('ℹ️')) return `info_${counter}`;
  
  return `embed_${counter}`;
}

/**
 * Send extracted embeds to user
 */
async function sendExtractedEmbeds(interaction, embeds, fileName) {
  const embedCount = Object.keys(embeds).length;
  
  if (embedCount === 0) {
    return await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('❌ لم يتم العثور على embeds')
          .setDescription('لم يتم العثور على أي embeds في الكود المرفوع.')
          .setColor('#ff4d6d')
      ]
    });
  }
  
  // Create JSON file
  const jsonContent = JSON.stringify(embeds, null, 2);
  const jsonFileName = `extracted_embeds_${fileName.replace(/\.[^.]+$/, '')}.json`;
  
  // Create attachment
  const attachment = new AttachmentBuilder(Buffer.from(jsonContent, 'utf8'), { name: jsonFileName });
  
  // Create preview embed
  let previewText = '';
  let previewCount = 0;
  
  for (const [name, embed] of Object.entries(embeds)) {
    if (previewCount >= 5) {
      previewText += `\n... والمزيد (${embedCount - previewCount} embeds)`;
      break;
    }
    
    previewText += `\n**${name}:**`;
    if (embed.title) previewText += `\n  📝 ${embed.title.substring(0, 50)}${embed.title.length > 50 ? '...' : ''}`;
    if (embed.description) previewText += `\n  📄 ${embed.description.substring(0, 80)}${embed.description.length > 80 ? '...' : ''}`;
    if (embed.color) previewText += `\n  🎨 ${embed.color}`;
    
    previewCount++;
  }
  
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle('✅ تم استخراج Embeds بنجاح!')
        .setDescription([
          `🎯 **تم العثور على ${embedCount} embed**`,
          `📁 **من الملف:** ${fileName}`,
          '',
          '**📋 معاينة Embeds المستخرجة:**',
          previewText,
          '',
          '💾 **الملف المرفق يحتوي على:**',
          '• جميع الـ embeds بصيغة JSON',
          '• الألوان والرموز التعبيرية محفوظة',
          '• جاهز للاستخدام في نظام Dynamic Embeds'
        ].join('\n'))
        .setColor('#2ecc71')
        .addFields(
          {
            name: '🚀 كيفية الاستخدام',
            value: [
              '1. احفظ الملف المرفق في مجلد `embeds/`',
              '2. استخدم `/embeds reload` لتحديث النظام',
              '3. جرب `/embeds list` لرؤية Embeds الجديدة',
              '4. استخدم `/embeds test` لاختبار أي embed'
            ].join('\n'),
            inline: false
          }
        )
        .setFooter({ text: 'Dynamic Embeds System - Automatic Extraction' })
        .setTimestamp()
    ],
    files: [attachment]
  });
}