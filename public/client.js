(() => {
  const COLORS = ['#5865F2', '#EB459E', '#57F287', '#FEE75C', '#ED4245', '#00B0F4', '#F47B67', '#9B84EC'];

  // Deterministic color for things without a chosen avatar (channels) — same input always gets the same color.
  function colorForString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return COLORS[Math.abs(hash) % COLORS.length];
  }
  const MAX_RENDERED_MESSAGES = 200; // keeps the DOM small so scrolling stays smooth in long sessions
  const BASE_TITLE = document.title;

  const EMOJI_DATA = {
    'Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬'],
    'Gestures': ['👋','🤚','🖐️','✋','🖖','👌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🙏','🤝','💪'],
    'Hearts': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝'],
    'Animals': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐢','🐍','🦖','🐳','🐬','🐟','🐠','🐡','🦈','🐙'],
    'Food': ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥕','🌽','🌶️','🥔','🍞','🥐','🥨','🧀','🍕','🍔','🍟','🌭','🍿','🥓','🥚','🍳','🥞','🧇','🍗','🍖','🥩','🍤','🍜','🍝','🍣','🍱','🍦','🍩','🍪','🎂','🍰','🍫','🍬','🍭','☕','🍵','🥤','🍺','🍷','🥂'],
    'Activities': ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥅','🏆','🎮','🎲','🎯','🎳','🎸','🎺','🎨','🎬','🎤','🎧','🎼','🚀','🎉','🎊','🎁','🏅','🥇'],
    'Objects': ['💡','🔦','🕯️','📱','💻','⌨️','🖥️','🖨️','🖱️','💾','📷','🎥','📞','☎️','📺','⏰','⌚','💰','💵','💳','✉️','📦','📚','📝','✏️','🖊️','📌','📎','🔒','🔑','🔨','🔧','⚙️','🧲','🔬','🔭'],
    'Symbols': ['✅','❌','❓','❗','⭐','🌟','✨','🔥','💯','💢','💥','💫','💦','💨','⏰','♻️','⚠️','🚫','🆗','🆕','🔀','🔁','▶️','⏸️','⏹️']
  };

  const state = {
    username: '',
    avatarColor: COLORS[Math.floor(Math.random() * COLORS.length)],
    avatarUrl: null,
    channel: 'main',
    channels: [],
    oldestLoadedId: null,
    lastRenderedAuthor: null,
    lastRenderedTime: 0,
    socket: null,
    customEmojis: new Map(),  // name -> image_url
    reactionRows: new Map(),  // messageId -> reactions-row element (for live updates without re-render)
    pendingImage: null,
    typingDisplayTimeout: null,
    unreadCount: 0
  };

  // ---------- DOM refs ----------
  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('app');
  const avatarPreview = document.getElementById('avatar-preview');
  const avatarFile = document.getElementById('avatar-file');
  const usernameInput = document.getElementById('username-input');
  const joinBtn = document.getElementById('join-btn');

  const channelListEl = document.getElementById('channel-list');
  const myAvatarEl = document.getElementById('my-avatar');
  const myUsernameEl = document.getElementById('my-username');
  const channelNameEl = document.getElementById('channel-name');
  const channelTopicEl = document.getElementById('channel-topic');
  const channelAvatarEl = document.getElementById('channel-avatar');
  const messagesEl = document.getElementById('messages');
  const messagesInnerEl = document.getElementById('messages-inner');
  const loadMoreBtn = document.getElementById('load-more-btn');
  const typingIndicatorEl = document.getElementById('typing-indicator');
  const messageForm = document.getElementById('message-form');
  const messageInput = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const memberListEl = document.getElementById('member-list');
  const onlineCountEl = document.getElementById('online-count');

  const attachBtn = document.getElementById('attach-btn');
  const imageFileInput = document.getElementById('image-file-input');
  const imagePreviewBar = document.getElementById('image-preview-bar');
  const imagePreviewImg = document.getElementById('image-preview-img');
  const removeImageBtn = document.getElementById('remove-image-btn');

  const emojiBtn = document.getElementById('emoji-btn');
  const emojiPicker = document.getElementById('emoji-picker');
  const emojiPickerBody = document.getElementById('emoji-picker-body');
  const emojiSearch = document.getElementById('emoji-search');
  const createEmojiBtn = document.getElementById('create-emoji-btn');

  const createEmojiModal = document.getElementById('create-emoji-modal');
  const newEmojiName = document.getElementById('new-emoji-name');
  const newEmojiFile = document.getElementById('new-emoji-file');
  const submitEmojiBtn = document.getElementById('submit-emoji-btn');
  const cancelEmojiBtn = document.getElementById('cancel-emoji-btn');

  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');

  // ---------- Avatar helpers ----------
  function initials(name) {
    return (name || '?').trim().slice(0, 2).toUpperCase();
  }

  function applyAvatarStyle(el, color, url, label) {
    el.style.background = url ? `url(${url})` : color;
    el.textContent = url ? '' : initials(label);
  }

  function refreshPreview() {
    applyAvatarStyle(avatarPreview, state.avatarColor, state.avatarUrl, usernameInput.value);
  }

  document.getElementById('avatar-upload-btn').addEventListener('click', () => avatarFile.click());
  document.getElementById('avatar-color-btn').addEventListener('click', () => {
    state.avatarColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    state.avatarUrl = null;
    refreshPreview();
  });

  avatarFile.addEventListener('change', () => {
    const file = avatarFile.files[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      alert('Please choose an image under 1.5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.avatarUrl = reader.result;
      refreshPreview();
    };
    reader.readAsDataURL(file);
  });

  usernameInput.addEventListener('input', refreshPreview);
  refreshPreview();

  // ---------- Login / join ----------
  function doJoin() {
    const name = usernameInput.value.trim();
    if (!name) {
      usernameInput.focus();
      return;
    }
    state.username = name;

    localStorage.setItem('chat_username', state.username);
    localStorage.setItem('chat_avatar_color', state.avatarColor);
    localStorage.setItem('chat_avatar_url', state.avatarUrl || '');

    loginScreen.classList.add('hidden');
    app.classList.remove('hidden');

    applyAvatarStyle(myAvatarEl, state.avatarColor, state.avatarUrl, state.username);
    myUsernameEl.textContent = state.username;

    connectSocket();
    loadCustomEmojis();
    loadChannels();
  }

  joinBtn.addEventListener('click', doJoin);
  usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

  (function restore() {
    const savedName = localStorage.getItem('chat_username');
    const savedColor = localStorage.getItem('chat_avatar_color');
    const savedUrl = localStorage.getItem('chat_avatar_url');
    if (savedName) usernameInput.value = savedName;
    if (savedColor) state.avatarColor = savedColor;
    if (savedUrl) state.avatarUrl = savedUrl;
    refreshPreview();
  })();

  document.getElementById('edit-profile-btn').addEventListener('click', () => {
    app.classList.add('hidden');
    loginScreen.classList.remove('hidden');
  });

  // ---------- Channels ----------
  async function loadChannels() {
    const res = await fetch('/api/channels');
    state.channels = await res.json();
    renderChannelList();
    switchChannel(state.channel);
  }

  function renderChannelList() {
    channelListEl.innerHTML = '';
    state.channels.forEach((ch) => {
      const div = document.createElement('div');
      div.className = 'channel-item' + (ch.id === state.channel ? ' active' : '');

      const icon = document.createElement('div');
      icon.className = 'avatar avatar-sm channel-avatar-icon';
      applyAvatarStyle(icon, colorForString(ch.id), null, ch.name);

      const label = document.createElement('span');
      label.textContent = ch.name;

      div.appendChild(icon);
      div.appendChild(label);
      div.addEventListener('click', () => switchChannel(ch.id));
      channelListEl.appendChild(div);
    });
  }

  function switchChannel(channelId) {
    state.channel = channelId;
    state.oldestLoadedId = null;
    state.lastRenderedAuthor = null;
    messagesInnerEl.innerHTML = '';
    state.reactionRows.clear();
    loadMoreBtn.classList.add('hidden');
    renderChannelList();

    const ch = state.channels.find(c => c.id === channelId);
    const displayName = ch ? ch.name : channelId;
    channelNameEl.textContent = displayName;
    channelTopicEl.textContent = ch ? ch.topic : '';
    messageInput.placeholder = `Message ${displayName}`;
    applyAvatarStyle(channelAvatarEl, colorForString(channelId), null, displayName);

    if (state.socket && state.socket.connected) {
      state.socket.emit('join', {
        username: state.username,
        avatarColor: state.avatarColor,
        avatarUrl: state.avatarUrl,
        channel: channelId
      });
    }

    loadHistory();
  }

  // ---------- History ----------
  async function loadHistory(before) {
    const url = before
      ? `/api/messages/${state.channel}?before=${before}`
      : `/api/messages/${state.channel}`;
    const res = await fetch(url);
    const rows = await res.json();

    if (rows.length > 0) {
      state.oldestLoadedId = rows[0].id;
      loadMoreBtn.classList.remove('hidden');
    } else {
      loadMoreBtn.classList.add('hidden');
    }

    if (before) {
      const scrollHeightBefore = messagesEl.scrollHeight;
      const frag = document.createDocumentFragment();
      state.lastRenderedAuthor = null; // force a fresh header for the prepended block
      rows.forEach(m => frag.appendChild(renderMessage(m, true)));
      messagesInnerEl.prepend(frag);
      messagesEl.scrollTop = messagesEl.scrollHeight - scrollHeightBefore;
    } else {
      const frag = document.createDocumentFragment();
      rows.forEach(m => frag.appendChild(renderMessage(m)));
      messagesInnerEl.appendChild(frag);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  loadMoreBtn.addEventListener('click', () => {
    if (state.oldestLoadedId) loadHistory(state.oldestLoadedId);
  });

  // Infinite-scroll: auto-load older messages when scrolled near the top.
  // Throttled via requestAnimationFrame so this never runs more than once per frame.
  let scrollTicking = false;
  messagesEl.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      if (messagesEl.scrollTop < 60 && state.oldestLoadedId && !loadMoreBtn.classList.contains('hidden')) {
        loadHistory(state.oldestLoadedId);
      }
      scrollTicking = false;
    });
  }, { passive: true });

  // Keeps the DOM from growing without bound during a long live session.
  // Only trims while the user is following along near the bottom, so it never
  // yanks content out from under someone scrolled up reading history.
  function trimRenderedMessages() {
    while (messagesInnerEl.children.length > MAX_RENDERED_MESSAGES) {
      const first = messagesInnerEl.firstChild;
      const id = first.dataset && first.dataset.messageId;
      if (id) state.reactionRows.delete(Number(id));
      messagesInnerEl.removeChild(first);
    }
  }

  // ---------- Text / emoji rendering ----------
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function formatFullTime(ts) {
    return new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  // Renders :shortcode: tokens that match a known custom emoji as inline <img>s.
  function renderTextContent(text) {
    let escaped = escapeHtml(text);
    escaped = escaped.replace(/:([a-zA-Z0-9_]{1,32}):/g, (match, name) => {
      const key = name.toLowerCase();
      if (state.customEmojis.has(key)) {
        const url = state.customEmojis.get(key);
        return `<img class="emoji-inline" src="${url}" alt=":${key}:" title=":${key}:">`;
      }
      return match;
    });
    return escaped;
  }

  // A message that's *only* emoji (native or custom shortcodes), and short, renders bigger — like Discord.
  function isEmojiOnlyMessage(text) {
    if (!text) return false;
    const withPlaceholders = text.replace(/:([a-zA-Z0-9_]{1,32}):/g, (m, name) =>
      state.customEmojis.has(name.toLowerCase()) ? '\u{1F7E2}' : m
    );
    const stripped = withPlaceholders.replace(/\s+/g, '');
    if (!stripped || [...stripped].length > 10) return false;
    try {
      return /^\p{Extended_Pictographic}+$/u.test(stripped);
    } catch (e) {
      return false; // older browsers without Unicode property escape support
    }
  }

  function renderEmojiToken(token) {
    const match = /^:([a-zA-Z0-9_]{1,32}):$/.exec(token);
    if (match && state.customEmojis.has(match[1].toLowerCase())) {
      const url = state.customEmojis.get(match[1].toLowerCase());
      return `<img class="emoji-inline" src="${url}" alt="${token}">`;
    }
    return escapeHtml(token);
  }

  // ---------- Reactions ----------
  function renderReactionsRow(el, messageId, reactions) {
    el.innerHTML = '';
    if (!reactions || reactions.length === 0) return;
    reactions.forEach(r => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'reaction-pill' + (r.users.includes(state.username) ? ' mine' : '');
      pill.dataset.messageId = messageId;
      pill.dataset.emoji = r.emoji;
      pill.innerHTML = `${renderEmojiToken(r.emoji)}<span class="reaction-count">${r.count}</span>`;
      el.appendChild(pill);
    });
  }

  // ---------- Message rendering ----------
  function renderMessage(m, prepend) {
    const grouped = !prepend && state.lastRenderedAuthor === m.username &&
      (m.created_at - state.lastRenderedTime) < 5 * 60 * 1000;

    state.lastRenderedAuthor = m.username;
    state.lastRenderedTime = m.created_at;

    const isMine = m.username === state.username;

    const row = document.createElement('div');
    row.className = 'message-row' + (grouped ? ' grouped' : '') + (isMine ? ' own' : '');
    row.dataset.messageId = m.id;

    // Your own messages skip the avatar entirely (right-aligned bubbles, no gutter) —
    // matches how Instagram never shows your own avatar in a thread.
    if (!isMine) {
      const gutter = document.createElement('div');
      gutter.className = 'message-gutter';
      if (!grouped) {
        const avatar = document.createElement('div');
        avatar.className = 'avatar avatar-md';
        applyAvatarStyle(avatar, m.avatar_color, m.avatar_url, m.username);
        gutter.appendChild(avatar);
      }
      row.appendChild(gutter);
    }

    const body = document.createElement('div');
    body.className = 'message-body';

    if (!isMine && !grouped) {
      const sender = document.createElement('div');
      sender.className = 'message-sender';
      sender.textContent = m.username;
      body.appendChild(sender);
    }

    const content = document.createElement('div');
    content.className = 'message-content';
    const emojiOnly = isEmojiOnlyMessage(m.text) && !m.image_url;
    if (emojiOnly) content.classList.add('jumbo');

    let html = '';
    if (m.text) {
      // Pure-emoji messages render bare (no bubble), like Instagram; everything else gets a bubble.
      const textHtml = renderTextContent(m.text);
      html += emojiOnly
        ? `<div class="message-text">${textHtml}</div>`
        : `<div class="bubble ${isMine ? 'mine' : 'theirs'}"><div class="message-text">${textHtml}</div></div>`;
    }
    if (m.image_url) html += `<img class="message-image" src="${m.image_url}" loading="lazy" alt="attached image">`;
    content.innerHTML = html;
    body.appendChild(content);

    if (!grouped) {
      const timestamp = document.createElement('div');
      timestamp.className = 'message-timestamp-row';
      timestamp.title = formatFullTime(m.created_at);
      timestamp.textContent = formatTime(m.created_at);
      body.appendChild(timestamp);
    }

    const reactionsRow = document.createElement('div');
    reactionsRow.className = 'reactions-row';
    reactionsRow.dataset.messageId = m.id;
    renderReactionsRow(reactionsRow, m.id, m.reactions || []);
    body.appendChild(reactionsRow);
    state.reactionRows.set(m.id, reactionsRow);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'add-reaction-btn';
    addBtn.dataset.messageId = m.id;
    addBtn.title = 'Add reaction';
    addBtn.textContent = '\u263A+';

    row.appendChild(body);
    row.appendChild(addBtn);
    return row;
  }

  // Event delegation instead of per-message listeners — keeps things fast with many messages.
  messagesInnerEl.addEventListener('click', (e) => {
    const pill = e.target.closest('.reaction-pill');
    if (pill) {
      state.socket.emit('reaction:toggle', {
        messageId: Number(pill.dataset.messageId),
        emoji: pill.dataset.emoji
      });
      return;
    }
    const addBtn = e.target.closest('.add-reaction-btn');
    if (addBtn) {
      openEmojiPicker('reaction', Number(addBtn.dataset.messageId));
      return;
    }
    const img = e.target.closest('.message-image');
    if (img) {
      openLightbox(img.src);
    }
  });

  // ---------- Unread tab-title notifications ----------
  // Shows "(1) Chatroom" etc. in the browser tab when new messages arrive while you're away,
  // like Gmail/Slack — clears automatically once you switch back to the tab.
  function updateTitle() {
    if (state.unreadCount > 0) {
      const label = state.unreadCount > 99 ? '99+' : state.unreadCount;
      document.title = `(${label}) ${BASE_TITLE}`;
    } else {
      document.title = BASE_TITLE;
    }
  }

  function clearUnread() {
    if (state.unreadCount === 0) return;
    state.unreadCount = 0;
    updateTitle();
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) clearUnread();
  });
  window.addEventListener('focus', clearUnread);

  // ---------- Socket ----------
  function connectSocket() {
    state.socket = io();

    state.socket.on('connect', () => {
      state.socket.emit('join', {
        username: state.username,
        avatarColor: state.avatarColor,
        avatarUrl: state.avatarUrl,
        channel: state.channel
      });
    });

    state.socket.on('message', (m) => {
      if (m.channel_id !== state.channel) return;
      const nearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
      messagesInnerEl.appendChild(renderMessage(m));
      if (nearBottom) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
        trimRenderedMessages();
      }

      if (m.username !== state.username && (document.hidden || !document.hasFocus())) {
        state.unreadCount++;
        updateTitle();
      }
    });

    state.socket.on('reaction:update', ({ messageId, reactions }) => {
      const row = state.reactionRows.get(messageId);
      if (row) renderReactionsRow(row, messageId, reactions);
    });

    state.socket.on('presence', (users) => renderMembers(users));

    state.socket.on('typing', ({ username }) => {
      if (username === state.username) return;
      typingIndicatorEl.textContent = `${username} is typing...`;
      clearTimeout(state.typingDisplayTimeout);
      state.typingDisplayTimeout = setTimeout(() => { typingIndicatorEl.textContent = ''; }, 3000);
    });

    state.socket.on('emoji:new', (e) => {
      state.customEmojis.set(e.name, e.image_url);
      if (!emojiPicker.classList.contains('hidden')) renderEmojiPickerBody();
    });
  }

  function renderMembers(users) {
    onlineCountEl.textContent = users.length;
    memberListEl.innerHTML = '';
    users.forEach(u => {
      const item = document.createElement('div');
      item.className = 'member-item';

      const avatarWrap = document.createElement('div');
      avatarWrap.className = 'member-item-avatar-wrap';
      const avatar = document.createElement('div');
      avatar.className = 'avatar avatar-sm';
      applyAvatarStyle(avatar, u.avatarColor, u.avatarUrl, u.username);
      const dot = document.createElement('div');
      dot.className = 'online-dot';
      avatarWrap.appendChild(avatar);
      avatarWrap.appendChild(dot);

      const name = document.createElement('div');
      name.className = 'member-item-name';
      name.textContent = u.username;

      item.appendChild(avatarWrap);
      item.appendChild(name);
      memberListEl.appendChild(item);
    });
  }

  // ---------- Image attachments ----------
  function updateSendButtonVisibility() {
    const hasContent = messageInput.value.trim().length > 0 || !!state.pendingImage;
    sendBtn.classList.toggle('hidden', !hasContent);
  }

  function setPendingImage(file) {
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5MB.');
      return;
    }
    state.pendingImage = file;
    const reader = new FileReader();
    reader.onload = () => {
      imagePreviewImg.src = reader.result;
      imagePreviewBar.classList.remove('hidden');
      updateSendButtonVisibility();
    };
    reader.readAsDataURL(file);
  }

  function clearPendingImage() {
    state.pendingImage = null;
    imageFileInput.value = '';
    imagePreviewBar.classList.add('hidden');
    imagePreviewImg.src = '';
    updateSendButtonVisibility();
  }

  attachBtn.addEventListener('click', () => imageFileInput.click());
  imageFileInput.addEventListener('change', () => {
    const file = imageFileInput.files[0];
    if (file) setPendingImage(file);
  });
  removeImageBtn.addEventListener('click', clearPendingImage);

  messageInput.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) { setPendingImage(file); e.preventDefault(); }
        break;
      }
    }
  });

  messagesEl.addEventListener('dragover', (e) => e.preventDefault());
  messagesEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) setPendingImage(file);
  });

  // ---------- Sending messages ----------
  messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text && !state.pendingImage) return;
    if (!state.socket) return;

    let imageUrl = null;
    if (state.pendingImage) {
      const fd = new FormData();
      fd.append('image', state.pendingImage);
      try {
        const res = await fetch('/api/upload/image', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        imageUrl = data.url;
      } catch (err) {
        alert('Could not upload that image. Please try again.');
        return;
      }
    }

    state.socket.emit('message', { text, imageUrl });
    messageInput.value = '';
    clearPendingImage();
  });

  let lastTypingEmit = 0;
  messageInput.addEventListener('input', () => {
    updateSendButtonVisibility();
    const now = Date.now();
    if (now - lastTypingEmit > 2000 && state.socket) {
      state.socket.emit('typing');
      lastTypingEmit = now;
    }
  });

  // ---------- Emoji picker ----------
  let emojiPickerMode = 'insert'; // 'insert' | 'reaction'
  let emojiPickerTargetMessageId = null;

  emojiBtn.addEventListener('click', () => {
    if (emojiPicker.classList.contains('hidden')) openEmojiPicker('insert');
    else closeEmojiPicker();
  });

  function openEmojiPicker(mode, messageId) {
    emojiPickerMode = mode;
    emojiPickerTargetMessageId = messageId || null;
    emojiSearch.value = '';
    renderEmojiPickerBody();
    emojiPicker.classList.remove('hidden');
    emojiSearch.focus();
  }

  function closeEmojiPicker() {
    emojiPicker.classList.add('hidden');
  }

  document.addEventListener('click', (e) => {
    if (emojiPicker.classList.contains('hidden')) return;
    if (emojiPicker.contains(e.target)) return;
    if (e.target === emojiBtn || e.target.closest('#emoji-btn')) return;
    if (e.target.closest('.add-reaction-btn')) return;
    closeEmojiPicker();
  });

  emojiSearch.addEventListener('input', renderEmojiPickerBody);

  function renderEmojiPickerBody() {
    const query = emojiSearch.value.trim().toLowerCase();
    emojiPickerBody.innerHTML = '';

    Object.entries(EMOJI_DATA).forEach(([category, list]) => {
      if (query && !category.toLowerCase().includes(query)) return;
      appendEmojiCategory(category, list.map(value => ({ type: 'native', value })));
    });

    const customEntries = [...state.customEmojis.entries()].filter(([name]) => !query || name.includes(query));
    if (customEntries.length > 0) {
      appendEmojiCategory('Custom', customEntries.map(([name, url]) => ({ type: 'custom', name, url })));
    }
  }

  function appendEmojiCategory(title, items) {
    if (items.length === 0) return;
    const heading = document.createElement('div');
    heading.className = 'emoji-category-title';
    heading.textContent = title;
    emojiPickerBody.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'emoji-grid';
    items.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      if (item.type === 'native') {
        btn.textContent = item.value;
        btn.addEventListener('click', () => handleEmojiPick(item.value));
      } else {
        const img = document.createElement('img');
        img.src = item.url;
        img.alt = item.name;
        btn.appendChild(img);
        btn.title = `:${item.name}:`;
        btn.addEventListener('click', () => handleEmojiPick(`:${item.name}:`));
      }
      grid.appendChild(btn);
    });
    emojiPickerBody.appendChild(grid);
  }

  function handleEmojiPick(token) {
    if (emojiPickerMode === 'reaction' && emojiPickerTargetMessageId) {
      state.socket.emit('reaction:toggle', { messageId: emojiPickerTargetMessageId, emoji: token });
      closeEmojiPicker();
    } else {
      insertAtCursor(messageInput, token);
      updateSendButtonVisibility();
      closeEmojiPicker();
      messageInput.focus();
    }
  }

  function insertAtCursor(input, text) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const pos = start + text.length;
    input.setSelectionRange(pos, pos);
  }

  // ---------- Custom emoji creation ----------
  async function loadCustomEmojis() {
    const res = await fetch('/api/emojis');
    const rows = await res.json();
    state.customEmojis = new Map(rows.map(e => [e.name, e.image_url]));
  }

  createEmojiBtn.addEventListener('click', () => {
    closeEmojiPicker();
    newEmojiName.value = '';
    newEmojiFile.value = '';
    createEmojiModal.classList.remove('hidden');
  });

  cancelEmojiBtn.addEventListener('click', () => createEmojiModal.classList.add('hidden'));

  submitEmojiBtn.addEventListener('click', async () => {
    const name = newEmojiName.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const file = newEmojiFile.files[0];
    if (!name) { alert('Enter a name using letters, numbers, and underscores.'); return; }
    if (!file) { alert('Choose an image.'); return; }
    if (file.size > 1.5 * 1024 * 1024) { alert('Image must be under 1.5MB.'); return; }

    const fd = new FormData();
    fd.append('name', name);
    fd.append('image', file);
    fd.append('createdBy', state.username);

    try {
      const res = await fetch('/api/emojis', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Could not create emoji.'); return; }
      state.customEmojis.set(data.name, data.image_url);
      createEmojiModal.classList.add('hidden');
    } catch (err) {
      alert('Could not create emoji.');
    }
  });

  // ---------- Lightbox ----------
  function openLightbox(src) {
    lightboxImg.src = src;
    lightbox.classList.remove('hidden');
  }
  lightbox.addEventListener('click', () => {
    lightbox.classList.add('hidden');
    lightboxImg.src = '';
  });
})();
