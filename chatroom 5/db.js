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

const messageCols = db.prepare("PRAGMA table_info(messages)").all().map(c => c.name);
if (!messageCols.includes('image_url')) {
  db.exec('ALTER TABLE messages ADD COLUMN image_url TEXT');
}


const channelCount = db.prepare('SELECT COUNT(*) AS c FROM channels').get().c;
if (channelCount === 0) {
  const insert = db.prepare('INSERT INTO channels (id, name, topic) VALUES (?, ?, ?)');
  insert.run('general', 'general', 'General chat for everyone');
  insert.run('random', 'random', 'Anything goes');
}

module.exports = db;
