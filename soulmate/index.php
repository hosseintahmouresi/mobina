<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="theme-color" content="#6366f1">
    <meta name="description" content="SoulMate - پیامرسان عاشقانه شما">
    <title>SoulMate 💕 | پیامرسان عاشقانه</title>
    
    <!-- PWA Manifest -->
    <link rel="manifest" href="manifest.json">
    <link rel="apple-touch-icon" href="assets/images/icon-192.png">
    
    <!-- Styles -->
    <link rel="stylesheet" href="assets/css/style.css">
    
    <!-- Favicon -->
    <link rel="icon" type="image/png" href="assets/images/favicon.png">
</head>
<body class="theme-dark">
    <!-- Login Page -->
    <div id="login-page" class="page active">
        <div class="login-container">
            <div class="login-card glass">
                <div class="login-header">
                    <div class="logo">💕</div>
                    <h1>SoulMate</h1>
                    <p class="subtitle">پیامرسان عاشقانه ما</p>
                </div>
                
                <form id="login-form" class="login-form">
                    <input type="hidden" name="csrf_token" id="login-csrf-token">
                    
                    <div class="form-group">
                        <label for="username">نام کاربری</label>
                        <input type="text" id="username" name="username" placeholder="مثلاً: hossein" required autocomplete="username">
                    </div>
                    
                    <div class="form-group">
                        <label for="password">رمز عبور</label>
                        <input type="password" id="password" name="password" placeholder="••••••••" required autocomplete="current-password">
                    </div>
                    
                    <button type="submit" class="btn btn-primary btn-block">
                        <span class="btn-text">ورود</span>
                        <span class="btn-loading" style="display: none;">در حال ورود...</span>
                    </button>
                    
                    <div class="login-options">
                        <button type="button" class="btn btn-secondary" id="show-pin-login">
                            ورود با PIN 🔢
                        </button>
                    </div>
                </form>
                
                <form id="pin-login-form" class="login-form" style="display: none;">
                    <div class="form-group">
                        <label for="pin-username">نام کاربری</label>
                        <input type="text" id="pin-username" name="username" placeholder="مثلاً: hossein" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="pin-code">کد PIN</label>
                        <input type="password" id="pin-code" name="pin" maxlength="8" placeholder="۴ تا ۸ رقم" inputmode="numeric" required>
                    </div>
                    
                    <button type="submit" class="btn btn-primary btn-block">
                        ورود با PIN
                    </button>
                    
                    <button type="button" class="btn btn-secondary btn-block" id="back-to-password">
                        بازگشت به رمز عبور
                    </button>
                </form>
                
                <div class="login-footer">
                    <p>کاربران تست: hossein / mobina</p>
                    <p class="hint">رمز عبور پیش‌فرض: hossein123 یا mobina123</p>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Main App -->
    <div id="app-page" class="page" style="display: none;">
        <!-- Header -->
        <header class="app-header glass">
            <div class="header-right">
                <button class="btn-icon" id="menu-btn">☰</button>
            </div>
            
            <div class="header-center">
                <div class="partner-info">
                    <img src="" alt="" class="partner-avatar" id="header-partner-avatar">
                    <div class="partner-details">
                        <h2 id="header-partner-name">شریک من</h2>
                        <span class="typing-status" id="typing-status" style="display: none;">در حال تایپ...</span>
                    </div>
                </div>
            </div>
            
            <div class="header-left">
                <button class="btn-icon" id="dashboard-btn">💕</button>
            </div>
        </header>
        
        <!-- Chat Container -->
        <main class="chat-container" id="chat-container">
            <div class="messages-list" id="messages-list">
                <div class="messages-loading" id="messages-loading">
                    <div class="spinner"></div>
                    <p>در حال بارگذاری پیام‌ها...</p>
                </div>
                <!-- Messages will be inserted here -->
            </div>
            
            <!-- Scroll to bottom button -->
            <button class="scroll-bottom-btn" id="scroll-bottom-btn" style="display: none;">
                ↓
            </button>
        </main>
        
        <!-- Message Composer -->
        <footer class="message-composer glass">
            <div class="composer-top" id="reply-preview" style="display: none;">
                <div class="reply-content">
                    <span class="reply-label">در حال پاسخ به:</span>
                    <span class="reply-text" id="reply-text"></span>
                </div>
                <button class="btn-icon close-reply" id="close-reply">×</button>
            </div>
            
            <div class="composer-main">
                <button class="btn-icon composer-btn" id="attach-btn">📎</button>
                
                <div class="message-input-container">
                    <textarea 
                        id="message-input" 
                        placeholder="پیام خود را بنویسید..." 
                        rows="1"
                        maxlength="4000"
                    ></textarea>
                    
                    <div class="input-actions">
                        <button class="btn-icon" id="sticker-btn" title="استیکر">😊</button>
                        <button class="btn-icon" id="voice-btn" title="پیام صوتی">🎙️</button>
                    </div>
                </div>
                
                <button class="btn btn-primary send-btn" id="send-btn">
                    ارسال ➤
                </button>
            </div>
            
            <!-- Sticker Picker -->
            <div class="sticker-picker" id="sticker-picker" style="display: none;">
                <div class="sticker-grid">
                    <button class="sticker-item" data-sticker="💌">💌</button>
                    <button class="sticker-item" data-sticker="🫶">🫶</button>
                    <button class="sticker-item" data-sticker="💋">💋</button>
                    <button class="sticker-item" data-sticker="🥰">🥰</button>
                    <button class="sticker-item" data-sticker="✨">✨</button>
                    <button class="sticker-item" data-sticker="🌙">🌙</button>
                    <button class="sticker-item" data-sticker="🧸">🧸</button>
                    <button class="sticker-item" data-sticker="🌹">🌹</button>
                </div>
            </div>
        </footer>
        
        <!-- Side Menu -->
        <div class="side-menu" id="side-menu">
            <div class="menu-overlay" id="menu-overlay"></div>
            <div class="menu-content glass">
                <div class="menu-header">
                    <div class="user-info">
                        <img src="" alt="" class="user-avatar" id="menu-user-avatar">
                        <div class="user-details">
                            <h3 id="menu-user-name">کاربر</h3>
                            <p id="menu-user-status">آنلاین</p>
                        </div>
                    </div>
                    <button class="btn-icon close-menu" id="close-menu">×</button>
                </div>
                
                <nav class="menu-nav">
                    <a href="#" class="menu-item" data-action="dashboard">
                        <span class="menu-icon">💕</span>
                        <span>بخش عشقمون</span>
                    </a>
                    <a href="#" class="menu-item" data-action="memories">
                        <span class="menu-icon">📸</span>
                        <span>خاطرات</span>
                    </a>
                    <a href="#" class="menu-item" data-action="settings">
                        <span class="menu-icon">⚙️</span>
                        <span>تنظیمات</span>
                    </a>
                    <a href="#" class="menu-item" data-action="search">
                        <span class="menu-icon">🔍</span>
                        <span>جستجو</span>
                    </a>
                    <hr class="menu-divider">
                    <a href="#" class="menu-item" data-action="logout">
                        <span class="menu-icon">🚪</span>
                        <span>خروج</span>
                    </a>
                </nav>
            </div>
        </div>
        
        <!-- Dashboard Modal -->
        <div class="modal" id="dashboard-modal">
            <div class="modal-content glass large">
                <div class="modal-header">
                    <h2>بخش عشقمون 💕</h2>
                    <button class="btn-icon close-modal">×</button>
                </div>
                <div class="modal-body" id="dashboard-content">
                    <!-- Dashboard content loaded dynamically -->
                </div>
            </div>
        </div>
        
        <!-- Memories Modal -->
        <div class="modal" id="memories-modal">
            <div class="modal-content glass large">
                <div class="modal-header">
                    <h2>خاطرات ما 📸</h2>
                    <button class="btn-icon close-modal">×</button>
                </div>
                <div class="modal-body" id="memories-content">
                    <!-- Memories content loaded dynamically -->
                </div>
            </div>
        </div>
        
        <!-- Settings Modal -->
        <div class="modal" id="settings-modal">
            <div class="modal-content glass">
                <div class="modal-header">
                    <h2>تنظیمات ⚙️</h2>
                    <button class="btn-icon close-modal">×</button>
                </div>
                <div class="modal-body" id="settings-content">
                    <!-- Settings content loaded dynamically -->
                </div>
            </div>
        </div>
        
        <!-- Toast Notification -->
        <div class="toast" id="toast">
            <span class="toast-message" id="toast-message"></span>
        </div>
        
        <!-- Attachment Input (hidden) -->
        <input type="file" id="attachment-input" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" style="display: none;">
    </div>
    
    <!-- Service Worker Registration -->
    <script>
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js')
                    .then(reg => console.log('Service Worker registered'))
                    .catch(err => console.error('SW registration failed:', err));
            });
        }
    </script>
    
    <!-- Scripts -->
    <script src="assets/js/app.js"></script>
</body>
</html>
