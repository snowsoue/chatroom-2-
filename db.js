const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'chat.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    topic TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    username TEXT NOT NULL,
    avatar_color TEXT NOT NULL,
    avatar_url TEXT,
    avatar_pos_x REAL NOT NULL DEFAULT 50,
    avatar_pos_y REAL NOT NULL DEFAULT 50,
    text TEXT NOT NULL DEFAULT '',
    image_url TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (channel_id) REFERENCES channels(id)
  );

  CREATE TABLE IF NOT EXISTS reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    emoji TEXT NOT NULL,
    username TEXT NOT NULL,
    UNIQUE(message_id, emoji, username),
    FOREIGN KEY (message_id) REFERENCES messages(id)
  );

  CREATE TABLE IF NOT EXISTS custom_emojis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    image_url TEXT NOT NULL,
    created_by TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, id);
  CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);
`);

// Migration safety net: if an older chat.db exists from before image_url was added, patch it in.
const messageCols = db.prepare("PRAGMA table_info(messages)").all().map(c => c.name);
if (!messageCols.includes('image_url')) {
  db.exec('ALTER TABLE messages ADD COLUMN image_url TEXT');
}
if (!messageCols.includes('avatar_pos_x')) {
  db.exec('ALTER TABLE messages ADD COLUMN avatar_pos_x REAL NOT NULL DEFAULT 50');
}
if (!messageCols.includes('avatar_pos_y')) {
  db.exec('ALTER TABLE messages ADD COLUMN avatar_pos_y REAL NOT NULL DEFAULT 50');
}

// Seed default channel if none exist
const channelCount = db.prepare('SELECT COUNT(*) AS c FROM channels').get().c;
if (channelCount === 0) {
  db.prepare('INSERT INTO channels (id, name, topic) VALUES (?, ?, ?)')
    .run('main', 'main', 'Chat for everyone');
}

// One-time cleanup: an earlier version seeded a #random channel — remove it
// (and its messages/reactions) if it's still hanging around from that.
const randomExists = db.prepare("SELECT id FROM channels WHERE id = 'random'").get();
if (randomExists) {
  db.prepare("DELETE FROM reactions WHERE message_id IN (SELECT id FROM messages WHERE channel_id = 'random')").run();
  db.prepare("DELETE FROM messages WHERE channel_id = 'random'").run();
  db.prepare("DELETE FROM channels WHERE id = 'random'").run();
}

// One-time migration: rename the old #general channel to #main, keeping its messages intact.
const generalExists = db.prepare("SELECT id FROM channels WHERE id = 'general'").get();
if (generalExists) {
  db.prepare("UPDATE messages SET channel_id = 'main' WHERE channel_id = 'general'").run();
  db.prepare("UPDATE channels SET id = 'main', name = 'main' WHERE id = 'general'").run();
}

module.exports = db;
