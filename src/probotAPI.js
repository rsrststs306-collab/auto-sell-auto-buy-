const https = require('https');
const { getDB } = require('./database');

// ProBot API configuration
const PROBOT_API_TOKEN = process.env.PROBOT_API_TOKEN;
const PROBOT_GUILD_ID = process.env.PROBOT_GUILD_ID;
const PROBOT_API_BASE = 'https://probot.io/api';

/**
 * Get ProBot ID from database configuration
 * @returns {Promise<string|null>} ProBot ID or null if not configured
 */
async function getProbotId() {
  try {
    const db = await getDB();
    return db.data?.config?.probot?.id || null;
  } catch (error) {
    console.error('Error getting ProBot ID from database:', error);
    return null;
  }
}

/**
 * Check if a message is from ProBot based on stored configuration
 * @param {Message} message - Discord message object
 * @returns {Promise<boolean>} True if message is from configured ProBot
 */
async function isMessageFromProbot(message) {
  try {
    if (!message || !message.author || message.author.bot !== true) {
      return false;
    }
    
    const probotId = await getProbotId();
    if (!probotId) {
      // Fallback to default ProBot ID if not configured
      const defaultProbotId = '282859044593598464';
      console.warn('ProBot ID not configured, using default:', defaultProbotId);
      return message.author.id === defaultProbotId;
    }
    
    return message.author.id === probotId;
  } catch (error) {
    console.error('Error checking if message is from ProBot:', error);
    // Fallback to default ProBot ID on error
    const defaultProbotId = '282859044593598464';
    return message?.author?.id === defaultProbotId;
  }
}

/**
 * Make API request to ProBot
 * @param {string} endpoint - API endpoint
 * @param {object} options - Request options
 * @returns {Promise<object>} API response
 */
function makeRequest(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${PROBOT_API_BASE}${endpoint}`);
    
    // Add query parameters if provided
    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Authorization': PROBOT_API_TOKEN,
        'Content-Type': 'application/json',
        'User-Agent': 'Discord-Shop-Bot/1.0',
        ...options.headers
      }
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(jsonData);
          } else {
            reject(new Error(`ProBot API Error: ${res.statusCode} - ${jsonData.message || data}`));
          }
        } catch (err) {
          reject(new Error(`Failed to parse ProBot API response: ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`ProBot API Request failed: ${err.message}`));
    });

    // Send request body if provided
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * Get user's credit balance
 * @param {string} userId - Discord user ID
 * @returns {Promise<number>} User's credit balance
 */
async function getUserBalance(userId) {
  try {
    const response = await makeRequest('/credits', {
      params: {
        guild: PROBOT_GUILD_ID,
        user: userId
      }
    });
    return response.credits || 0;
  } catch (error) {
    console.error('Failed to get user balance:', error.message);
    return null;
  }
}

/**
 * Get recent transactions for a user
 * @param {string} userId - Discord user ID
 * @param {number} limit - Number of transactions to fetch (default: 10)
 * @returns {Promise<Array>} Array of transactions
 */
async function getUserTransactions(userId, limit = 10) {
  try {
    const response = await makeRequest('/transactions', {
      params: {
        guild: PROBOT_GUILD_ID,
        user: userId,
        limit: limit
      }
    });
    return response.transactions || [];
  } catch (error) {
    console.error('Failed to get user transactions:', error.message);
    return [];
  }
}

/**
 * Check for a specific transfer between users
 * @param {string} fromUserId - Sender's Discord user ID
 * @param {string} toUserId - Recipient's Discord user ID
 * @param {number} amount - Transfer amount
 * @param {number} timeWindow - Time window in milliseconds to check (default: 10 minutes)
 * @returns {Promise<object|null>} Transaction object if found, null otherwise
 */
async function checkTransfer(fromUserId, toUserId, amount, timeWindow = 10 * 60 * 1000) {
  try {
    const transactions = await getUserTransactions(fromUserId, 20);
    const cutoffTime = Date.now() - timeWindow;
    
    // Look for matching transfer
    const transfer = transactions.find(tx => {
      const txTime = new Date(tx.timestamp).getTime();
      return (
        tx.type === 'transfer' &&
        tx.from === fromUserId &&
        tx.to === toUserId &&
        Math.abs(tx.amount - amount) < 0.01 && // Allow small floating point differences
        txTime > cutoffTime
      );
    });
    
    return transfer || null;
  } catch (error) {
    console.error('Failed to check transfer:', error.message);
    return null;
  }
}

/**
 * Monitor for transfers in real-time (polling method)
 * @param {string} fromUserId - Sender's Discord user ID
 * @param {string} toUserId - Recipient's Discord user ID
 * @param {number} amount - Expected transfer amount
 * @param {number} timeout - Timeout in milliseconds
 * @param {function} callback - Callback function when transfer is found
 */
async function monitorTransfer(fromUserId, toUserId, amount, timeout = 10 * 60 * 1000, callback) {
  const startTime = Date.now();
  const pollInterval = 5000; // Check every 5 seconds
  
  const poll = async () => {
    if (Date.now() - startTime > timeout) {
      callback(null, new Error('Transfer monitoring timeout'));
      return;
    }
    
    try {
      const transfer = await checkTransfer(fromUserId, toUserId, amount, timeout);
      
      if (transfer) {
        callback(transfer, null);
        return;
      }
      
      // Continue polling
      setTimeout(poll, pollInterval);
    } catch (error) {
      callback(null, error);
    }
  };
  
  // Start polling immediately
  poll();
}

/**
 * Check if ProBot API is configured and accessible
 * @returns {Promise<boolean>} True if API is working, false otherwise
 */
async function testConnection() {
  if (!PROBOT_API_TOKEN || PROBOT_API_TOKEN === 'your_probot_api_token_here') {
    console.log('❌ ProBot API token not configured');
    return false;
  }
  
  if (!PROBOT_GUILD_ID || PROBOT_GUILD_ID === 'your_guild_id_here') {
    console.log('❌ ProBot Guild ID not configured');
    return false;
  }
  
  try {
    const response = await makeRequest('/test', {
      params: { guild: PROBOT_GUILD_ID }
    });
    console.log('✅ ProBot API connection successful');
    return true;
  } catch (error) {
    console.log('❌ ProBot API connection failed:', error.message);
    return false;
  }
}

module.exports = {
  getUserBalance,
  getUserTransactions,
  checkTransfer,
  monitorTransfer,
  testConnection,
  getProbotId,
  isMessageFromProbot
};