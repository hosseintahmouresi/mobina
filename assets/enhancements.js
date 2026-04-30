/* ============================================
   SoulMate 3.2.2 - JavaScript Enhancements
   ============================================ */

'use strict';

// ========== NETWORK STATUS INDICATOR ==========
class NetworkStatusIndicator {
    constructor() {
        this.createIndicator();
        this.init();
    }

    createIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'network-status';
        indicator.innerHTML = `
            <div class="network-dot"></div>
            <span id="networkStatusText">بررسی اتصال...</span>
        `;
        document.body.appendChild(indicator);
        this.indicator = indicator;
        this.statusText = indicator.querySelector('#networkStatusText');
    }

    init() {
        window.addEventListener('online', () => this.show('آنلاین', false));
        window.addEventListener('offline', () => this.show('آفلاین', true));
        if (!navigator.onLine) {
            this.show('آفلاین', true);
        }
    }

    checkSpeed() {
        if (!navigator.onLine) {
            this.show('آفلاین', true);
        }
    }

    show(text, isOffline = false, isSlow = false) {
        this.statusText.textContent = text;
        this.indicator.classList.toggle('is-offline', isOffline);
        this.indicator.classList.toggle('is-slow', isSlow);
        this.indicator.classList.add('is-visible');
        
        if (!isOffline && !isSlow) {
            setTimeout(() => this.indicator.classList.remove('is-visible'), 2000);
        }
    }
}

// ========== MESSAGE UNDO & DELETE ==========
class MessageManager {
    constructor() {
        this.messageHistory = new Map();
        this.undoTimeouts = new Map();
        this.UNDO_TIMEOUT = 5 * 60 * 1000;
    }

    addMessage(messageId, data) {
        this.messageHistory.set(messageId, {
            id: messageId,
            data: data,
            timestamp: Date.now()
        });
    }

    async undoMessage(messageId) {
        const message = this.messageHistory.get(messageId);
        if (!message) return false;

        try {
            const csrf = window.SoulMateApp?.getCsrf?.() || '';
            const response = await fetch(new URL('api/messages.php', document.baseURI), {
                method: 'DELETE',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    ...(csrf ? { 'X-Mobina-CSRF': csrf } : {})
                },
                body: JSON.stringify({ message_id: messageId })
            });

            if (response.ok) {
                this.messageHistory.delete(messageId);
                return true;
            }
        } catch (e) {
            console.error('Undo failed:', e);
        }
        return false;
    }

    markMessageForUndo(messageElement) {
        const messageId = messageElement.dataset.id;
        
        // Add undo button
        const undoBtn = document.createElement('button');
        undoBtn.className = 'message-undo-btn';
        undoBtn.textContent = 'حذف پیام';
        undoBtn.addEventListener('click', () => {
            this.undoMessage(messageId);
            messageElement.style.opacity = '0.5';
            messageElement.style.pointerEvents = 'none';
        });

        const bubble = messageElement.querySelector('.bubble');
        if (bubble) {
            bubble.appendChild(undoBtn);
        }

        // Auto-hide after timeout
        this.undoTimeouts.set(messageId, setTimeout(() => {
            undoBtn.remove();
        }, this.UNDO_TIMEOUT));
    }
}

// ========== LAZY LOADING ==========
class LazyLoader {
    constructor() {
        this.observer = new IntersectionObserver(
            (entries) => this.loadVisible(entries),
            { rootMargin: '50px' }
        );
    }

    observe(container) {
        const images = container.querySelectorAll('img[data-src]');
        const videos = container.querySelectorAll('video[data-src]');
        
        [...images, ...videos].forEach(el => this.observer.observe(el));
    }

    loadVisible(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const src = el.dataset.src;
                
                if (el.tagName === 'IMG') {
                    el.src = src;
                    el.classList.add('fade-in');
                } else if (el.tagName === 'VIDEO') {
                    el.src = src;
                    el.play();
                }
                
                el.removeAttribute('data-src');
                this.observer.unobserve(el);
            }
        });
    }
}

// ========== SEARCH & FILTER ==========
class MessageSearch {
    constructor() {
        this.messages = new Map();
        this.searchTimeout = null;
    }

    addMessages(messages) {
        messages.forEach(msg => {
            this.messages.set(msg.id, msg);
        });
    }

    search(query) {
        if (!query) return Array.from(this.messages.values());

        const lowerQuery = query.toLowerCase();
        return Array.from(this.messages.values()).filter(msg => {
            const body = (msg.body || '').toLowerCase();
            return body.includes(lowerQuery);
        });
    }

    async apiSearch(query) {
        try {
            const response = await fetch(
                new URL(`api/messages.php?search=${encodeURIComponent(query)}`, document.baseURI)
            );
            if (response.ok) {
                return await response.json();
            }
        } catch (e) {
            console.error('Search failed:', e);
        }
        return [];
    }
}

// ========== AUTO-LOGOUT ==========
class AutoLogout {
    constructor(timeoutMs = 30 * 60 * 1000) { // 30 minutes default
        this.timeoutMs = timeoutMs;
        this.warningMs = timeoutMs - 2 * 60 * 1000; // Warn 2 minutes before
        this.timeoutId = null;
        this.warningId = null;
        this.init();
    }

    init() {
        document.addEventListener('mousemove', () => this.reset());
        document.addEventListener('keydown', () => this.reset());
        document.addEventListener('touchstart', () => this.reset());
        document.addEventListener('click', () => this.reset());
        
        this.reset();
    }

    reset() {
        clearTimeout(this.timeoutId);
        clearTimeout(this.warningId);
        if (window.SoulMateApp?.isAuthenticated && !window.SoulMateApp.isAuthenticated()) {
            return;
        }
        
        this.warningId = setTimeout(() => this.warn(), this.warningMs);
        this.timeoutId = setTimeout(() => this.logout(), this.timeoutMs);
    }

    warn() {
        const warning = document.createElement('div');
        warning.className = 'auto-logout-warning';
        warning.innerHTML = `
            <strong>⏱️ آخرین فرصت!</strong><br>
            شما در ۲ دقیقه خودکار logout می‌شوید.
        `;
        document.body.appendChild(warning);
        
        setTimeout(() => warning.remove(), 5000);
    }

    async logout() {
        if (window.SoulMateApp?.isAuthenticated && !window.SoulMateApp.isAuthenticated()) {
            return;
        }
        if (window.SoulMateApp?.logout) {
            await window.SoulMateApp.logout();
            return;
        }
        const csrf = window.SoulMateApp?.getCsrf?.() || '';
        await fetch(new URL('api/auth.php', document.baseURI), {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                ...(csrf ? { 'X-Mobina-CSRF': csrf } : {})
            },
            body: JSON.stringify({ action: 'logout' })
        });
        location.reload();
    }
}

// ========== TYPING INDICATOR ==========
class TypingIndicator {
    constructor() {
        this.isTyping = false;
        this.timeout = null;
    }

    show() {
        const typingLine = document.querySelector('.typing-line');
        if (!typingLine) return;

        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.innerHTML = '<span></span><span></span><span></span>';
        
        typingLine.innerHTML = '🔤 درحال تایپ...';
        typingLine.appendChild(indicator);
        this.isTyping = true;
    }

    hide() {
        const typingLine = document.querySelector('.typing-line');
        if (typingLine) {
            typingLine.innerHTML = '';
            this.isTyping = false;
        }
    }
}

// ========== SMOOTH SCROLL WITH LOADING ==========
class SmartScroll {
    constructor(container) {
        this.container = container;
        this.isLoading = false;
        this.page = 0;
        this.init();
    }

    init() {
        this.container.addEventListener('scroll', () => {
            if (this.isNearTop() && !this.isLoading) {
                this.loadMore();
            }
        });
    }

    isNearTop() {
        return this.container.scrollTop < 100;
    }

    async loadMore() {
        this.isLoading = true;
        this.page++;

        try {
            const response = await fetch(
                new URL(`api/messages.php?page=${this.page}`, document.baseURI)
            );
            if (response.ok) {
                const data = await response.json();
                this.onMessagesLoaded(data.messages);
            }
        } catch (e) {
            console.error('Load more failed:', e);
        } finally {
            this.isLoading = false;
        }
    }

    onMessagesLoaded(messages) {
        // Override in subclass
    }
}

// ========== EMOJI PICKER ==========
class EmojiPicker {
    constructor(triggerElement) {
        this.trigger = triggerElement;
        this.emojis = ['❤️', '😍', '💌', '🎉', '💡', '🎯', '📅', '🎪', '📸', '🤝', '🪄'];
        this.create();
    }

    create() {
        const picker = document.createElement('div');
        picker.className = 'emoji-picker';
        picker.hidden = true;

        this.emojis.forEach(emoji => {
            const btn = document.createElement('button');
            btn.textContent = emoji;
            btn.addEventListener('click', () => this.onEmojiSelect(emoji));
            picker.appendChild(btn);
        });

        this.trigger.parentElement?.appendChild(picker);
        
        this.trigger.addEventListener('click', () => {
            picker.hidden = !picker.hidden;
        });

        this.picker = picker;
    }

    onEmojiSelect(emoji) {
        const input = document.querySelector('#messageInput');
        if (input) {
            input.value += emoji;
            input.focus();
        }
        this.picker.hidden = true;
    }
}

// ========== CANVAS PARTICLES (Smart Heart Burst with Gyroscope) ==========
class ParticleEngine {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.tiltX = 0;

        this.canvas.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:99999;';
        document.body.appendChild(this.canvas);

        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // اتصال به ژیروسکوپ گوشی (Device Orientation)
        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', (e) => {
                if (e.gamma !== null) {
                    // e.gamma میزان خم شدن گوشی به چپ و راست است
                    this.tiltX = Math.max(-45, Math.min(45, e.gamma)) / 45; // نرمال‌سازی بین -1 تا 1
                }
            });
        }

        this.loop();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    burst(x, y, mode) {
        const count = 35; // تعداد ذرات
        const colors = mode === 'letter' ? ['#ff3d7f', '#ffffff', '#f5a623', '#8b5cf6'] : ['#ff3d7f', '#ff7eb3', '#fff1f2', '#ff0055'];
        const emojis = mode === 'letter' ? ['✉', '❤', '✨', '💌'] : ['❤', '♡', '✨', '💖', '🥰'];

        for (let i = 0; i < count; i++) {
            const angle = (Math.random() * Math.PI * 2);
            const speed = Math.random() * 15 + 5;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 8, // نیروی پرتاب به سمت بالا
                life: 1,
                decay: Math.random() * 0.015 + 0.01,
                char: emojis[Math.floor(Math.random() * emojis.length)],
                color: colors[Math.floor(Math.random() * colors.length)],
                size: Math.random() * 24 + 16,
                angle: Math.random() * Math.PI * 2,
                spin: (Math.random() - 0.5) * 0.3
            });
        }
    }

    loop() {
        requestAnimationFrame(() => this.loop());
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            
            // فیزیک ذرات
            p.x += p.vx + (this.tiltX * 12); // تاثیر باد (ژیروسکوپ)
            p.y += p.vy;
            p.vy += 0.5; // جاذبه زمین
            p.angle += p.spin;
            p.life -= p.decay;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            // رندر کردن روی صفحه
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.angle);
            this.ctx.globalAlpha = p.life;
            this.ctx.font = `${p.size}px sans-serif`;
            this.ctx.fillStyle = p.color;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            // افکت درخشش ملایم (Glow)
            this.ctx.shadowColor = p.color;
            this.ctx.shadowBlur = 10;
            
            this.ctx.fillText(p.char, 0, 0);
            this.ctx.restore();
        }
    }
}

// ========== DYNAMIC THEMING (Glassmorphism Color Extraction) ==========
class DynamicThemer {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }

    applyFromImage(file) {
        if (!file || !file.type.startsWith('image/')) return;
        
        const url = URL.createObjectURL(file);
        const img = new Image();
        
        img.onload = () => {
            this.canvas.width = 64;
            this.canvas.height = 64;
            this.ctx.drawImage(img, 0, 0, 64, 64);
            
            try {
                const data = this.ctx.getImageData(0, 0, 64, 64).data;
                let r = 0, g = 0, b = 0, count = 0;
                
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i+3] > 128) { // رد کردن پیکسل‌های شفاف
                        r += data[i];
                        g += data[i+1];
                        b += data[i+2];
                        count++;
                    }
                }
                
                if (count > 0) {
                    r = Math.floor(r / count);
                    g = Math.floor(g / count);
                    b = Math.floor(b / count);
                    
                    document.documentElement.style.setProperty('--dynamic-theme-color', `rgba(${r}, ${g}, ${b}, 0.3)`);
                    document.documentElement.style.setProperty('--dynamic-theme-color-dark', `rgba(${r}, ${g}, ${b}, 0.15)`);
                    document.body.classList.add('has-dynamic-theme');
                }
            } catch (e) {
                console.warn("Could not extract image color", e);
            }
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }

    reset() {
        document.body.classList.remove('has-dynamic-theme');
    }
}

// ========== HAPTIC ENGINE (Advanced Vibrations) ==========
class HapticManager {
    light() {
        if (navigator.vibrate) navigator.vibrate(15);
    }
    heavy() {
        if (navigator.vibrate) navigator.vibrate([40, 20, 40]);
    }
    heartbeat() {
        // الگوی ریتمیک شبیه ضربان قلب
        if (navigator.vibrate) navigator.vibrate([50, 80, 50, 250, 50, 80, 50]);
    }
    success() {
        if (navigator.vibrate) navigator.vibrate([20, 40, 40]);
    }
}

// ========== BIOMETRIC AUTHENTICATION (WebAuthn) ==========
class BiometricAuth {
    static async isAvailable() {
        return window.PublicKeyCredential !== undefined &&
               typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function' &&
               await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }

    static b64ToBuffer(value) { // Helper function for WebAuthn
        const padding = '='.repeat((4 - value.length % 4) % 4);
        const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
        return Uint8Array.from([...raw].map((char) => char.charCodeAt(0))); // Return Uint8Array directly
    }

    static bufferToB64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    static preparePublicKey(options) {
        const publicKey = { ...options };
        publicKey.challenge = this.b64ToBuffer(publicKey.challenge).buffer; // Convert to ArrayBuffer
        if (publicKey.user && publicKey.user.id) {
            publicKey.user = { ...publicKey.user, id: this.b64ToBuffer(publicKey.user.id).buffer }; // Convert to ArrayBuffer
        }
        ['allowCredentials', 'excludeCredentials'].forEach((key) => { // Convert credential IDs to ArrayBuffer
            if (Array.isArray(publicKey[key])) {
                publicKey[key] = publicKey[key].map((item) => ({ ...item, id: this.b64ToBuffer(item.id) }));
            }
        });
        return publicKey;
    }

    static credentialPayload(credential) {
        const response = credential.response || {};
        const payload = {
            id: credential.id,
            rawId: this.bufferToB64(credential.rawId),
            type: credential.type,
            response: {
                clientDataJSON: this.bufferToB64(response.clientDataJSON)
            }
        };
        if (response.attestationObject) payload.response.attestationObject = this.bufferToB64(response.attestationObject);
        if (response.authenticatorData) payload.response.authenticatorData = this.bufferToB64(response.authenticatorData);
        if (response.signature) payload.response.signature = this.bufferToB64(response.signature);
        if (response.userHandle) payload.response.userHandle = this.bufferToB64(response.userHandle);
        return payload;
    }

    static async register() {
        if (!await this.isAvailable()) return false;
        try {
            const options = await window.SoulMateApp.api('webauthn.php', {
                method: 'POST',
                body: { action: 'register_options' }
            });
            const cred = await navigator.credentials.create({ publicKey: this.preparePublicKey(options.publicKey) });
            await window.SoulMateApp.api('webauthn.php', {
                method: 'POST',
                body: { action: 'register', ...this.credentialPayload(cred), device_name: navigator.platform || 'device' }
            });
            await window.SoulMateLocalDB.put('settings', { key: 'bio_enabled', value: '1' });
            return true;
        } catch (e) {
            console.error('Biometric registration failed:', e);
            return false;
        }
    }

    static async verify(slug) {
        try {
            const options = await window.SoulMateApp.api('webauthn.php', {
                method: 'POST',
                body: { action: 'login_options', slug }
            });
            const credential = await navigator.credentials.get({ publicKey: this.preparePublicKey(options.publicKey) });
            return await window.SoulMateApp.api('webauthn.php', {
                method: 'POST',
                body: { action: 'login', ...this.credentialPayload(credential) }
            });
        } catch (e) {
            return null;
        }
    }
}

// ========== END-TO-END ENCRYPTION (E2EE) ==========
class E2EEManager {
    static async deriveKey(password) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
        );
        const salt = enc.encode("SoulMate-Ultimate-Privacy-Salt");
        return await crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
        );
    }
    static async setup(password) {
        if (!password) {
            await window.SoulMateLocalDB?.put?.('settings', { key: 'e2ee_enabled', value: '0' }); // Disable E2EE
            this.key = null;
            this.enabled = false;
            return false;
        }
        this.key = await this.deriveKey(password);
        this.enabled = true;
        await window.SoulMateLocalDB?.put?.('settings', { key: 'e2ee_enabled', value: '1' });
        // The key is not stored persistently here, only in memory for the session.
        return true;
    }
    static async loadKey() {
        const saved = await window.SoulMateLocalDB?.get?.('settings', 'e2ee_enabled');
        this.enabled = saved && saved.value === '1';
        this.key = null;
    }
    static async loadKeyFromPersistentStorage() { // New method to load from persistent storage
        const persistentKey = await window.SoulMateLocalDB?.get?.('settings', 'e2ee_key_persistent');
        if (persistentKey && persistentKey.value) this.key = await this.importKey(persistentKey.value); // Import JWK
        this.enabled = Boolean(this.key); // Enable if key is loaded
    }
    static async encrypt(text) {
        if (!this.key || !text) return text;
        try {
            const enc = new TextEncoder();
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, this.key, enc.encode(text));
            const combined = new Uint8Array(iv.length + ciphertext.byteLength);
            combined.set(iv, 0); combined.set(new Uint8Array(ciphertext), iv.length);
            return "E2EE:" + btoa(String.fromCharCode(...combined));
        } catch (e) { return text; }
    }
    static async decrypt(text) {
        if (!this.key || !text || !text.startsWith("E2EE:")) return text;
        try {
            const base64 = text.substring(5);
            const combined = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: combined.slice(0, 12) }, this.key, combined.slice(12));
            return new TextDecoder().decode(decrypted);
        } catch (e) { return "🔒 پیام قفل شده (نیاز به کلید رمزنگاری)"; }
    }
}

// Add a helper to import the key from base64
E2EEManager.importKey = async (b64Jwk) => crypto.subtle.importKey("jwk", JSON.parse(atob(b64Jwk)), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
E2EEManager.bufferToB64 = async (key) => btoa(JSON.stringify(await crypto.subtle.exportKey("jwk", key))); // Export key as JWK

// ========== MESSAGE REACTIONS ANIMATION ==========
function createReactionBurst(emoji, x, y) {
    const container = document.createElement('div');
    container.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        z-index: 100;
        pointer-events: none;
    `;

    for (let i = 0; i < 8; i++) {
        const span = document.createElement('span');
        span.textContent = emoji;
        span.style.cssText = `
            position: absolute;
            font-size: 24px;
            --x: ${Math.cos(i / 8 * Math.PI * 2) * 80}px;
            --y: ${Math.sin(i / 8 * Math.PI * 2) * 80}px;
            --d: ${i * 0.1}s;
        `;
        span.className = 'reaction-burst-emoji';
        container.appendChild(span);
    }

    document.body.appendChild(container);
    setTimeout(() => container.remove(), 1400);
}

// ========== INITIALIZE ALL ENHANCEMENTS ==========
document.addEventListener('DOMContentLoaded', () => {
    // Initialize components
    try { window.networkStatus = new NetworkStatusIndicator(); } catch (error) { console.warn('Network indicator disabled:', error); }
    try { window.messageManager = new MessageManager(); } catch (error) { console.warn('Message manager disabled:', error); }
    try { window.lazyLoader = new LazyLoader(); } catch (error) { console.warn('Lazy loader disabled:', error); }
    window.messageSearch = new MessageSearch();
    window.autoLogout = new AutoLogout(30 * 60 * 1000); // 30 minutes
    window.typingIndicator = new TypingIndicator();
    window.haptics = new HapticManager();
    window.BiometricAuth = BiometricAuth;
    try { window.particleEngine = new ParticleEngine(); } catch(e) { console.warn(e); }
    try { window.dynamicThemer = new DynamicThemer(); } catch(e) { console.warn(e); }
    try { window.E2EEManager = E2EEManager; E2EEManager.loadKey(); } catch(e) { console.warn(e); }


    // Emoji picker enhancement
    const emojiBtn = document.getElementById('emojiButton');
    if (emojiBtn) {
        new EmojiPicker(emojiBtn);
    }
});

// Export for global use
window.createReactionBurst = createReactionBurst;
window.LazyLoader = LazyLoader;
window.MessageSearch = MessageSearch;
window.AutoLogout = AutoLogout;
