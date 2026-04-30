/**
 * Utils - توابع کمکی و عمومی
 * شامل ابزارهای تاریخ، فرمت‌بندی، اعتبارسنجی و ...
 * @module Utils
 */

const Utils = {
  /**
   * Generate unique ID
   * @returns {string}
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  /**
   * Debounce function
   * @param {Function} func 
   * @param {number} wait 
   * @returns {Function}
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Throttle function
   * @param {Function} func 
   * @param {number} limit 
   * @returns {Function}
   */
  throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  /**
   * Format file size to human readable
   * @param {number} bytes 
   * @param {number} decimals 
   * @returns {string}
   */
  formatFileSize(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  },

  /**
   * Format timestamp to Persian date/time
   * @param {number|string|Date} timestamp 
   * @param {boolean} showTime 
   * @param {boolean} showSeconds 
   * @returns {string}
   */
  formatPersianDate(timestamp, showTime = true, showSeconds = false) {
    const date = new Date(timestamp);
    
    // استفاده از Intl API برای تاریخ شمسی
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      calendar: 'persian'
    };
    
    if (showTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
      if (showSeconds) {
        options.second = '2-digit';
      }
    }
    
    try {
      return new Intl.DateTimeFormat('fa-IR', options).format(date);
    } catch {
      // Fallback برای مرورگرهای قدیمی
      return date.toLocaleString('fa-IR');
    }
  },

  /**
   * Format relative time (e.g., "5 minutes ago")
   * @param {number|string|Date} timestamp 
   * @returns {string}
   */
  formatRelativeTime(timestamp) {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diff = now - then;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);
    
    if (seconds < 10) return 'همین الان';
    if (seconds < 60) return `${seconds} ثانیه پیش`;
    if (minutes < 60) return `${minutes} دقیقه پیش`;
    if (hours < 24) return `${hours} ساعت پیش`;
    if (days < 7) return `${days} روز پیش`;
    if (weeks < 4) return `${weeks} هفته پیش`;
    if (months < 12) return `${months} ماه پیش`;
    return `${years} سال پیش`;
  },

  /**
   * Get greeting based on time
   * @returns {string}
   */
  getGreeting() {
    const hour = new Date().getHours();
    if (hour < 6) return 'شب بخیر';
    if (hour < 12) return 'صبح بخیر';
    if (hour < 18) return 'ظهر بخیر';
    return 'عصر بخیر';
  },

  /**
   * Escape HTML to prevent XSS
   * @param {string} text 
   * @returns {string}
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Parse URLs in text to clickable links
   * @param {string} text 
   * @returns {string}
   */
  linkify(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, (url) => {
      const safeUrl = Utils.escapeHtml(url);
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a>`;
    });
  },

  /**
   * Parse emojis and wrap them
   * @param {string} text 
   * @returns {string}
   */
  parseEmojis(text) {
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F100}-\u{1F1FF}]/gu;
    return text.replace(emojiRegex, '<span class="emoji">$&</span>');
  },

  /**
   * Truncate text with ellipsis
   * @param {string} text 
   * @param {number} maxLength 
   * @returns {string}
   */
  truncate(text, maxLength = 100) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  },

  /**
   * Validate email
   * @param {string} email 
   * @returns {boolean}
   */
  isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  },

  /**
   * Validate phone number (Iranian)
   * @param {string} phone 
   * @returns {boolean}
   */
  isValidIranianPhone(phone) {
    const re = /^(\+98|0)?9\d{9}$/;
    return re.test(phone.replace(/\s|-/g, ''));
  },

  /**
   * Calculate days between two dates
   * @param {Date|string|number} start 
   * @param {Date|string|number} end 
   * @returns {number}
   */
  daysBetween(start, end) {
    const oneDay = 24 * 60 * 60 * 1000;
    const startDate = new Date(start);
    const endDate = new Date(end);
    return Math.round(Math.abs((startDate - endDate) / oneDay));
  },

  /**
   * Check if object is empty
   * @param {Object} obj 
   * @returns {boolean}
   */
  isEmpty(obj) {
    if (obj == null) return true;
    if (typeof obj === 'string') return obj.trim() === '';
    if (Array.isArray(obj)) return obj.length === 0;
    if (typeof obj === 'object') return Object.keys(obj).length === 0;
    return false;
  },

  /**
   * Deep clone object
   * @param {Object} obj 
   * @returns {Object}
   */
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (Array.isArray(obj)) return obj.map(item => Utils.deepClone(item));
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = Utils.deepClone(obj[key]);
      }
    }
    return cloned;
  },

  /**
   * Sleep/delay utility
   * @param {number} ms 
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Retry async function with exponential backoff
   * @param {Function} fn 
   * @param {number} retries 
   * @param {number} delay 
   * @returns {Promise<any>}
   */
  async retry(fn, retries = 3, delay = 1000) {
    try {
      return await fn();
    } catch (error) {
      if (retries === 0) throw error;
      await Utils.sleep(delay);
      return Utils.retry(fn, retries - 1, delay * 2);
    }
  },

  /**
   * Copy text to clipboard
   * @param {string} text 
   * @returns {Promise<boolean>}
   */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return true;
      } catch {
        document.body.removeChild(textarea);
        return false;
      }
    }
  },

  /**
   * Detect mobile device
   * @returns {boolean}
   */
  isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  },

  /**
   * Detect iOS device
   * @returns {boolean}
   */
  isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  },

  /**
   * Get browser language
   * @returns {string}
   */
  getBrowserLanguage() {
    return navigator.language || navigator.userLanguage || 'fa';
  },

  /**
   * Check if dark mode is preferred
   * @returns {boolean}
   */
  prefersDarkMode() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  },

  /**
   * Check if reduced motion is preferred
   * @returns {boolean}
   */
  prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  },

  /**
   * Create blob URL from file
   * @param {Blob} blob 
   * @returns {string}
   */
  createBlobUrl(blob) {
    return URL.createObjectURL(blob);
  },

  /**
   * Revoke blob URL
   * @param {string} url 
   */
  revokeBlobUrl(url) {
    URL.revokeObjectURL(url);
  },

  /**
   * Download file
   * @param {Blob} blob 
   * @param {string} filename 
   */
  downloadFile(blob, filename) {
    const url = Utils.createBlobUrl(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    Utils.revokeBlobUrl(url);
  },

  /**
   * Parse query string to object
   * @param {string} queryString 
   * @returns {Object}
   */
  parseQueryString(queryString) {
    const params = {};
    const queries = queryString.substring(1).split('&');
    for (const query of queries) {
      const [key, value] = query.split('=');
      params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    }
    return params;
  },

  /**
   * Convert object to query string
   * @param {Object} params 
   * @returns {string}
   */
  objectToQueryString(params) {
    return Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  },

  /**
   * Hash string (simple hash for non-cryptographic use)
   * @param {string} str 
   * @returns {string}
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  },

  /**
   * Group array by key
   * @param {Array} array 
   * @param {string|Function} key 
   * @returns {Object}
   */
  groupBy(array, key) {
    return array.reduce((result, item) => {
      const groupKey = typeof key === 'function' ? key(item) : item[key];
      if (!result[groupKey]) {
        result[groupKey] = [];
      }
      result[groupKey].push(item);
      return result;
    }, {});
  },

  /**
   * Sort array by key
   * @param {Array} array 
   * @param {string} key 
   * @param {boolean} ascending 
   * @returns {Array}
   */
  sortBy(array, key, ascending = true) {
    return [...array].sort((a, b) => {
      const aVal = a[key];
      const bVal = b[key];
      if (aVal < bVal) return ascending ? -1 : 1;
      if (aVal > bVal) return ascending ? 1 : -1;
      return 0;
    });
  }
};

// Export for ES6 modules compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
}
