/**
 * app.js - نسخه ماژولار و بهینه‌شده
 * SoulMate 3.2.2 - پیام‌رسان خصوصی
 * 
 * این فایل با استفاده از ماژول‌های جداگانه بازنویسی شده است:
 * - LocalDB: مدیریت IndexedDB
 * - PollingManager: polling هوشمند با exponential backoff
 * - ImageOptimizer: بهینه‌سازی تصاویر
 * - Constants: تمام ثابت‌ها
 * - Utils: توابع کمکی
 */

// ========== Import Modules ==========
// (در محیط مرورگر، این ماژول‌ها باید قبل از این فایل لود شوند)

// ========== Global State ==========
const state = {
  app: {},
  settings: {},
  user: null,
  partner: null,
  csrf: '',
  selectedLogin: 'hossein',
  messages: new Map(),
  lastId: 0,
  firstId: 0,
  hasMoreMessages: true,
  loadingOlder: false,
  searchActive: false,
  searchTimer: null,
  emptyMessage: '',
  forceScrollBottom: false,
  typingTimer: null,
  lastTypingSent: 0,
  loveMode: false,
  letterMode: false,
  timedMode: false,
  pendingOpenAt: '',
  pendingFile: null,
  pendingFileDuration: 0,
  mediaRecorder: null,
  mediaStream: null,
  mediaChunks: [],
  recordingStartedAt: 0,
  recordingTimer: null,
  recordingCanceled: false,
  activeAudio: null,
  activeVoicePlayer: null,
  installPrompt: null,
  selectedMessageId: null,
  memories: [],
  loveItems: [],
  editingMemoryId: null,
  pendingMemoryImageFile: null,
  pendingMemoryAttachmentId: null,
  unreadBadge: 0,
  activeTab: 'chat',
  unreadMessageCount: 0,
  unreadMemoryCount: 0,
  unreadIds: new Set(),
  unreadDividerId: 0,
  lastSeenMemoryId: 0,
  lastSeenMessageId: 0,
  initialMessagesLoaded: false,
  pollingQueued: false,
  replyToId: null,
  swipeMessage: null,
  soundUnlocked: false,
  incomingSoundReady: false,
  loginMode: 'password',
  tempMessages: new Map(),
  sseConnection: null,
  
  // Pagination state
  messagePagination: {
    currentPage: 1,
    pageSize: Constants.MESSAGE.BATCH_SIZE,
    totalMessages: 0,
    loadedRanges: [] // [{start, end}]
  }
};

// ========== Helper Functions ==========
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const apiBase = new URL('api/', document.baseURI).href;

// ========== Initialize Application ==========
async function initApp() {
  try {
    console.log('🚀 Initializing SoulMate...');
    
    // Initialize LocalDB with pagination support
    await LocalDB.init();
    
    // Initialize PollingManager
    PollingManager.init();
    
    // Load settings from local storage
    await loadSettings();
    
    // Check if user is logged in
    const session = await checkSession();
    
    if (session) {
      await initializeMainView(session);
    } else {
      showLoginView();
    }
    
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Setup visibility listeners for background handling
    setupVisibilityListeners();
    
    console.log('✅ SoulMate initialized successfully');
  } catch (error) {
    console.error('❌ Initialization error:', error);
    showToast('خطا در راه‌اندازی برنامه', 'error');
  }
}

// ========== Settings Management ==========
async function loadSettings() {
  const saved = await LocalDB.get('settings', 'userSettings');
  state.settings = saved || {
    darkMode: Utils.prefersDarkMode(),
    notifications: true,
    sound: true,
    vibration: true,
    language: 'fa'
  };
  applySettings();
}

function applySettings() {
  document.documentElement.setAttribute('data-theme', state.settings.darkMode ? 'dark' : 'light');
}

// ========== Session Management ==========
async function checkSession() {
  try {
    const response = await fetch(apiBase + 'auth.php?action=check', {
      credentials: 'same-origin'
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        return data;
      }
    }
  } catch (error) {
    console.error('Session check failed:', error);
  }
  return null;
}

// ========== Main View Initialization ==========
async function initializeMainView(session) {
  state.user = session.user;
  state.partner = session.partner;
  state.csrf = session.csrf;
  
  // Switch to main view
  $('#loginView').style.display = 'none';
  $('#mainView').style.display = 'block';
  
  // Update UI with user info
  updateUserInfo();
  
  // Load messages with pagination
  await loadMessagesPaginated();
  
  // Start smart polling
  startSmartPolling();
  
  // Setup event listeners
  setupEventListeners();
}

// ========== Message Loading with Pagination ==========
async function loadMessagesPaginated() {
  const { currentPage, pageSize } = state.messagePagination;
  
  try {
    // Try to load from IndexedDB first (offline support)
    let messages = await LocalDB.getLatest('messages', pageSize);
    
    // Also fetch from server
    const response = await fetch(apiBase + `messages.php?limit=${pageSize}&offset=${(currentPage - 1) * pageSize}`, {
      headers: {
        'X-CSRF': state.csrf
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        messages = data.messages;
        
        // Cache in IndexedDB
        await LocalDB.putAll('messages', messages);
        
        // Update pagination state
        state.messagePagination.totalMessages = data.total || 0;
        state.hasMoreMessages = messages.length === pageSize;
      }
    }
    
    // Render messages
    renderMessages(messages);
    state.initialMessagesLoaded = true;
    
  } catch (error) {
    console.error('Failed to load messages:', error);
    showToast('خطا در بارگذاری پیام‌ها', 'error');
  }
}

// ========== Smart Polling ==========
function startSmartPolling() {
  PollingManager.start(async () => {
    try {
      const response = await fetch(apiBase + 'messages.php?poll=1&lastId=' + state.lastId, {
        headers: {
          'X-CSRF': state.csrf
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.messages && data.messages.length > 0) {
          await handleNewMessages(data.messages);
          return { hasData: true };
        }
      }
      return { hasData: false };
    } catch (error) {
      console.error('Poll error:', error);
      return { hasData: false };
    }
  });
}

// ========== Handle New Messages ==========
async function handleNewMessages(messages) {
  for (const msg of messages) {
    if (!state.messages.has(msg.id)) {
      state.messages.set(msg.id, msg);
      await LocalDB.put('messages', msg);
      
      if (msg.id > state.lastId) {
        state.lastId = msg.id;
      }
      
      // Add to DOM if visible
      if (msg.sender_id === state.partner.id) {
        appendMessageToDOM(msg);
        
        // Show notification
        if (state.settings.notifications && !document.hidden) {
          showNotification(msg);
        }
      }
    }
  }
  
  // Scroll to bottom if user was at bottom
  if (state.forceScrollBottom || isScrolledToBottom()) {
    scrollToBottom();
  }
}

// ========== Render Messages ==========
function renderMessages(messages) {
  const container = $('#messages');
  container.innerHTML = '';
  
  // Clear state
  state.messages.clear();
  
  // Sort by timestamp
  messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  for (const msg of messages) {
    state.messages.set(msg.id, msg);
    appendMessageToDOM(msg);
  }
  
  // Update lastId
  if (messages.length > 0) {
    state.lastId = Math.max(...messages.map(m => m.id));
    state.firstId = Math.min(...messages.map(m => m.id));
  }
  
  // Scroll to bottom
  scrollToBottom();
}

// ========== Append Message to DOM ==========
function appendMessageToDOM(msg) {
  const container = $('#messages');
  const messageEl = createMessageElement(msg);
  container.appendChild(messageEl);
}

// ========== Create Message Element ==========
function createMessageElement(msg) {
  const div = document.createElement('div');
  div.className = `message ${msg.sender_id === state.user.id ? 'outgoing' : 'incoming'}`;
  div.dataset.id = msg.id;
  div.dataset.type = msg.type;
  
  // Content based on type
  let content = '';
  switch (msg.type) {
    case 'text':
      content = `<p>${Utils.escapeHtml(msg.body)}</p>`;
      break;
    case 'image':
      content = `<img src="${Utils.escapeHtml(msg.file_url)}" alt="تصویر" loading="lazy" />`;
      break;
    case 'voice':
      content = `
        <audio controls preload="metadata">
          <source src="${Utils.escapeHtml(msg.file_url)}" type="audio/mpeg">
          مرورگر شما از پخش صدا پشتیبانی نمی‌کند.
        </audio>
      `;
      break;
    default:
      content = `<p>${Utils.escapeHtml(msg.body || '')}</p>`;
  }
  
  // Metadata
  const time = Utils.formatPersianDate(msg.timestamp, true, false);
  const relative = Utils.formatRelativeTime(msg.timestamp);
  
  div.innerHTML = `
    <div class="message-content">${content}</div>
    <div class="message-meta">
      <span class="time" title="${relative}">${time}</span>
      ${msg.sender_id === state.user.id ? '<span class="status">✓✓</span>' : ''}
    </div>
  `;
  
  // Add interaction handlers
  div.addEventListener('click', () => handleMessageClick(msg));
  div.addEventListener('contextmenu', (e) => handleMessageContextMenu(e, msg));
  
  return div;
}

// ========== Keyboard Shortcuts ==========
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+Enter: Send message
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
      return;
    }
    
    // Ctrl+K: Search
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      openSearch();
      return;
    }
    
    // Escape: Cancel reply/search
    if (e.key === 'Escape') {
      cancelReply();
      closeSearch();
      return;
    }
  });
}

// ========== Visibility Listeners ==========
function setupVisibilityListeners() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Page hidden - reduce polling frequency
      console.log('📱 App in background');
    } else {
      // Page visible - resume normal polling
      console.log('👁️ App in foreground');
      PollingManager.onUserActivity();
    }
  });
}

// ========== Event Listeners ==========
function setupEventListeners() {
  // Send button
  $('#sendButton')?.addEventListener('click', sendMessage);
  
  // Message input
  $('#messageInput')?.addEventListener('input', Utils.debounce(handleTyping, 500));
  
  // File input
  $('#fileInput')?.addEventListener('change', handleFileSelect);
  
  // Reply cancel
  $('#cancelReplyButton')?.addEventListener('click', cancelReply);
  
  // Scroll for pagination
  $('#messages')?.addEventListener('scroll', Utils.throttle(handleScroll, 200));
}

// ========== Send Message ==========
async function sendMessage() {
  const input = $('#messageInput');
  const text = input.value.trim();
  
  if (!text && !state.pendingFile) return;
  
  // Optimistic UI - add temp message
  const tempId = Utils.generateId();
  const tempMsg = {
    id: tempId,
    sender_id: state.user.id,
    body: text,
    type: 'text',
    timestamp: Date.now(),
    status: 'sending'
  };
  
  state.tempMessages.set(tempId, tempMsg);
  appendTempMessageToDOM(tempMsg);
  
  // Clear input
  input.value = '';
  
  try {
    const formData = new FormData();
    formData.append('body', text);
    formData.append('type', 'text');
    if (state.replyToId) {
      formData.append('reply_to', state.replyToId);
    }
    
    const response = await fetch(apiBase + 'messages.php', {
      method: 'POST',
      headers: {
        'X-CSRF': state.csrf
      },
      body: formData
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        // Replace temp message with real one
        state.tempMessages.delete(tempId);
        await handleNewMessages([data.message]);
      }
    } else {
      throw new Error('Send failed');
    }
  } catch (error) {
    console.error('Send error:', error);
    // Mark as failed
    const tempEl = $(`.message[data-id="${tempId}"]`);
    if (tempEl) {
      tempEl.classList.add('failed');
      tempEl.title = 'ارسال ناموفق - کلیک برای تلاش مجدد';
      tempEl.addEventListener('click', () => retrySendMessage(tempId, text));
    }
    showToast('خطا در ارسال پیام', 'error');
  }
}

// ========== Toast Notification ==========
function showToast(message, type = 'info') {
  const toast = $('#toast');
  if (!toast) return;
  
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ========== Scroll Helpers ==========
function isScrolledToBottom() {
  const container = $('#messages');
  return container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
}

function scrollToBottom() {
  const container = $('#messages');
  container.scrollTop = container.scrollHeight;
}

function handleScroll() {
  const container = $('#messages');
  
  // Load older messages when scrolling to top
  if (container.scrollTop < Constants.UI.SCROLL_THRESHOLD && !state.loadingOlder) {
    loadOlderMessages();
  }
}

// ========== Load Older Messages ==========
async function loadOlderMessages() {
  if (!state.hasMoreMessages || state.loadingOlder) return;
  
  state.loadingOlder = true;
  
  try {
    const response = await fetch(apiBase + `messages.php?before=${state.firstId}&limit=${Constants.MESSAGE.BATCH_SIZE}`, {
      headers: {
        'X-CSRF': state.csrf
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.messages.length > 0) {
        // Prepend to DOM
        const fragment = document.createDocumentFragment();
        for (const msg of data.messages.reverse()) {
          state.messages.set(msg.id, msg);
          const el = createMessageElement(msg);
          fragment.insertBefore(el, fragment.firstChild);
        }
        
        const container = $('#messages');
        const oldScrollHeight = container.scrollHeight;
        container.insertBefore(fragment, container.firstChild);
        
        // Maintain scroll position
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = newScrollHeight - oldScrollHeight;
        
        // Update state
        state.firstId = data.messages[0].id;
        state.hasMoreMessages = data.messages.length === Constants.MESSAGE.BATCH_SIZE;
      }
    }
  } catch (error) {
    console.error('Load older messages error:', error);
  } finally {
    state.loadingOlder = false;
  }
}

// ========== Placeholder Functions ==========
function updateUserInfo() {
  $('#myName').textContent = state.user.name;
  $('#partnerName').textContent = state.partner.name;
  $('#conversationTitle').textContent = `${state.user.name} & ${state.partner.name}`;
}

function showLoginView() {
  $('#loginView').style.display = 'flex';
  $('#mainView').style.display = 'none';
}

function handleTyping() {
  // Typing indicator logic
  const now = Date.now();
  if (now - state.lastTypingSent > Constants.TYPING.SEND_THROTTLE) {
    sendTypingIndicator();
    state.lastTypingSent = now;
  }
}

async function sendTypingIndicator() {
  // Send typing status to server
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    // Process and upload file
  }
}

function cancelReply() {
  state.replyToId = null;
  $('#replyPreview').style.display = 'none';
}

function handleMessageClick(msg) {
  // Handle message click
}

function handleMessageContextMenu(e, msg) {
  e.preventDefault();
  // Show context menu
}

function appendTempMessageToDOM(msg) {
  const container = $('#messages');
  const el = createMessageElement(msg);
  el.classList.add('temp');
  container.appendChild(el);
  scrollToBottom();
}

function retrySendMessage(tempId, text) {
  // Retry sending failed message
  state.tempMessages.delete(tempId);
  $('#messageInput').value = text;
  sendMessage();
}

function openSearch() {
  state.searchActive = true;
  // Open search UI
}

function closeSearch() {
  state.searchActive = false;
  // Close search UI
}

function showNotification(msg) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('پیام جدید', {
      body: msg.body.substring(0, 100),
      icon: '/assets/icon-192.png',
      badge: '/assets/icon-192.png'
    });
  }
}

// ========== Start Application ==========
document.addEventListener('DOMContentLoaded', initApp);
