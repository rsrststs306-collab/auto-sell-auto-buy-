const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Branding constants
const BRAND_TEXT = 'mxd market';
const BRAND_THEME_PREFIX = process.env.BRAND_THEME_PREFIX || ' dev:onlyZoro1';

// Cache for loaded embeds
let embedCache = {};
let lastLoadTime = 0;
const CACHE_DURATION = 30000; // 30 seconds

/**
 * Load all embed files from the embeds folder
 */
function loadEmbeds() {
  const now = Date.now();
  
  // Return cached embeds if still fresh
  if (now - lastLoadTime < CACHE_DURATION && Object.keys(embedCache).length > 0) {
    return embedCache;
  }

  console.log('🔄 Loading dynamic embeds...');
  embedCache = {};
  
  const embedsDir = path.join(__dirname, '..', 'embeds');
  
  if (!fs.existsSync(embedsDir)) {
    console.log('📁 Creating embeds directory...');
    fs.mkdirSync(embedsDir, { recursive: true });
    return embedCache;
  }

  try {
    const files = fs.readdirSync(embedsDir).filter(file => file.endsWith('.json'));
    
    for (const file of files) {
      try {
        const filePath = path.join(embedsDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const embedData = JSON.parse(fileContent);
        
        const fileName = path.basename(file, '.json');
        embedCache[fileName] = embedData;
        
        console.log(`✅ Loaded embeds from ${file}`);
      } catch (error) {
        console.error(`❌ Error loading embed file ${file}:`, error.message);
      }
    }
    
    lastLoadTime = now;
    console.log(`📋 Loaded ${Object.keys(embedCache).length} embed files with ${getTotalEmbedCount()} total embeds`);
    
  } catch (error) {
    console.error('❌ Error reading embeds directory:', error.message);
  }
  
  return embedCache;
}

/**
 * Get total count of embeds across all files
 */
function getTotalEmbedCount() {
  let count = 0;
  for (const file in embedCache) {
    count += Object.keys(embedCache[file]).length;
  }
  return count;
}

/**
 * Replace variables in text
 */
function replaceVariables(text, variables = {}) {
  if (typeof text !== 'string') return text;
  
  let result = text;
  
  // Replace custom variables
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, String(value || ''));
  }
  
  return result;
}

/**
 * Apply branding to embed
 */
function applyBranding(embed, user = null) {
  const footerText = embed.data?.footer?.text || '';
  const userText = user ? `Requested by ${user.username}` : '';
  
  // Set author to show the user who made the command
  const brandedEmbed = user 
    ? embed.setAuthor({ name: `${user.username}`, iconURL: user.displayAvatarURL() })
    : embed.setAuthor({ name: BRAND_TEXT });

  if (footerText) {
    const fullFooter = userText 
      ? `${footerText} • ${userText} • ${BRAND_THEME_PREFIX} • ${BRAND_TEXT}`
      : `${footerText} • ${BRAND_THEME_PREFIX} • ${BRAND_TEXT}`;
    
    return brandedEmbed.setFooter({
      text: footerText.includes(BRAND_TEXT) ? footerText : fullFooter,
    });
  }

  const baseFooter = userText 
    ? `${userText} • ${BRAND_THEME_PREFIX} • ${BRAND_TEXT}`
    : `${BRAND_THEME_PREFIX} • ${BRAND_TEXT}`;

  return brandedEmbed.setFooter({ text: baseFooter });
}

/**
 * Get an embed by file and name
 * @param {string} fileName - The JSON file name (without .json)
 * @param {string} embedName - The embed name within the file
 * @param {object} variables - Variables to replace in the embed
 * @param {object} user - Discord user for branding
 * @returns {EmbedBuilder} The built embed
 */
function getEmbed(fileName, embedName, variables = {}, user = null) {
  const embeds = loadEmbeds();
  
  if (!embeds[fileName]) {
    console.error(`❌ Embed file '${fileName}' not found. Available files:`, Object.keys(embeds));
    return createFallbackEmbed('Embed file not found', `File '${fileName}' not found`);
  }
  
  if (!embeds[fileName][embedName]) {
    console.error(`❌ Embed '${embedName}' not found in file '${fileName}'. Available embeds:`, Object.keys(embeds[fileName]));
    return createFallbackEmbed('Embed not found', `Embed '${embedName}' not found in '${fileName}'`);
  }
  
  const embedData = embeds[fileName][embedName];
  const embed = new EmbedBuilder();
  
  try {
    // Apply embed properties with variable replacement
    if (embedData.title) {
      embed.setTitle(replaceVariables(embedData.title, variables));
    }
    
    if (embedData.description) {
      embed.setDescription(replaceVariables(embedData.description, variables));
    }
    
    if (embedData.color) {
      embed.setColor(embedData.color);
    }
    
    if (embedData.fields && Array.isArray(embedData.fields)) {
      const fields = embedData.fields.map(field => ({
        name: replaceVariables(field.name, variables),
        value: replaceVariables(field.value, variables),
        inline: field.inline || false
      }));
      embed.addFields(fields);
    }
    
    if (embedData.footer) {
      embed.setFooter({
        text: replaceVariables(embedData.footer.text, variables),
        iconURL: embedData.footer.iconURL
      });
    }
    
    if (embedData.thumbnail) {
      embed.setThumbnail(replaceVariables(embedData.thumbnail.url, variables));
    }
    
    if (embedData.image) {
      embed.setImage(replaceVariables(embedData.image.url, variables));
    }
    
    if (embedData.timestamp) {
      embed.setTimestamp();
    }
    
    return applyBranding(embed, user);
    
  } catch (error) {
    console.error(`❌ Error building embed '${embedName}' from '${fileName}':`, error.message);
    return createFallbackEmbed('Embed Error', `Error building embed: ${error.message}`);
  }
}

/**
 * Create a fallback embed for errors
 */
function createFallbackEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(`❌ ${title}`)
    .setDescription(description)
    .setColor('#ff4d6d')
    .setTimestamp();
}

/**
 * Get a simple error embed
 */
function getErrorEmbed(message, user = null) {
  return getEmbed('errors', 'general', { message }, user);
}

/**
 * List all available embeds
 */
function listAvailableEmbeds() {
  const embeds = loadEmbeds();
  const list = {};
  
  for (const [fileName, fileEmbeds] of Object.entries(embeds)) {
    list[fileName] = Object.keys(fileEmbeds);
  }
  
  return list;
}

/**
 * Reload embeds (force refresh)
 */
function reloadEmbeds() {
  embedCache = {};
  lastLoadTime = 0;
  return loadEmbeds();
}

module.exports = {
  getEmbed,
  getErrorEmbed,
  listAvailableEmbeds,
  reloadEmbeds,
  loadEmbeds
};