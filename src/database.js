const fs = require('fs').promises;
const path = require('path');

// Path to the JSON database file
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

// Default database structure
const defaultData = {
  stock: [],
  payments: [],
  orders: [],
  disabledGuilds: [],
  feedbackChannelId: "",
  config: {
    roles: {},
    channels: {},
    categories: {},
    shop: {}
  }
};

class JSONDatabase {
  constructor() {
    this.data = null;
  }

  async load() {
    try {
      const fileContent = await fs.readFile(DB_PATH, 'utf8');
      this.data = JSON.parse(fileContent);
      
      // Ensure all required properties exist
      this.data = { ...defaultData, ...this.data };
      
      // Ensure nested objects exist
      if (!this.data.config) this.data.config = {};
      this.data.config = { ...defaultData.config, ...this.data.config };
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create with default data
        console.log('Database file not found, creating new one...');
        this.data = { ...defaultData };
        await this.write();
      } else {
        console.error('Error loading database:', error);
        throw error;
      }
    }
  }

  async write() {
    try {
      // Ensure the data directory exists
      const dataDir = path.dirname(DB_PATH);
      await fs.mkdir(dataDir, { recursive: true });
      
      // Write the data to the file with pretty formatting
      await fs.writeFile(DB_PATH, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (error) {
      console.error('Error writing database:', error);
      throw error;
    }
  }
}

// Singleton instance
let dbInstance = null;

async function getDB() {
  if (!dbInstance) {
    dbInstance = new JSONDatabase();
    await dbInstance.load();
  }
  return dbInstance;
}

module.exports = {
  getDB
};