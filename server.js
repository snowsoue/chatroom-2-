const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' } // tighten this to your website's domain in production
});

const PORT = process.env.PORT || 3000;
const MAX_MESSAGE_LENGTH = 2000;
const HISTORY_PAGE_SIZE = 50;

// Behind a reverse proxy (Render, Railway, nginx, etc.) the direct connection IP is the
// proxy's own address — this tells Express to read the real client IP from X-Forwarded-For.
app.set('trust proxy', true);

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Image uploads (message images + custom emoji images) ---

const uploadsDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

function sanitize(str, max) {
  return String(str || '').slice(0, max).trim();
}

function getReactionsForMessage(messageId) {
  const rows = db.prepare('SELECT emoji, username FROM reactions WHERE message_id = ?').all(messageId);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.emoji)) map.set(r.emoji, []);
    map.get(r.emoji).push(r.username);
  }
  return [...map.entries()].map(([emoji, users]) => ({ emoji, count: users.length, users }));
}

// --- REST API ---

app.get('/api/channels', (req, res) => {
  const channels = db.prepare('SELECT * FROM channels ORDER BY name').all();
  res.json(channels);
});

// Get message history for a channel (paginated, newest last), with reactions attached
app.get('/api/messages/:channelId', (req, res) => {
  const { channelId } = req.params;
  const before = parseInt(req.query.before, 10);

  let rows;
  if (Number.isInteger(before)) {
    rows = db.prepare(
      `SELECT * FROM messages WHERE channel_id = ? AND id < ? ORDER BY id DESC LIMIT ?`
    ).all(channelId, before, HISTORY_PAGE_SIZE);
  } else {
    rows = db.prepare(
      `SELECT * FROM messages WHERE channel_id = ? ORDER BY id DESC LIMIT ?`
    ).all(channelId, HISTORY_PAGE_SIZE);
  }

  rows.reverse(); // oldest -> newest
  rows.forEach(m => { m.reactions = getReactionsForMessage(m.id); });
  res.json(rows);
});

// Upload an image to attach to a message
app.post('/api/upload/image', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    res.json({ url: `/uploads/${req.file.filename}` });
  });
});

// List custom emojis
app.get('/api/emojis', (req, res) => {
  res.json(db.prepare('SELECT * FROM custom_emojis ORDER BY name').all());
});

// Create a custom emoji from an uploaded image
app.post('/api/emojis', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });

    const name = sanitize(req.body.name, 32).toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!name) return res.status(400).json({ error: 'Emoji name must use letters, numbers, or underscores' });
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const existing = db.prepare('SELECT id FROM custom_emojis WHERE name = ?').get(name);
    if (existing) return res.status(409).json({ error: 'An emoji with that name already exists' });

    const image_url = `/uploads/${req.file.filename}`;
    const created_by = sanitize(req.body.createdBy, 32) || 'someone';
    const created_at = Date.now();

    const info = db.prepare(
      'INSERT INTO custom_emojis (name, image_url, created_by, created_at) VALUES (?, ?, ?, ?)'
    ).run(name, image_url, created_by, created_at);

    const emoji = { id: info.lastInsertRowid, name, image_url, created_by, created_at };
    io.emit('emoji:new', emoji); // let everyone's picker pick it up live
    res.json(emoji);
  });
});

// --- Socket.IO realtime ---

const onlineUsers = new Map(); // socket.id -> { username, avatarColor, avatarUrl, channel, ip }

function broadcastPresence(channelId) {
  const users = [...onlineUsers.values()].filter(u => u.channel === channelId);
  io.to(channelId).emit('presence', users);
}

// Prefer X-Forwarded-For (the real client IP when running behind Render/Railway/nginx/etc.),
// falling back to the raw socket address for local/direct connections.
function getClientIp(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return socket.handshake.address;
}

io.on('connection', (socket) => {
  const ip = getClientIp(socket);
  console.log(`[connect] socket ${socket.id} from ${ip}`);

  socket.on('join', ({ username, avatarColor, avatarUrl, channel }) => {
    username = sanitize(username, 32) || 'Anonymous';
    avatarColor = sanitize(avatarColor, 16) || '#5865F2';
    avatarUrl = avatarUrl ? sanitize(avatarUrl, 2 * 1024 * 1024) : null;
    channel = sanitize(channel, 64) || 'main';

    const prev = onlineUsers.get(socket.id);
    if (prev && prev.channel && prev.channel !== channel) {
      socket.leave(prev.channel);
      broadcastPresence(prev.channel);
    }

    onlineUsers.set(socket.id, { username, avatarColor, avatarUrl, channel, ip });
    socket.join(channel);
    broadcastPresence(channel);
    console.log(`[join] ${username} (${ip}) joined #${channel}`);
  });

  socket.on('message', ({ text, imageUrl }) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;

    text = sanitize(text, MAX_MESSAGE_LENGTH);
    imageUrl = imageUrl ? sanitize(imageUrl, 500) : null;
    if (!text && !imageUrl) return; // need at least text or an image

    const created_at = Date.now();
    const stmt = db.prepare(
      `INSERT INTO messages (channel_id, username, avatar_color, avatar_url, text, image_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const info = stmt.run(user.channel, user.username, user.avatarColor, user.avatarUrl, text, imageUrl, created_at);

    const message = {
      id: info.lastInsertRowid,
      channel_id: user.channel,
      username: user.username,
      avatar_color: user.avatarColor,
      avatar_url: user.avatarUrl,
      text,
      image_url: imageUrl,
      reactions: [],
      created_at
    };

    io.to(user.channel).emit('message', message);
  });

  socket.on('reaction:toggle', ({ messageId, emoji }) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;

    messageId = parseInt(messageId, 10);
    emoji = sanitize(emoji, 40);
    if (!Number.isInteger(messageId) || !emoji) return;

    const msg = db.prepare('SELECT channel_id FROM messages WHERE id = ?').get(messageId);
    if (!msg) return;

    const existing = db.prepare(
      'SELECT id FROM reactions WHERE message_id = ? AND emoji = ? AND username = ?'
    ).get(messageId, emoji, user.username);

    if (existing) {
      db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
    } else {
      db.prepare(
        'INSERT INTO reactions (message_id, emoji, username) VALUES (?, ?, ?)'
      ).run(messageId, emoji, user.username);
    }

    const reactions = getReactionsForMessage(messageId);
    io.to(msg.channel_id).emit('reaction:update', { messageId, reactions });
  });

  socket.on('typing', () => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    socket.to(user.channel).emit('typing', { username: user.username });
  });

  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);
    onlineUsers.delete(socket.id);
    if (user) {
      broadcastPresence(user.channel);
      console.log(`[disconnect] ${user.username} (${user.ip}) left`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Chatroom server running at http://localhost:${PORT}`);
});
