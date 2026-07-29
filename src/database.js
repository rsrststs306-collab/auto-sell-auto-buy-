const { JSONFilePreset } = require('lowdb/node');
const path = require('path');
const fs = require('fs');

let db;

async function getDB() {
  if (db) return db;

  const defaultData = {
    // Each item: { id, name, description, price, contents: [] }
    // contents = array of strings — each is one deliverable (key, account info, etc.)
    // quantity is always contents.length — no separate field needed
    stock: [],
    payments: [],    // { id, name, details }
    orders: [],      // { id, userId, userTag, itemId, paymentId, status, createdAt }
    disabledGuilds: [],
    feedbackChannelId: '',
  };

  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  db = await JSONFilePreset(path.join(dataDir, 'db.json'), defaultData);

  // ── Migrations ────────────────────────────────
  let dirty = false;

  if (!db.data.orders) { db.data.orders = []; dirty = true; }
  if (!Array.isArray(db.data.disabledGuilds)) { db.data.disabledGuilds = []; dirty = true; }
  if (typeof db.data.feedbackChannelId !== 'string') { db.data.feedbackChannelId = ''; dirty = true; }

  // Do not keep purchased account or key information in order history.
  for (const order of db.data.orders) {
    if (Object.prototype.hasOwnProperty.call(order, 'deliveredContent')) {
      delete order.deliveredContent;
      dirty = true;
    }
  }

  // Migrate old items that have a single `content` string → contents array
  for (const item of db.data.stock) {
    if (!Array.isArray(item.contents)) {
      item.contents = item.content ? [item.content] : [];
      delete item.content;
      dirty = true;
    }

    if (item.quantity !== item.contents.length) {
      item.quantity = item.contents.length;
      dirty = true;
    }
  }

  if (dirty) await db.write();

  return db;
}

module.exports = { getDB };
