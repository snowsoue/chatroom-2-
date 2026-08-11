# Discord-style Chatroom

A self-hosted chatroom with a real server, persistent message history, channels,
usernames, and avatars — styled after Discord.

## What's included

- **server.js** — Express + Socket.IO server (real-time messaging, presence, typing indicators)
- **db.js** — SQLite database setup (via `better-sqlite3`) — messages and channels persist to `chat.db`
- **public/** — the frontend (plain HTML/CSS/JS, no build step needed)
  - `index.html` — layout
  - `style.css` — Discord-style dark theme
  - `client.js` — login flow, socket handling, message rendering

## Features

- Login screen: pick a username, upload a profile picture (or get a random colored avatar with your initials, like Discord's default)
- Multiple channels (`#general`, `#random` by default — add more directly in the database or extend the API)
- Full message history stored in SQLite, loaded on join with a "Load earlier messages" button plus auto-load when you scroll near the top
- Live updates via WebSockets (Socket.IO) — new messages appear instantly for everyone in the channel
- Grouped messages (consecutive messages from the same person within 5 minutes collapse under one avatar/name, like Discord)
- Online member list with presence indicators
- "X is typing…" indicator
- Responsive layout (member list collapses on narrow screens)
- Session persistence — your username/avatar are remembered in localStorage
- **Smooth scrolling with large histories** — only a capped window of messages (~200) is ever kept in the DOM at once during a live session; older ones are trimmed as new ones arrive (only while you're scrolled near the bottom, so it never disrupts you mid-scroll). Older history is still fully there in the database and reloadable via "Load earlier messages."
- **Emoji picker** — click the 😊 icon to browse/search emoji by category and insert them into your message
- **Reactions** — hover any message to react with 😊+, or click an existing reaction pill to toggle your own reaction on/off; updates live for everyone
- **Image support** — attach an image via the 📎 button, paste one from your clipboard, or drag-and-drop it onto the chat; click any image in chat to view it full-size
- **Custom emoji** — click "+ Add custom emoji" in the picker to upload an image and give it a name; it becomes usable everywhere as `:yourname:` (including in reactions), and shows up live in everyone's picker
- Messages that are only emoji render bigger ("jumbo"), like Discord

## Running it locally

You'll need [Node.js](https://nodejs.org) 18+ installed.

```bash
cd chatroom
npm install
npm start
```

Then open **http://localhost:3000** in your browser. Open it in two tabs to see live chat between two "users."

The database file `chat.db` is created automatically on first run in the project folder — all messages persist there across restarts.

## Putting it on your website

This is a small standalone Node app, so you deploy it like any Node service:

1. **Host the server** somewhere that runs Node (Render, Railway, Fly.io, a VPS, etc.). Run `npm install && npm start`, and set the `PORT` environment variable if your host requires it.
2. **Embed it in your site** either by:
   - Linking to it directly (e.g. `chat.yoursite.com`), or
   - Embedding it in an `<iframe>` on an existing page:
     ```html
     <iframe src="https://chat.yoursite.com" style="width:100%; height:700px; border:none;"></iframe>
     ```
3. **Lock down CORS**: in `server.js`, change
   ```js
   const io = new Server(server, { cors: { origin: '*' } });
   ```
   to your actual domain, e.g. `origin: 'https://yoursite.com'`.

## Extending it

A few natural next steps, roughly in order of effort:

- **Add more channels**: insert rows into the `channels` table in `db.js`'s seed block, or build a small admin UI/API route to create them.
- **Add authentication**: right now anyone can pick any username (like a guest chat). To add real accounts, you'd add a `users` table with passwords (hashed with `bcrypt`) and gate the `join` socket event behind a login token.
- **Rate limiting / moderation**: add basic spam protection (e.g. `express-rate-limit` on the REST routes, and a per-socket message cooldown).
- **File/image sharing in messages**: currently only avatars support images; you could extend the `message` event to accept an uploaded image and store it (e.g. via S3 or local disk) instead of just text.
- **Direct messages**: add a private Socket.IO room per pair of users, separate from channel rooms.

## Notes on the current implementation

- Avatars uploaded as photos are stored as base64 data URLs directly in the database next to each message row — fine for a small/personal chat, but for heavier use you'd want to upload images to disk or object storage and store just a URL.
- **Message images and custom emoji images**, unlike avatars, *are* uploaded to disk (`public/uploads/`) and referenced by URL — this keeps the database small even with lots of image sharing. If you deploy somewhere with an ephemeral filesystem (see the hosting note above), uploaded images will be lost on restart along with `chat.db` — same caveat, same fix (persistent disk, or move uploads to S3/Cloudflare R2/etc. for anything long-term).
- There's no authentication — usernames aren't reserved, so two people could pick the same name, and reactions/custom-emoji-creation are attributed to whatever name someone's currently using. Fine for an internal/informal chat; add accounts if you need real identity.
- Custom emoji names are global and first-come — there's no per-server namespacing or moderation on what gets uploaded. For a public-facing chat you'd want to add basic moderation (e.g. review uploads, rate-limit emoji/image creation) before opening it up widely.
- The emoji picker's search only matches category names and custom emoji names (native emoji aren't individually tagged with keywords) — good enough for browsing, less good for "find the exact emoji by typing its name."
- `cors: { origin: '*' }` is wide open for easy local testing — tighten it before deploying publicly (see above).
