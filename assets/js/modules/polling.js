/**
 * PollingManager - مدیریت هوشمند polling با Exponential Backoff
 * بهینه‌سازی درخواست‌ها بر اساس فعالیت کاربر و وضعیت صفحه
 * @module PollingManager
 */

const PollingManager = {
  // تنظیمات
  minInterval: 2000,        // حداقل فاصله: 2 ثانیه
  maxInterval: 30000,       // حداکثر فاصله: 30 ثانیه
  initialInterval: 2200,    // فاصله اولیه: 2.2 ثانیه
  backoffMultiplier: 1.5,   // ضریب افزایش
  
  // وضعیت
  currentInterval: 2200,
  pollingTimer: null,
  isPolling: false,
  isActive: true,           // آیا کاربر فعال است؟
  isVisible: true,          // آیا صفحه مرئی است؟
  consecutiveEmptyResponses: 0,
  lastPollTime: 0,
  pollQueue: [],
  isProcessingQueue: false,

  /**
   * Initialize polling manager with visibility and focus listeners
   */
  init() {
    // Visibility API - توقف polling وقتی صفحه مخفی است
    document.addEventListener('visibilitychange', () => {
      this.isVisible = !document.hidden;
      if (this.isVisible) {
        this.resume();
      } else {
        this.pause();
      }
    });

    // Focus/Blur - تشخیص فعالیت کاربر
    window.addEventListener('focus', () => {
      this.isActive = true;
      this.resetInterval();
      this.resume();
    });

    window.addEventListener('blur', () => {
      this.isActive = false;
    });

    // Activity tracking - تشخیص عدم فعالیت
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    activityEvents.forEach(event => {
      document.addEventListener(event, () => this.onUserActivity(), true);
    });

    console.log('✅ PollingManager initialized');
  },

  /**
   * Start polling loop
   * @param {Function} pollCallback - تابعی که باید در هر poll اجرا شود
   */
  start(pollCallback) {
    if (this.isPolling) return;
    
    this.pollCallback = pollCallback;
    this.isPolling = true;
    this.currentInterval = this.initialInterval;
    this.consecutiveEmptyResponses = 0;
    
    this.scheduleNextPoll();
    console.log('🔄 Polling started');
  },

  /**
   * Schedule next poll with current interval
   */
  scheduleNextPoll() {
    if (!this.isPolling) return;
    
    // اگر صفحه مخفی است و کاربر غیرفعال، polling را متوقف کن
    if (!this.isVisible && !this.isActive) {
      console.log('⏸️ Polling paused (page hidden & inactive)');
      return;
    }
    
    this.pollingTimer = setTimeout(async () => {
      await this.performPoll();
    }, this.currentInterval);
  },

  /**
   * Perform actual poll
   */
  async performPoll() {
    if (!this.pollCallback || !this.isPolling) return;
    
    this.lastPollTime = Date.now();
    
    try {
      const result = await this.pollCallback();
      
      if (result && result.hasData) {
        // داده جدید وجود داشت - اینتروال را ریست کن
        this.resetInterval();
        this.consecutiveEmptyResponses = 0;
      } else {
        // داده‌ای نبود - اینتروال را افزایش بده (Exponential Backoff)
        this.increaseInterval();
        this.consecutiveEmptyResponses++;
      }
    } catch (error) {
      console.error('❌ Poll error:', error);
      this.increaseInterval(); // در صورت خطا هم اینتروال را افزایش بده
    }
    
    // زمان‌بندی poll بعدی
    this.scheduleNextPoll();
  },

  /**
   * Reset interval to initial value
   */
  resetInterval() {
    this.currentInterval = this.initialInterval;
  },

  /**
   * Increase interval using exponential backoff
   */
  increaseInterval() {
    this.currentInterval = Math.min(
      this.currentInterval * this.backoffMultiplier,
      this.maxInterval
    );
    console.log(`📈 Poll interval increased to ${this.currentInterval}ms`);
  },

  /**
   * Pause polling (temporary stop)
   */
  pause() {
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
    console.log('⏸️ Polling paused');
  },

  /**
   * Resume polling after pause
   */
  resume() {
    if (this.isPolling && !this.pollingTimer) {
      this.scheduleNextPoll();
      console.log('▶️ Polling resumed');
    }
  },

  /**
   * Stop polling completely
   */
  stop() {
    this.isPolling = false;
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
    console.log('⏹️ Polling stopped');
  },

  /**
   * Handle user activity - reset backoff
   */
  onUserActivity() {
    if (!this.isActive) {
      this.isActive = true;
      this.resetInterval();
    }
  },

  /**
   * Queue a poll request (debounced)
   * @param {Function} callback 
   */
  queuePoll(callback) {
    this.pollQueue.push(callback);
    
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  },

  /**
   * Process queued polls
   */
  async processQueue() {
    if (this.isProcessingQueue || this.pollQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    
    while (this.pollQueue.length > 0) {
      const callback = this.pollQueue.shift();
      try {
        await callback();
      } catch (error) {
        console.error('❌ Queued poll error:', error);
      }
      
      // Small delay between queued polls
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    this.isProcessingQueue = false;
  },

  /**
   * Force immediate poll (bypass interval)
   */
  async forcePoll() {
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
    
    await this.performPoll();
  },

  /**
   * Get polling status
   * @returns {Object}
   */
  getStatus() {
    return {
      isPolling: this.isPolling,
      isActive: this.isActive,
      isVisible: this.isVisible,
      currentInterval: this.currentInterval,
      consecutiveEmptyResponses: this.consecutiveEmptyResponses,
      lastPollTime: this.lastPollTime,
      queueLength: this.pollQueue.length
    };
  }
};

// Export for ES6 modules compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PollingManager;
}
