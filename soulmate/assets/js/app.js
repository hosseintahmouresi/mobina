/**
 * SoulMate Messenger - Main Application JavaScript
 */

// Global State
const App = {
    user: null,
    partner: null,
    csrfToken: null,
    currentMessageId: null,
    replyTo: null,
    pollingInterval: null,
    typingTimeout: null,
    lastMessageTime: 0
};

// API Base URL
const API_BASE = 'api';

// DOM Elements
const elements = {};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    checkSession();
    setupEventListeners();
});

// Initialize DOM Elements
function initializeElements() {
    // Login Page
    elements.loginPage = document.getElementById('login-page');
    elements.appPage = document.getElementById('app-page');
    elements.loginForm = document.getElementById('login-form');
    elements.pinLoginForm = document.getElementById('pin-login-form');
    elements.loginCsrfToken = document.getElementById('login-csrf-token');
    
    // Chat
    elements.messagesList = document.getElementById('messages-list');
    elements.chatContainer = document.getElementById('chat-container');
    elements.messageInput = document.getElementById('message-input');
    elements.sendBtn = document.getElementById('send-btn');
    elements.scrollBottomBtn = document.getElementById('scroll-bottom-btn');
    elements.typingStatus = document.getElementById('typing-status');
    
    // Header
    elements.headerPartnerAvatar = document.getElementById('header-partner-avatar');
    elements.headerPartnerName = document.getElementById('header-partner-name');
    
    // Composer
    elements.replyPreview = document.getElementById('reply-preview');
    elements.replyText = document.getElementById('reply-text');
    elements.closeReply = document.getElementById('close-reply');
    elements.attachBtn = document.getElementById('attach-btn');
    elements.stickerBtn = document.getElementById('sticker-btn');
    elements.voiceBtn = document.getElementById('voice-btn');
    elements.stickerPicker = document.getElementById('sticker-picker');
    elements.attachmentInput = document.getElementById('attachment-input');
    
    // Menu
    elements.sideMenu = document.getElementById('side-menu');
    elements.menuBtn = document.getElementById('menu-btn');
    elements.closeMenu = document.getElementById('close-menu');
    elements.menuOverlay = document.getElementById('menu-overlay');
    elements.menuUserName = document.getElementById('menu-user-name');
    elements.menuUserAvatar = document.getElementById('menu-user-avatar');
    
    // Modals
    elements.dashboardModal = document.getElementById('dashboard-modal');
    elements.memoriesModal = document.getElementById('memories-modal');
    elements.settingsModal = document.getElementById('settings-modal');
    elements.dashboardContent = document.getElementById('dashboard-content');
    elements.memoriesContent = document.getElementById('memories-content');
    elements.settingsContent = document.getElementById('settings-content');
    
    // Toast
    elements.toast = document.getElementById('toast');
    elements.toastMessage = document.getElementById('toast-message');
}

// Setup Event Listeners
function setupEventListeners() {
    // Login Forms
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.pinLoginForm.addEventListener('submit', handlePINLogin);
    
    document.getElementById('show-pin-login').addEventListener('click', () => {
        elements.loginForm.style.display = 'none';
        elements.pinLoginForm.style.display = 'flex';
        elements.pinLoginForm.classList.add('login-form');
    });
    
    document.getElementById('back-to-password').addEventListener('click', () => {
        elements.pinLoginForm.style.display = 'none';
        elements.loginForm.style.display = 'flex';
    });
    
    // Message Input
    elements.messageInput.addEventListener('input', handleInput);
    elements.messageInput.addEventListener('keydown', handleKeydown);
    elements.messageInput.addEventListener('focus', () => setTyping(true));
    elements.messageInput.addEventListener('blur', () => setTyping(false));
    
    // Send Button
    elements.sendBtn.addEventListener('click', sendMessage);
    
    // Scroll Button
    elements.scrollBottomBtn.addEventListener('click', scrollToBottom);
    
    // Reply
    elements.closeReply.addEventListener('click', clearReply);
    
    // Attachments
    elements.attachBtn.addEventListener('click', () => elements.attachmentInput.click());
    elements.attachmentInput.addEventListener('change', handleAttachment);
    
    // Stickers
    elements.stickerBtn.addEventListener('click', toggleStickerPicker);
    document.querySelectorAll('.sticker-item').forEach(btn => {
        btn.addEventListener('click', (e) => sendSticker(e.target.dataset.sticker));
    });
    
    // Menu
    elements.menuBtn.addEventListener('click', openMenu);
    elements.closeMenu.addEventListener('click', closeMenu);
    elements.menuOverlay.addEventListener('click', closeMenu);
    
    // Menu Navigation
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', handleMenuAction);
    });
    
    // Dashboard Button
    document.getElementById('dashboard-btn').addEventListener('click', () => {
        openModal('dashboard');
        loadDashboard();
    });
    
    // Close Modals
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });
    
    // Chat scroll detection
    elements.chatContainer.addEventListener('scroll', handleScroll);
    
    // Auto-resize textarea
    elements.messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
}

// Check Session
async function checkSession() {
    try {
        const response = await fetch(`${API_BASE}/auth.php?action=check_session`);
        const data = await response.json();
        
        if (data.success) {
            App.user = data.data.user;
            App.partner = data.data.partner;
            showApp();
            startPolling();
        } else {
            showLogin();
        }
    } catch (error) {
        console.error('Session check failed:', error);
        showLogin();
    }
}

// Show Login Page
function showLogin() {
    elements.loginPage.style.display = 'flex';
    elements.loginPage.classList.add('active');
    elements.appPage.style.display = 'none';
    elements.appPage.classList.remove('active');
    
    // Load CSRF token for login
    loadLoginCSRF();
}

// Show App
function showApp() {
    elements.loginPage.style.display = 'none';
    elements.loginPage.classList.remove('active');
    elements.appPage.style.display = 'block';
    elements.appPage.classList.add('active');
    
    // Update UI with user info
    updateUserInfo();
    
    // Load messages
    loadMessages();
}

// Update User Info in UI
function updateUserInfo() {
    if (App.partner) {
        elements.headerPartnerName.textContent = App.partner.name;
        elements.headerPartnerAvatar.src = `uploads/avatars/${App.partner.avatar}`;
        elements.headerPartnerAvatar.alt = App.partner.name;
    }
    
    if (App.user) {
        elements.menuUserName.textContent = App.user.display_name;
        elements.menuUserAvatar.src = `uploads/avatars/${App.user.avatar}`;
        
        // Apply theme
        document.body.className = App.user.theme === 'light' ? 'theme-light' : 'theme-dark';
    }
}

// Load Login CSRF Token
async function loadLoginCSRF() {
    try {
        const response = await fetch(`${API_BASE}/auth.php?action=get_csrf`);
        const data = await response.json();
        if (data.success && data.data.csrf_token) {
            elements.loginCsrfToken.value = data.data.csrf_token;
        }
    } catch (error) {
        console.error('Failed to load CSRF token');
    }
}

// Handle Login
async function handleLogin(e) {
    e.preventDefault();
    
    const formData = new FormData(elements.loginForm);
    formData.append('action', 'login');
    
    const submitBtn = elements.loginForm.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoading = submitBtn.querySelector('.btn-loading');
    
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';
    submitBtn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/auth.php`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            App.user = data.data.user;
            App.partner = data.data.partner;
            App.csrfToken = data.data.csrf_token;
            
            showToast('خوش آمدید! 💕');
            showApp();
            startPolling();
        } else {
            showToast(data.error || 'ورود ناموفق بود', 'error');
        }
    } catch (error) {
        console.error('Login failed:', error);
        showToast('خطا در ارتباط با سرور', 'error');
    } finally {
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
        submitBtn.disabled = false;
    }
}

// Handle PIN Login
async function handlePINLogin(e) {
    e.preventDefault();
    
    const formData = new FormData(elements.pinLoginForm);
    formData.append('action', 'login_with_pin');
    
    try {
        const response = await fetch(`${API_BASE}/auth.php`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            App.user = data.data.user;
            App.partner = data.data.partner;
            
            showToast('خوش آمدید! 💕');
            showApp();
            startPolling();
        } else {
            showToast(data.error || 'ورود با PIN ناموفق بود', 'error');
        }
    } catch (error) {
        console.error('PIN login failed:', error);
        showToast('خطا در ارتباط با سرور', 'error');
    }
}

// Load Messages
async function loadMessages(page = 1) {
    try {
        const response = await fetch(`${API_BASE}/messages.php?action=get_messages&page=${page}`);
        const data = await response.json();
        
        if (data.success) {
            if (page === 1) {
                elements.messagesList.innerHTML = '';
            }
            
            data.data.messages.forEach(msg => {
                renderMessage(msg);
            });
            
            if (page === 1) {
                scrollToBottom();
            }
            
            // Start polling for new messages
            if (!App.pollingInterval) {
                startPolling();
            }
        }
    } catch (error) {
        console.error('Failed to load messages:', error);
    }
}

// Render Message
function renderMessage(message) {
    const isSent = message.sender_id == App.user.id;
    const messageEl = document.createElement('div');
    messageEl.className = `message ${isSent ? 'sent' : 'received'} ${message.message_type}`;
    messageEl.dataset.id = message.id;
    
    let content = escapeHtml(message.content);
    
    // Handle different message types
    if (message.message_type === 'sticker') {
        content = `<span style="font-size: 3rem;">${content}</span>`;
    }
    
    // Format timestamp
    const time = formatTime(message.sent_at);
    
    // Status icon
    let statusIcon = '';
    if (isSent) {
        if (message.read_at) statusIcon = '✓✓';
        else if (message.delivered_at) statusIcon = '✓✓';
        else statusIcon = '✓';
    }
    
    // Reactions
    let reactionsHtml = '';
    if (message.reactions) {
        const reactions = JSON.parse(message.reactions);
        if (reactions.length > 0) {
            reactionsHtml = '<div class="message-reactions">';
            reactions.forEach(r => {
                reactionsHtml += `<span class="reaction">${r.reaction}</span>`;
            });
            reactionsHtml += '</div>';
        }
    }
    
    messageEl.innerHTML = `
        <div class="message-bubble">
            <div class="message-content">${content}</div>
            <div class="message-meta">
                <span class="message-time">${time}</span>
                ${statusIcon ? `<span class="message-status">${statusIcon}</span>` : ''}
            </div>
            ${reactionsHtml}
        </div>
    `;
    
    // Add context menu for messages
    messageEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showMessageOptions(message, e.clientX, e.clientY);
    });
    
    // Double tap for reaction
    let lastTap = 0;
    messageEl.addEventListener('touchend', (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        if (tapLength < 500 && tapLength > 0) {
            addReaction(message.id, '❤');
            e.preventDefault();
        }
        lastTap = currentTime;
    });
    
    elements.messagesList.appendChild(messageEl);
    App.lastMessageTime = Math.max(App.lastMessageTime, new Date(message.sent_at).getTime());
}

// Show Message Options
function showMessageOptions(message, x, y) {
    // Simple implementation - in full version would show a popup menu
    const canEdit = message.sender_id == App.user.id && message.edit_deadline;
    const canDelete = message.sender_id == App.user.id && message.delete_deadline;
    
    if (canDelete) {
        if (confirm('آیا می‌خواهید این پیام را حذف کنید؟')) {
            deleteMessage(message.id);
        }
    }
}

// Send Message
async function sendMessage() {
    const content = elements.messageInput.value.trim();
    if (!content) return;
    
    const formData = new FormData();
    formData.append('action', 'send_message');
    formData.append('csrf_token', App.csrfToken || '');
    formData.append('content', content);
    formData.append('message_type', 'text');
    
    if (App.replyTo) {
        formData.append('reply_to_id', App.replyTo);
    }
    
    try {
        const response = await fetch(`${API_BASE}/messages.php`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderMessage(data.data.message);
            elements.messageInput.value = '';
            elements.messageInput.style.height = 'auto';
            clearReply();
            scrollToBottom();
            
            // Mark as read
            markAsRead();
        } else {
            showToast(data.error || 'ارسال پیام ناموفق بود', 'error');
        }
    } catch (error) {
        console.error('Send message failed:', error);
        showToast('خطا در ارسال پیام', 'error');
    }
}

// Send Sticker
async function sendSticker(sticker) {
    const formData = new FormData();
    formData.append('action', 'send_message');
    formData.append('csrf_token', App.csrfToken || '');
    formData.append('content', sticker);
    formData.append('message_type', 'sticker');
    
    try {
        const response = await fetch(`${API_BASE}/messages.php`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderMessage(data.data.message);
            toggleStickerPicker();
            scrollToBottom();
        }
    } catch (error) {
        console.error('Send sticker failed:', error);
    }
}

// Set Typing Status
async function setTyping(isTyping) {
    clearTimeout(App.typingTimeout);
    
    if (isTyping) {
        App.typingTimeout = setTimeout(() => {
            sendTypingStatus(1);
        }, 500);
    } else {
        sendTypingStatus(0);
    }
}

async function sendTypingStatus(isTyping) {
    const formData = new FormData();
    formData.append('action', 'set_typing');
    formData.append('is_typing', isTyping);
    
    try {
        await fetch(`${API_BASE}/messages.php`, {
            method: 'POST',
            body: formData
        });
    } catch (error) {
        console.error('Set typing failed:', error);
    }
}

// Check Typing Status
async function checkTypingStatus() {
    try {
        const response = await fetch(`${API_BASE}/messages.php?action=get_typing`);
        const data = await response.json();
        
        if (data.success) {
            elements.typingStatus.style.display = data.data.is_typing ? 'block' : 'none';
        }
    } catch (error) {
        console.error('Check typing failed:', error);
    }
}

// Mark Messages as Read
async function markAsRead() {
    const formData = new FormData();
    formData.append('action', 'mark_read');
    
    try {
        await fetch(`${API_BASE}/messages.php`, {
            method: 'POST',
            body: formData
        });
    } catch (error) {
        console.error('Mark read failed:', error);
    }
}

// Delete Message
async function deleteMessage(messageId) {
    const formData = new FormData();
    formData.append('action', 'delete_message');
    formData.append('csrf_token', App.csrfToken || '');
    formData.append('message_id', messageId);
    
    try {
        const response = await fetch(`${API_BASE}/messages.php`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            const msgEl = document.querySelector(`.message[data-id="${messageId}"]`);
            if (msgEl) {
                msgEl.remove();
            }
            showToast('پیام حذف شد');
        } else {
            showToast(data.error || 'حذف پیام ناموفق بود', 'error');
        }
    } catch (error) {
        console.error('Delete message failed:', error);
        showToast('خطا در حذف پیام', 'error');
    }
}

// Add Reaction
async function addReaction(messageId, reaction) {
    const formData = new FormData();
    formData.append('action', 'add_reaction');
    formData.append('csrf_token', App.csrfToken || '');
    formData.append('message_id', messageId);
    formData.append('reaction', reaction);
    
    try {
        const response = await fetch(`${API_BASE}/messages.php`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Reload message to show reactions
            loadMessages();
        }
    } catch (error) {
        console.error('Add reaction failed:', error);
    }
}

// Handle Input
function handleInput() {
    // Auto-resize handled by CSS
}

// Handle Keydown
function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

// Toggle Sticker Picker
function toggleStickerPicker() {
    const isVisible = elements.stickerPicker.style.display !== 'none';
    elements.stickerPicker.style.display = isVisible ? 'none' : 'block';
}

// Handle Attachment
function handleAttachment(e) {
    const files = e.target.files;
    if (files.length === 0) return;
    
    // In full version, would upload files and send as message
    showToast('امکان آپلود فایل به زودی اضافه می‌شود', 'info');
    e.target.value = '';
}

// Clear Reply
function clearReply() {
    App.replyTo = null;
    elements.replyPreview.style.display = 'none';
}

// Scroll to Bottom
function scrollToBottom() {
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
    elements.scrollBottomBtn.style.display = 'none';
}

// Handle Scroll
function handleScroll() {
    const scrollTop = elements.chatContainer.scrollTop;
    const scrollHeight = elements.chatContainer.scrollHeight;
    const clientHeight = elements.chatContainer.clientHeight;
    
    if (scrollHeight - scrollTop - clientHeight > 200) {
        elements.scrollBottomBtn.style.display = 'block';
    } else {
        elements.scrollBottomBtn.style.display = 'none';
    }
}

// Open Menu
function openMenu() {
    elements.sideMenu.classList.add('open');
}

// Close Menu
function closeMenu() {
    elements.sideMenu.classList.remove('open');
}

// Handle Menu Action
function handleMenuAction(e) {
    e.preventDefault();
    const action = e.currentTarget.dataset.action;
    
    closeMenu();
    
    switch (action) {
        case 'dashboard':
            openModal('dashboard');
            loadDashboard();
            break;
        case 'memories':
            openModal('memories');
            loadMemories();
            break;
        case 'settings':
            openModal('settings');
            loadSettings();
            break;
        case 'logout':
            handleLogout();
            break;
    }
}

// Open Modal
function openModal(type) {
    closeAllModals();
    
    switch (type) {
        case 'dashboard':
            elements.dashboardModal.classList.add('active');
            break;
        case 'memories':
            elements.memoriesModal.classList.add('active');
            break;
        case 'settings':
            elements.settingsModal.classList.add('active');
            break;
    }
}

// Close All Modals
function closeAllModals() {
    elements.dashboardModal.classList.remove('active');
    elements.memoriesModal.classList.remove('active');
    elements.settingsModal.classList.remove('active');
}

// Load Dashboard
async function loadDashboard() {
    elements.dashboardContent.innerHTML = '<div class="spinner"></div><p style="text-align:center;margin-top:1rem;">در حال بارگذاری...</p>';
    
    try {
        // Calculate days together
        let daysTogether = 0;
        if (App.user.relationship_start_date) {
            const start = new Date(App.user.relationship_start_date);
            const now = new Date();
            daysTogether = Math.floor((now - start) / (1000 * 60 * 60 * 24));
        }
        
        elements.dashboardContent.innerHTML = `
            <div class="dashboard-grid">
                <div class="dashboard-card">
                    <h3>روزهای با هم بودن</h3>
                    <div class="value">${daysTogether.toLocaleString('fa-IR')}</div>
                </div>
                <div class="dashboard-card">
                    <h3>جمله روز</h3>
                    <div class="value" style="font-size:1.2rem;">${App.user.daily_quote || 'عشق ما، داستان ماست ✨'}</div>
                </div>
                <div class="dashboard-card">
                    <h3>شریک زندگی</h3>
                    <div class="value" style="font-size:1.5rem;">${App.partner?.name || '---'}</div>
                </div>
            </div>
            
            <div style="margin-top:2rem;text-align:center;">
                <p style="color:var(--text-secondary);margin-bottom:1rem;">به زودی امکانات بیشتری اضافه خواهد شد</p>
            </div>
        `;
    } catch (error) {
        console.error('Load dashboard failed:', error);
        elements.dashboardContent.innerHTML = '<p style="text-align:center;color:var(--error-color);">خطا در بارگذاری داشبورد</p>';
    }
}

// Load Memories
async function loadMemories() {
    elements.memoriesContent.innerHTML = '<div class="spinner"></div><p style="text-align:center;margin-top:1rem;">در حال بارگذاری خاطرات...</p>';
    
    // In full version, would load from API
    setTimeout(() => {
        elements.memoriesContent.innerHTML = `
            <div style="text-align:center;padding:2rem;">
                <p style="color:var(--text-secondary);">هنوز خاطره‌ای ثبت نشده است</p>
                <button class="btn btn-primary" style="margin-top:1rem;">ثبت خاطره جدید</button>
            </div>
        `;
    }, 500);
}

// Load Settings
async function loadSettings() {
    elements.settingsContent.innerHTML = `
        <div class="form-group">
            <label>تم</label>
            <select class="form-control" onchange="changeTheme(this.value)" style="width:100%;padding:0.75rem;border-radius:0.5rem;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);">
                <option value="dark" ${App.user?.theme === 'dark' ? 'selected' : ''}>تاریک</option>
                <option value="light" ${App.user?.theme === 'light' ? 'selected' : ''}>روشن</option>
            </select>
        </div>
        
        <div style="margin-top:1.5rem;">
            <button class="btn btn-secondary btn-block" onclick="handleLogout()">خروج از حساب</button>
        </div>
    `;
}

// Change Theme
async function changeTheme(theme) {
    document.body.className = theme === 'light' ? 'theme-light' : 'theme-dark';
    
    // In full version, would save to server
    App.user.theme = theme;
}

// Handle Logout
async function handleLogout() {
    try {
        const formData = new FormData();
        formData.append('action', 'logout');
        
        await fetch(`${API_BASE}/auth.php`, {
            method: 'POST',
            body: formData
        });
    } catch (error) {
        console.error('Logout failed:', error);
    } finally {
        location.reload();
    }
}

// Start Polling
function startPolling() {
    if (App.pollingInterval) {
        clearInterval(App.pollingInterval);
    }
    
    // Poll for new messages every 2 seconds
    App.pollingInterval = setInterval(async () => {
        await loadNewMessages();
        await checkTypingStatus();
    }, 2000);
}

// Load New Messages
async function loadNewMessages() {
    try {
        const response = await fetch(`${API_BASE}/messages.php?action=get_messages&page=1`);
        const data = await response.json();
        
        if (data.success) {
            const messages = data.data.messages;
            const newMessages = messages.filter(msg => 
                new Date(msg.sent_at).getTime() > App.lastMessageTime
            );
            
            newMessages.forEach(msg => {
                renderMessage(msg);
            });
            
            if (newMessages.length > 0) {
                scrollToBottom();
                
                // Show notification if not focused
                if (document.hidden) {
                    showNotification(`${newMessages.length} پیام جدید`);
                }
            }
        }
    } catch (error) {
        console.error('Polling failed:', error);
    }
}

// Show Notification
function showNotification(message) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('SoulMate 💕', {
            body: message,
            icon: 'assets/images/icon-192.png'
        });
    }
}

// Request Notification Permission
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// Toast Notification
function showToast(message, type = 'success') {
    elements.toastMessage.textContent = message;
    elements.toast.classList.add('show');
    
    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 3000);
}

// Utility Functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(dateString) {
    const date = new Date(dateString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Service Worker Message Handler
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data.type === 'NEW_MESSAGE') {
            loadNewMessages();
        }
    });
}

// Visibility Change Handler
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        markAsRead();
    }
});

// Online/Offline Handler
window.addEventListener('online', () => {
    showToast('متصل شدید 🌐');
    loadNewMessages();
});

window.addEventListener('offline', () => {
    showToast('قطع اتصال - پیام‌ها ذخیره می‌شوند', 'warning');
});
