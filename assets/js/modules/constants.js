/**
 * Constants - تعریف تمام ثابت‌ها و مقادیر جادویی
 * جلوگیری از استفاده از Magic Numbers در کد
 * @module Constants
 */

const Constants = {
  // ========== تنظیمات Polling ==========
  POLLING: {
    INITIAL_INTERVAL: 2200,      // میلی‌ثانیه
    MIN_INTERVAL: 2000,
    MAX_INTERVAL: 30000,
    BACKOFF_MULTIPLIER: 1.5,
    EMPTY_RESPONSES_BEFORE_BACKOFF: 3
  },

  // ========== محدودیت‌های آپلود ==========
  UPLOAD: {
    MAX_FILE_SIZE: 50 * 1024 * 1024,  // 50MB
    MAX_IMAGE_SIZE: 5 * 1024 * 1024,  // 5MB برای تصاویر
    MAX_FILES_PER_MESSAGE: 5,
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/webm', 'video/ogg'],
    ALLOWED_AUDIO_TYPES: ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav'],
    ALLOWED_DOCUMENT_TYPES: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ]
  },

  // ========== بهینه‌سازی تصویر ==========
  IMAGE: {
    MAX_WIDTH: 1920,
    MAX_HEIGHT: 1080,
    THUMBNAIL_SIZE: 400,
    QUALITY: 0.85,
    THUMBNAIL_QUALITY: 0.8
  },

  // ========== پیام‌ها ==========
  MESSAGE: {
    MAX_LENGTH: 2000,
    EDIT_TIME_LIMIT: 300000,        // 5 دقیقه (میلی‌ثانیه)
    DELETE_TIME_LIMIT: 600000,      // 10 دقیقه
    TYPING_TIMEOUT: 3000,           // 3 ثانیه
    AUTOSAVE_INTERVAL: 5000,        // 5 ثانیه
    BATCH_SIZE: 50,                 // تعداد پیام در هر بار لود
    CACHE_LIMIT: 500                // حداکثر پیام در کش
  },

  // ========== تایپینگ ==========
  TYPING: {
    INDICATOR_DELAY: 300,          // تأخیر قبل از نمایش "در حال تایپ..."
    HIDE_DELAY: 2000,              // مخفی کردن بعد از توقف تایپ
    SEND_THROTTLE: 1000            // حداقل فاصله ارسال وضعیت تایپ
  },

  // ========== Session و Auth ==========
  AUTH: {
    SESSION_LIFETIME: 86400,       // 24 ساعت (ثانیه)
    PIN_LENGTH: 4,
    PASSWORD_MIN_LENGTH: 8,
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 300          // 5 دقیقه قفل بعد از تلاش ناموفق
  },

  // ========== Rate Limiting ==========
  RATE_LIMIT: {
    LOGIN_WINDOW: 60,              // 1 دقیقه
    LOGIN_MAX_ATTEMPTS: 5,
    UPLOAD_WINDOW: 60,             // 1 دقیقه
    UPLOAD_MAX_REQUESTS: 20,
    MESSAGE_WINDOW: 10,            // 10 ثانیه
    MESSAGE_MAX_COUNT: 5,
    API_WINDOW: 60,                // 1 دقیقه
    API_MAX_REQUESTS: 100
  },

  // ========== کش و ذخیره‌سازی ==========
  CACHE: {
    MESSAGES_LIMIT: 500,           // حداکثر پیام در IndexedDB
    MEMORIES_LIMIT: 100,
    LOVE_ITEMS_LIMIT: 200,
    CLEANUP_AGE: 86400000,         // 24 ساعت (میلی‌ثانیه)
    OFFLINE_PAGE_CACHE: 'offline-v1'
  },

  // ========== اعلان‌ها و صداها ==========
  NOTIFICATION: {
    BADGE_MAX: 99,
    SOUND_VOLUME: 0.5,
    VIBRATION_PATTERN: [200, 100, 200],
    AUTO_CLOSE_TIMEOUT: 5000       // 5 ثانیه
  },

  // ========== UI و انیمیشن ==========
  UI: {
    SCROLL_THRESHOLD: 100,         // پیکسل تا پایین برای لود بیشتر
    ANIMATION_DURATION: 300,       // میلی‌ثانیه
    TOAST_DURATION: 3000,
    MODAL_TRANSITION: 250,
    SWIPE_THRESHOLD: 50,           // پیکسل برای تشخیص swipe
    LONG_PRESS_DURATION: 500       // میلی‌ثانیه برای long-press
  },

  // ========== تاریخ و زمان ==========
  TIME: {
    SECOND: 1000,
    MINUTE: 60000,
    HOUR: 3600000,
    DAY: 86400000,
    WEEK: 604800000,
    MONTH: 2592000000              // 30 روز
  },

  // ========== رنگ‌ها و تم ==========
  THEME: {
    LIGHT_PRIMARY: '#e91e63',
    DARK_PRIMARY: '#f06292',
    LIGHT_BACKGROUND: '#fafafa',
    DARK_BACKGROUND: '#121212',
    LIGHT_SURFACE: '#ffffff',
    DARK_SURFACE: '#1e1e1e',
    CONTRAST_RATIO_MIN: 4.5        // حداقل نسبت کنتراست برای WCAG AA
  },

  // ========== Service Worker ==========
  SW: {
    CACHE_NAME: 'soulmate-v1',
    NETWORK_TIMEOUT: 5000,         // 5 ثانیه timeout برای network-first
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000              // 1 ثانیه بین retryها
  },

  // ========== API ==========
  API: {
    TIMEOUT: 10000,                // 10 ثانیه
    RETRY_COUNT: 3,
    BASE_PATH: 'api/'
  },

  // ========== لاگ ==========
  LOG: {
    LEVELS: {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    },
    CURRENT_LEVEL: 2,              // INFO
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_FILES: 5                   // چرخش 5 فایل
  },

  // ========== دسترسی‌پذیری ==========
  A11Y: {
    FOCUS_VISIBLE: true,
    REDUCE_MOTION: false,
    SCREEN_READER_ANNOUNCE_DELAY: 100
  },

  // ========== کلیدهای میانبر ==========
  SHORTCUTS: {
    SEND_MESSAGE: 'Ctrl+Enter',
    SEARCH: 'Ctrl+K',
    NEW_MESSAGE: 'Ctrl+N',
    SETTINGS: 'Ctrl+,',
    LOGOUT: 'Ctrl+Shift+L',
    EMOJI_PICKER: 'Ctrl+E',
    REPLY: 'Ctrl+R',
    EDIT_LAST: 'Ctrl+Up',
    DELETE_MESSAGE: 'Delete',
    ARCHIVE: 'Ctrl+A'
  }
};

// تابع کمکی برای تبدیل زمان‌ها
Constants.TimeUtils = {
  seconds(ms) { return ms * Constants.TIME.SECOND; },
  minutes(ms) { return ms * Constants.TIME.MINUTE; },
  hours(ms) { return ms * Constants.TIME.HOUR; },
  days(ms) { return ms * Constants.TIME.DAY; }
};

// فریز کردن آبجکت برای جلوگیری از تغییر
Object.freeze(Constants);
Object.freeze(Constants.POLLING);
Object.freeze(Constants.UPLOAD);
Object.freeze(Constants.IMAGE);
Object.freeze(Constants.MESSAGE);
Object.freeze(Constants.TYPING);
Object.freeze(Constants.AUTH);
Object.freeze(Constants.RATE_LIMIT);
Object.freeze(Constants.CACHE);
Object.freeze(Constants.NOTIFICATION);
Object.freeze(Constants.UI);
Object.freeze(Constants.TIME);
Object.freeze(Constants.THEME);
Object.freeze(Constants.SW);
Object.freeze(Constants.API);
Object.freeze(Constants.LOG);
Object.freeze(Constants.A11Y);
Object.freeze(Constants.SHORTCUTS);

// Export for ES6 modules compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Constants;
}
