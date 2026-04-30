/**
 * UX Enhancements Module - فاز ۳
 * مدیریت Loading States، Error Handling، Keyboard Shortcuts، Swipe Gestures
 * 
 * @module UXEnhancements
 */

import { CONSTANTS } from './constants.js';

// Get showToast from window (exported by app.modular.js)
const showToast = window.showToast || (() => {});

export const UXEnhancements = {
  // --- Keyboard Shortcuts ---
  initKeyboardShortcuts(sendMessageFn, focusSearchFn) {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Enter: ارسال پیام
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const input = document.getElementById(CONSTANTS.ELEMENTS.MESSAGE_INPUT);
        if (input && document.activeElement === input) {
          e.preventDefault();
          sendMessageFn();
        }
      }
      
      // Ctrl+K: جستجو
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        focusSearchFn();
      }
      
      // Escape: بستن مودال‌ها یا لغو Reply
      if (e.key === 'Escape') {
        const replyPreview = document.getElementById('reply-preview');
        if (replyPreview) replyPreview.style.display = 'none';
        
        const editPreview = document.getElementById('edit-preview');
        if (editPreview) editPreview.style.display = 'none';
        
        // بستن منوها
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
          menu.style.display = 'none';
        });
      }
    });
  },

  // --- Advanced Error Handling with Retry Logic ---
  async fetchWithRetry(url, options = {}, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        lastError = error;
        
        // نمایش خطا به کاربر
        if (i === maxRetries - 1) {
          showToast(`خطا در ارتباط: ${error.message}`, 'error');
          console.error(`[API Error] ${url}:`, error);
        } else {
          // انتظار قبل از تلاش مجدد (Exponential Backoff)
          const delay = Math.pow(2, i) * 1000;
          console.log(`[Retry] Attempt ${i + 1}/${maxRetries} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  },

  // --- Swipe Gestures for Messages ---
  initSwipeGestures() {
    const messagesContainer = document.getElementById(CONSTANTS.ELEMENTS.MESSAGES_CONTAINER);
    if (!messagesContainer) return;

    let startX, currentX, swipeThreshold = 80;
    let activeElement = null;
    let actionRevealed = false;

    messagesContainer.addEventListener('touchstart', (e) => {
      const messageEl = e.target.closest('.message-item');
      if (!messageEl) return;

      startX = e.touches[0].clientX;
      activeElement = messageEl;
      actionRevealed = false;
      
      // حذف ترنزیشن برای حرکت نرم
      messageEl.style.transition = 'none';
    }, { passive: true });

    messagesContainer.addEventListener('touchmove', (e) => {
      if (!activeElement) return;

      currentX = e.touches[0].clientX;
      const diff = currentX - startX;
      
      // محدود کردن حرکت
      if (Math.abs(diff) > swipeThreshold) {
        actionRevealed = true;
      }
      
      // اعمال حرکت با مقاومت (Resistance)
      const resistance = diff > 0 ? Math.min(diff, swipeThreshold * 1.5) : Math.max(diff, -swipeThreshold * 1.5);
      activeElement.style.transform = `translateX(${resistance}px)`;
      
      // نمایش دکمه‌های اقدام
      const deleteBtn = activeElement.querySelector('.swipe-action.delete');
      const replyBtn = activeElement.querySelector('.swipe-action.reply');
      const pinBtn = activeElement.querySelector('.swipe-action.pin');
      
      if (deleteBtn) deleteBtn.style.opacity = diff < -50 ? '1' : '0';
      if (replyBtn) replyBtn.style.opacity = diff > 50 ? '1' : '0';
      if (pinBtn) pinBtn.style.opacity = diff < -100 ? '1' : '0'; // Swipe طولانی‌تر برای Pin
      
    }, { passive: true });

    messagesContainer.addEventListener('touchend', (e) => {
      if (!activeElement) return;

      const diff = currentX - startX;
      
      if (diff < -swipeThreshold * 1.2) {
        // Swipe چپ: نمایش گزینه Delete یا Pin
        if (diff < -150) {
          // Pin
          this.handlePinMessage(activeElement);
          this.resetSwipe(activeElement);
        } else {
          // Delete Confirmation
          this.showDeleteConfirmation(activeElement);
          this.resetSwipe(activeElement);
        }
      } else if (diff > swipeThreshold) {
        // Swipe راست: Reply
        this.handleReplyMessage(activeElement);
        this.resetSwipe(activeElement);
      } else {
        // بازگشت به حالت اولیه
        this.resetSwipe(activeElement);
      }
      
      activeElement = null;
      currentX = 0;
    });
  },

  handleReplyMessage(messageEl) {
    const messageId = messageEl.dataset.id;
    const body = messageEl.querySelector('.message-body')?.textContent || '';
    const sender = messageEl.dataset.sender;
    
    // نمایش پیش‌نمایش Reply
    const preview = document.getElementById('reply-preview');
    if (preview) {
      preview.innerHTML = `
        <div class="glass-card p-3 mb-2 flex items-center justify-between">
          <div class="text-sm text-muted">
            <strong>پاسخ به:</strong> ${body.substring(0, 50)}...
          </div>
          <button onclick="document.getElementById('reply-preview').style.display='none'" class="text-error">✕</button>
        </div>
      `;
      preview.style.display = 'block';
      
      // ذخیره اطلاعات برای ارسال
      window.pendingReply = { messageId, sender };
    }
    
    // فوکوس روی اینپوت
    const input = document.getElementById(CONSTANTS.ELEMENTS.MESSAGE_INPUT);
    if (input) input.focus();
    
    showToast('حالت پاسخ فعال شد', 'info');
  },

  showDeleteConfirmation(messageEl) {
    const messageId = messageEl.dataset.id;
    
    if (confirm('آیا مطمئن هستید که می‌خواهید این پیام را حذف کنید؟')) {
      this.deleteMessage(messageId);
    }
  },

  async deleteMessage(messageId) {
    showToast('در حال حذف...', 'info');
    
    try {
      const result = await this.fetchWithRetry(`${CONSTANTS.API_BASE}/messages.php`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId })
      });
      
      if (result.success) {
        const messageEl = document.querySelector(`[data-id="${messageId}"]`);
        if (messageEl) {
          messageEl.style.animation = 'popIn 0.3s reverse';
          setTimeout(() => messageEl.remove(), 300);
        }
        showToast('پیام حذف شد', 'success');
      } else {
        showToast(result.message || 'خطا در حذف', 'error');
      }
    } catch (error) {
      showToast('خطا در ارتباط با سرور', 'error');
    }
  },

  handlePinMessage(messageEl) {
    const messageId = messageEl.dataset.id;
    showToast('قابلیت Pin به زودی...', 'info');
    // TODO: Implement Pin logic
  },

  resetSwipe(element) {
    element.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    element.style.transform = 'translateX(0)';
    
    // مخفی کردن دکمه‌ها
    element.querySelectorAll('.swipe-action').forEach(btn => {
      btn.style.opacity = '0';
    });
  },

  // --- Empty State with Illustration ---
  renderEmptyState(type = 'no-messages') {
    const container = document.getElementById(CONSTANTS.ELEMENTS.MESSAGES_CONTAINER);
    if (!container) return;
    
    const illustrations = {
      'no-messages': {
        icon: '💬',
        title: 'هنوز پیامی نیست',
        subtitle: 'اولین پیام خود را بفرستید و گفتگو را شروع کنید!',
        action: 'ارسال پیام'
      },
      'no-results': {
        icon: '🔍',
        title: 'نتیجه‌ای یافت نشد',
        subtitle: 'عبارت دیگری را جستجو کنید',
        action: null
      },
      'offline': {
        icon: '📡',
        title: 'شما آفلاین هستید',
        subtitle: 'پیام‌های شما پس از اتصال ارسال خواهند شد',
        action: null
      }
    };
    
    const data = illustrations[type] || illustrations['no-messages'];
    
    container.innerHTML = `
      <div class="empty-state flex flex-col items-center justify-center h-full py-20 text-center animate-fade-in">
        <div class="text-6xl mb-4 animate-float">${data.icon}</div>
        <h3 class="text-xl font-bold mb-2 text-main">${data.title}</h3>
        <p class="text-muted mb-6 max-w-xs">${data.subtitle}</p>
        ${data.action ? `
          <button onclick="document.getElementById('${CONSTANTS.ELEMENTS.MESSAGE_INPUT}').focus()" 
                  class="btn-float" style="position:relative; bottom:auto; right:auto;">
            ${data.action}
          </button>
        ` : ''}
      </div>
    `;
  },

  // --- Accessibility Announcer ---
  announceToScreenReader(message) {
    let announcer = document.getElementById('sr-announcer');
    if (!announcer) {
      announcer = document.createElement('div');
      announcer.id = 'sr-announcer';
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      announcer.className = 'sr-only';
      announcer.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
      document.body.appendChild(announcer);
    }
    
    // پاک کردن متن قبلی برای خواندن مجدد
    announcer.textContent = '';
    setTimeout(() => {
      announcer.textContent = message;
    }, 100);
  },

  // --- Focus Trap for Modals ---
  trapFocus(modal) {
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    });
    
    // فوکوس اولیه
    firstElement.focus();
  }
};

console.log('[UX Module] Loaded: Keyboard, Swipe, Errors, A11y');
