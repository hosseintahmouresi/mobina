(() => {
  'use strict';

  // ========== موتور دیتابیس محلی (IndexedDB) ==========
  const LocalDB = {
    db: null,
    async init() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('SoulMateDB', 1);
        req.onupgradeneeded = (e) => {
          const database = e.target.result;
          if (!database.objectStoreNames.contains('messages')) database.createObjectStore('messages', { keyPath: 'id' });
          if (!database.objectStoreNames.contains('memories')) database.createObjectStore('memories', { keyPath: 'id' });
          if (!database.objectStoreNames.contains('loveItems')) database.createObjectStore('loveItems', { keyPath: 'id' });
          if (!database.objectStoreNames.contains('outbox')) database.createObjectStore('outbox', { keyPath: 'tempId' });
          if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings', { keyPath: 'key' });
        };
        req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
        req.onerror = () => reject(req.error);
      });
    },
    async get(storeName, key) {
      return new Promise((resolve) => {
        const req = this.db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
    },
    async getAll(storeName) {
      return new Promise((resolve) => {
        const req = this.db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve([]);
      });
    },
    async put(storeName, item) {
      return new Promise((resolve) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(item);
        tx.oncomplete = () => resolve(true);
      });
    },
    async putAll(storeName, items) {
      return new Promise((resolve) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        for (const item of items) store.put(item);
        tx.oncomplete = () => resolve(true);
      });
    },
    async delete(storeName, key) {
      return new Promise((resolve) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve(true);
      });
    },
    async clear(storeName) {
      return new Promise((resolve) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        tx.oncomplete = () => resolve(true);
      });
    }
  };

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
    tempMessages: new Map(), // For Optimistic UI
    sseConnection: null // نگهدارنده کانکشن بلادرنگ
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const apiBase = new URL('api/', document.baseURI).href;
  const loveSurprises = [
    'یه پیام کوچیک: امروز هم انتخاب قلب من تویی.',
    'اگه الان کنارم بودی، فقط چند دقیقه بغلت می‌کردم و حرف نمی‌زدم.',
    'می‌خواستم بگم بودن تو قشنگ‌ترین بخش روزمه.',
    'یه بوسه از راه دور، مخصوص همین لحظه.',
    'امشب هر جا بودی، بدون یکی اینجا خیلی دوستت داره.',
    'یه لحظه وایسا: فقط می‌خواستم یادآوری کنم چقدر عزیزمی.',
    'بین همه شلوغی‌های امروز، فکر تو آروم‌ترین جای ذهنمه.'
  ];
  const lovePrompts = [
    'امروز کدوم لحظه باعث شد لبخند بزنی؟',
    'اگه الان با هم بیرون بودیم، کجا می‌رفتیم؟',
    'یک خاطره کوچیک از ما که هنوز دوستش داری چیه؟',
    'امشب دوست داری از چی برات حرف بزنم؟',
    'یه قول کوچیک برای فردای همدیگه بگیم؟',
    'سه تا چیز کوچیک که امروز دوست داشتی چی بود؟',
    'اگه قرار بود امشب فقط یک آرزو برای ما بکنی، چی بود؟'
  ];
  const loveToolbox = {
    compliments: [
      'تو همون آدمی هستی که حتی فکر کردن بهش روزم رو بهتر می‌کنه.',
      'قشنگی تو فقط توی چهره‌ات نیست؛ توی آرامشی هم هست که میاری.',
      'یه چیزی توی تو هست که هیچ‌وقت برام عادی نمی‌شه.',
      'با تو، ساده‌ترین لحظه‌ها هم خاص می‌شن.'
    ],
    dates: [
      'قرار پیشنهادی امروز: یه نوشیدنی، یه مسیر کوتاه، و حرف زدن بدون عجله.',
      'قرار پیشنهادی: هر کدوم یه آهنگ انتخاب کنیم و همزمان گوش بدیم.',
      'قرار کوچیک امشب: ۱۰ دقیقه فقط از چیزهایی بگیم که دلمون می‌خواد.',
      'قرار بامزه: هر کدوم یه عکس از حال‌وهوای امروزمون بفرستیم.'
    ],
    challenges: [
      'چالش امروز: هر کدوم تا شب سه تا دلیل بگیم که چرا عاشق همیم.',
      'چالش کوچیک: یک جمله بسازیم که فقط خودمون معنی خاصش رو بفهمیم.',
      'چالش امشب: بدون استفاده از کلمه دوستت دارم، عشق رو توضیح بدیم.',
      'چالش بامزه: هر کدوم یک خاطره کوتاه از اولین روزهای آشنایی بگیم.'
    ],
    memories: [
      'یادته اون لحظه‌ای که بی‌هوا خندیدیم؟ هنوز تو ذهنمه.',
      'یه خاطره از ما هست که هر بار یادش می‌افتم، دلم نرم می‌شه.',
      'امشب دوست دارم یکی از خاطره‌های قشنگمون رو دوباره زنده کنیم.',
      'از بین همه لحظه‌هامون، کدومش بیشتر شبیه خودِ ماست؟'
    ],
    promises: [
      'قول کوچیک امروز: حتی وسط شلوغی، یادمون نره هوای دل هم رو داشته باشیم.',
      'قول می‌دم عشق رو فقط توی حرف نگه ندارم؛ توی رفتارهای کوچیک هم نشونش بدم.',
      'قول امشب: اگر چیزی ناراحتت کرد، قبل از فاصله گرفتن با هم حرف بزنیم.',
      'قول می‌دم برای لبخندت وقت بذارم، حتی توی روزهای سخت.'
    ],
    poems: [
      'نامه کوتاه برای تو:\nتو شبیه آرامشی هستی که آدم بعد از یک روز طولانی دنبالش می‌گرده.\nهمین که هستی، خیلی چیزها قشنگ‌تر می‌شن.',
      'نامه کوتاه:\nاگر روزم هزار تکه هم بشه، فکر تو همون تکه‌ایه که همه چیز رو دوباره جمع می‌کنه.',
      'برای عشق من:\nمن عاشق جزئیات توام؛ همون چیزهایی که شاید خودت ساده از کنارشون رد می‌شی.',
      'نامه امشب:\nکاش می‌شد بعضی حس‌ها رو بغل کرد. حس من به تو دقیقاً از هموناست.'
    ]
  };

  const els = {
    appShell: $('#appShell'),
    loginView: $('#loginView'),
    mainView: $('#mainView'),
    loginMode: $('#loginMode'),
    loginForm: $('#loginForm'),
    pinLoginForm: $('#pinLoginForm'),
    loginPassword: $('#loginPassword'),
    loginPin: $('#loginPin'),
    messages: $('#messages'),
    loveActions: $('#loveActions'),
    composer: $('#composer'),
    composerTools: $('#composerTools'),
    composerMenuButton: $('#composerMenuButton'),
    messageInput: $('#messageInput'),
    sendButton: $('#sendButton'),
    attachButton: $('#attachButton'),
    fileInput: $('#fileInput'),
    recordButton: $('#recordButton'),
    emojiButton: $('#emojiButton'),
    recordingPanel: $('#recordingPanel'),
    recordingTime: $('#recordingTime'),
    saveRecordButton: $('#saveRecordButton'),
    cancelRecordButton: $('#cancelRecordButton'),
    loveModeButton: $('#loveModeButton'),
    letterModeButton: $('#letterModeButton'),
    timedModeButton: $('#timedModeButton'),
    timedPanel: $('#timedPanel'),
    timedOpenAt: $('#timedOpenAt'),
    clearTimedButton: $('#clearTimedButton'),
    attachmentPill: $('#attachmentPill'),
    replyPreview: $('#replyPreview'),
    replyPreviewText: $('#replyPreviewText'),
    cancelReplyButton: $('#cancelReplyButton'),
    typingLine: $('#typingLine'),
    reactionDock: $('#reactionDock'),
    toast: $('#toast'),
    myAvatar: $('#myAvatar'),
    peerAvatar: $('#peerAvatar'),
    myName: $('#myName'),
    partnerName: $('#partnerName'),
    activePair: $('#activePair'),
    conversationTitle: $('#conversationTitle'),
    presenceText: $('#presenceText'),
    daysTogether: $('#daysTogether'),
    dailyPhrase: $('#dailyPhrase'),
    chatTabBadge: $('#chatTabBadge'),
    memoriesTabBadge: $('#memoriesTabBadge'),
    loveDaysBig: $('#loveDaysBig'),
    loveDailyNote: $('#loveDailyNote'),
    loveTodayDate: $('#loveTodayDate'),
    loveTogetherLine: $('#loveTogetherLine'),
    loveLastMemoryTitle: $('#loveLastMemoryTitle'),
    loveLastMemoryDate: $('#loveLastMemoryDate'),
    loveSuggestion: $('#loveSuggestion'),
    missYouText: $('#missYouText'),
    timedMessageForm: $('#timedMessageForm'),
    timedMessageText: $('#timedMessageText'),
    timedMessageOpenAt: $('#timedMessageOpenAt'),
    albumForm: $('#albumForm'),
    albumFileInput: $('#albumFileInput'),
    albumCaptionInput: $('#albumCaptionInput'),
    albumTimeline: $('#albumTimeline'),
    moodGrid: $('#moodGrid'),
    moodList: $('#moodList'),
    stickerGrid: $('#stickerGrid'),
    eventForm: $('#eventForm'),
    eventTitleInput: $('#eventTitleInput'),
    eventDateInput: $('#eventDateInput'),
    eventList: $('#eventList'),
    promiseForm: $('#promiseForm'),
    promiseTextInput: $('#promiseTextInput'),
    promiseList: $('#promiseList'),
    advancedSearchForm: $('#advancedSearchForm'),
    advancedSearchInput: $('#advancedSearchInput'),
    advancedSearchResults: $('#advancedSearchResults'),
    installButton: $('#installButton'),
    searchButton: $('#searchButton'),
    chatSearch: $('#chatSearch'),
    searchInput: $('#searchInput'),
    clearSearchButton: $('#clearSearchButton'),
    notifyButton: $('#notifyButton'),
    enablePushButton: $('#enablePushButton'),
    testPushButton: $('#testPushButton'),
    notificationStatus: $('#notificationStatus'),
    installStatus: $('#installStatus'),
    installChecklist: $('#installChecklist'),
    themeButton: $('#themeButton'),
    logoutButton: $('#logoutButton'),
    settingsForm: $('#settingsForm'),
    coupleSinceInput: $('#coupleSinceInput'),
    dailyPhraseInput: $('#dailyPhraseInput'),
    notificationModeInput: $('#notificationModeInput'),
    notificationPreviewInput: $('#notificationPreviewInput'),
    settingsAvatar: $('#settingsAvatar'),
    settingsName: $('#settingsName'),
    avatarButton: $('#avatarButton'),
    avatarInput: $('#avatarInput'),
    pinForm: $('#pinForm'),
    pinInput: $('#pinInput'),
    clearPinButton: $('#clearPinButton'),
    scrollBottomButton: $('#scrollBottomButton'),
    memoryForm: $('#memoryForm'),
    memoryEmoji: $('#memoryEmoji'),
    memoryTitle: $('#memoryTitle'),
    memoryDate: $('#memoryDate'),
    memoryNote: $('#memoryNote'),
    memoryLocked: $('#memoryLocked'),
    memoryImageInput: $('#memoryImageInput'),
    memoryImageButton: $('#memoryImageButton'),
    memoryImagePill: $('#memoryImagePill'),
    cancelMemoryEditButton: $('#cancelMemoryEditButton'),
    memoryList: $('#memoryList')
  };

  const bsEls = {
    overlay: $('#bottomSheetOverlay'),
    sheet: $('#bottomSheet'),
    title: $('#bottomSheetTitle'),
    desc: $('#bottomSheetDesc'),
    input: $('#bottomSheetInput'),
    confirm: $('#bottomSheetConfirm'),
    cancel: $('#bottomSheetCancel')
  };

  const DEVICE_KEY = 'soulmate-device-v1';
  const DRAFT_KEY = 'soulmate-draft-v1';
  window.SoulMateLocalDB = LocalDB;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    await LocalDB.init();
    bindViewportFixes();
    bindEvents();
    applySavedTheme();
    await registerServiceWorker();
    await loadSession();
    updateInstallState();
  }

  function bindEvents() {
    $$('.person-button').forEach((button) => {
      button.addEventListener('click', () => {
        state.selectedLogin = button.dataset.loginUser || 'hossein';
        $$('.person-button').forEach((item) => item.classList.toggle('is-active', item === button));
        els.loginPassword.focus();
      });
    });

    els.loginForm.addEventListener('submit', onLogin);
    els.pinLoginForm.addEventListener('submit', onPinLogin);
    $$('.mode-button').forEach((button) => {
      button.addEventListener('click', () => setLoginMode(button.dataset.loginMode || 'password'));
    });
    els.composer.addEventListener('submit', onSendMessage);
    els.sendButton.addEventListener('mousedown', (event) => event.preventDefault());
    els.messageInput.addEventListener('input', onMessageInput);
    els.messageInput.addEventListener('keydown', onMessageKeydown);
    els.messageInput.addEventListener('focus', onComposerFocus);
    els.messageInput.addEventListener('blur', onComposerBlur);
    if (els.composerMenuButton && els.composerTools) {
      els.composerMenuButton.addEventListener('click', toggleComposerTools);
    }
    els.attachButton.addEventListener('click', () => {
      closeComposerTools();
      els.fileInput.click();
    });
    els.fileInput.addEventListener('change', onFilePicked);
    els.recordButton.addEventListener('click', () => {
      closeComposerTools();
      toggleRecording();
    });
    if (els.saveRecordButton) {
      els.saveRecordButton.addEventListener('click', () => stopRecording(true));
    }
    if (els.cancelRecordButton) {
      els.cancelRecordButton.addEventListener('click', cancelRecording);
    }
    if (els.cancelReplyButton) {
      els.cancelReplyButton.addEventListener('click', clearReply);
    }
    els.attachmentPill.addEventListener('click', (event) => {
      const clearButton = event.target.closest('[data-clear-attachment]');
      if (clearButton) {
        clearPendingAttachment();
      }
    });
    els.loveModeButton.addEventListener('click', () => {
      setComposerMode(state.loveMode ? 'text' : 'love');
      closeComposerTools();
      focusComposer();
    });
    els.letterModeButton.addEventListener('click', () => {
      setComposerMode(state.letterMode ? 'text' : 'letter');
      closeComposerTools();
      focusComposer();
    });
    if (els.timedModeButton) {
      els.timedModeButton.addEventListener('click', () => {
        setComposerMode(state.timedMode ? 'text' : 'timed');
        closeComposerTools();
        if (state.timedMode && els.timedOpenAt && !els.timedOpenAt.value) {
          els.timedOpenAt.value = defaultOpenAtValue();
        }
        focusComposer();
      });
    }
    if (els.clearTimedButton) {
      els.clearTimedButton.addEventListener('click', () => setComposerMode('text'));
    }
    if (els.timedOpenAt) {
      els.timedOpenAt.addEventListener('change', () => { state.pendingOpenAt = localDateTimeToUtc(els.timedOpenAt.value); });
    }
    els.loveActions.addEventListener('click', async (event) => {
      const toolButton = event.target.closest('[data-love-tool]');
      if (toolButton) {
        await runLoveTool(toolButton.dataset.loveTool || '');
        return;
      }
      const button = event.target.closest('[data-love-message]');
      if (!button) {
        return;
      }
      await sendLovePreset(button.dataset.loveMessage || '');
    });

    $$('.nav-button').forEach((button) => {
      button.addEventListener('click', () => showTab(button.dataset.tab || 'chat'));
    });

    if (els.searchButton && els.chatSearch && els.searchInput && els.clearSearchButton) {
      els.searchButton.addEventListener('click', toggleSearchPanel);
      els.searchInput.addEventListener('input', onSearchInput);
      els.clearSearchButton.addEventListener('click', clearSearch);
    }

    els.messages.addEventListener('click', (event) => {
      // Lightbox functionality for images
      const img = event.target.closest('.attachment-image img');
      if (img) {
        event.preventDefault();
        openLightbox(img.src);
        return;
      }

      const jumpButton = event.target.closest('[data-jump-message]');
      if (jumpButton) {
        if (navigator.vibrate) navigator.vibrate(10);
        event.preventDefault();
        jumpToMessage(Number(jumpButton.dataset.jumpMessage));
        return;
      }
      const deleteButton = event.target.closest('[data-message-action="delete"]');
      if (deleteButton) {
        event.preventDefault();
        event.stopPropagation();
        deleteMessage(Number(deleteButton.closest('.message')?.dataset.id || 0));
        return;
      }
      if (event.target.closest('.voice-wave')) {
        event.stopPropagation();
        seekVoicePlayer(event.target.closest('.voice-player'), event);
        return;
      }
      const voiceAction = event.target.closest('[data-voice-action]');
      if (voiceAction) {
        event.stopPropagation();
        if (voiceAction.dataset.voiceAction === 'speed') {
          cycleVoiceSpeed(event.target.closest('.voice-player'));
        } else {
          toggleVoicePlayer(event.target.closest('.voice-player'));
        }
        return;
      }
      if (event.target.closest('a, button, audio, video, input, textarea')) {
        return;
      }
      const message = event.target.closest('.message');
      if (!message) {
        hideReactionDock();
        return;
      }
      state.selectedMessageId = Number(message.dataset.id);
    
    // Cinematic Focus Mode
    document.body.classList.add('reaction-active');
    message.classList.add('is-reaction-target');
      els.reactionDock.hidden = false;
    });
    els.messages.addEventListener('scroll', onMessagesScroll, { passive: true });
    els.messages.addEventListener('pointerdown', onMessagePointerDown, { passive: true });
    els.messages.addEventListener('pointermove', onMessagePointerMove, { passive: false });
    els.messages.addEventListener('pointerup', onMessagePointerUp, { passive: true });
    els.messages.addEventListener('pointercancel', onMessagePointerCancel, { passive: true });
    els.scrollBottomButton.addEventListener('click', () => {
      scrollToBottom();
      updateScrollButton();
    });

    els.reactionDock.addEventListener('click', onReactionClick);
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.message') && !event.target.closest('#reactionDock')) {
        hideReactionDock();
      }
      if (els.composerTools && !event.target.closest('.composer-main')) {
        closeComposerTools();
      }
    });

    els.enablePushButton.addEventListener('click', enablePush);
    els.notifyButton.addEventListener('click', enablePush);
    els.testPushButton.addEventListener('click', testPush);
    els.installButton.addEventListener('click', promptInstall);
    els.logoutButton.addEventListener('click', logout);
    els.themeButton.addEventListener('click', toggleTheme);
    els.settingsForm.addEventListener('submit', saveSettings);
    els.avatarButton.addEventListener('click', () => els.avatarInput.click());
    els.avatarInput.addEventListener('change', uploadAvatar);
    els.pinForm.addEventListener('submit', savePin);
    els.clearPinButton.addEventListener('click', clearPin);
    els.memoryForm.addEventListener('submit', saveMemory);
    els.memoryList.addEventListener('click', deleteMemory);
    if (els.memoryImageButton && els.memoryImageInput) {
      els.memoryImageButton.addEventListener('click', () => els.memoryImageInput.click());
      els.memoryImageInput.addEventListener('change', onMemoryImagePicked);
    }
    if (els.memoryImagePill) {
      els.memoryImagePill.addEventListener('click', (event) => {
        if (event.target.closest('[data-clear-memory-image]')) {
          clearMemoryImage();
        }
      });
    }
    if (els.cancelMemoryEditButton) {
      els.cancelMemoryEditButton.addEventListener('click', resetMemoryForm);
    }
    if (els.timedMessageForm) {
      els.timedMessageForm.addEventListener('submit', sendTimedLoveMessage);
    }
    if (els.albumFileInput) {
      els.albumFileInput.addEventListener('change', () => {
        const file = els.albumFileInput.files[0];
        if (file && window.dynamicThemer) window.dynamicThemer.applyFromImage(file);
      });
    }
    if (els.albumForm) {
      els.albumForm.addEventListener('submit', saveAlbumPhoto);
    }
    if (els.moodGrid) {
      els.moodGrid.addEventListener('click', saveMood);
    }
    if (els.stickerGrid) {
      els.stickerGrid.addEventListener('click', sendSticker);
    }
    if (els.eventForm) {
      els.eventForm.addEventListener('submit', saveLoveEvent);
    }
    if (els.promiseForm) {
      els.promiseForm.addEventListener('submit', savePromise);
    }
    if (els.promiseList) {
      els.promiseList.addEventListener('click', togglePromise);
    }
    if (els.advancedSearchForm) {
      els.advancedSearchForm.addEventListener('submit', advancedSearch);
    }
    if (els.advancedSearchResults) {
      els.advancedSearchResults.addEventListener('click', onAdvancedSearchResultClick);
    }


    ['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
      document.addEventListener(eventName, unlockIncomingSound, { once: true, passive: true });
    });

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      state.installPrompt = event;
      updateInstallState();
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        const message = event.data || {};
        if (message.type !== 'soulmate-push' || !state.user) {
          return;
        }
        const payload = message.payload || {};
        if (payload.type === 'memory') {
          loadMemories(false);
        } else {
          loadMessages(true);
        }
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && state.user) {
        loadMessages(true);
        loadMemories(false);
        loadLoveItems(false);
      }
      scheduleMemoryPoll();
    });

    window.addEventListener('online', () => {
      toast('اتصال برقرار شد.');
      flushOutbox();
      loadMessages(true);
      setupSSE(); // اتصال مجدد استریم هنگام وصل شدن اینترنت
    });

    window.addEventListener('offline', () => toast('اینترنت قطع است؛ پیام‌ها بعد از اتصال دوباره همگام می‌شوند.'));
  }

  async function decryptMessageObj(msg) {
    if (!msg || !window.E2EEManager) return msg;
    if (msg.body) msg.body = await window.E2EEManager.decrypt(msg.body);
    if (msg.reply && msg.reply.body) msg.reply.body = await window.E2EEManager.decrypt(msg.reply.body);
    return msg;
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const init = {
      credentials: 'same-origin',
      method: options.method || 'GET',
      headers
    };

    if (options.body instanceof FormData) {
      init.body = options.body;
    } else if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
      init.body = JSON.stringify(options.body);
    }

    if (state.csrf && init.method !== 'GET') {
      headers.set('X-Mobina-CSRF', state.csrf);
    }

    const response = await fetch(apiBase + path, init);
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (error) {
      throw new Error('پاسخ سرور قابل خواندن نیست.');
    }

    if (!response.ok || data.ok === false) {
      throw new Error(data.error || 'درخواست ناموفق بود.');
    }

    return data;
  }

  async function loadSession() {
    try {
      const data = await api('me.php');
      state.app = data.app || {};
      state.settings = data.settings || {};
      state.csrf = data.csrf || '';
      state.user = data.user || null;
      state.partner = data.partner || null;

      if (state.csrf) {
        LocalDB.put('settings', { key: 'csrf', value: state.csrf }).catch(() => {});
      }

      if (state.user) {
        showMain();
      } else {
        const restored = await tryTrustedLogin();
        if (!restored) {
          showLogin();
        }
      }
    } catch (error) {
      showLogin();
      toast(error.message);
    }
  }

  function showLogin() {
    if (state.sseConnection) { state.sseConnection.close(); state.sseConnection = null; }
    if (state.memoryPollTimer) { clearTimeout(state.memoryPollTimer); state.memoryPollTimer = null; }
    els.loginView.hidden = false;
    els.mainView.hidden = true;
    els.appShell.dataset.state = 'login';
    updateLoginModeAvailability();
    
    // بررسی نمایش دکمه بیومتریک در صفحه لاگین
    window.BiometricAuth.isAvailable().then(async available => {
        const savedBio = await LocalDB.get('settings', 'bio_enabled');
        const bioBtn = document.getElementById('biometricLoginBtn');
        if (bioBtn) bioBtn.hidden = !(available && savedBio && savedBio.value === '1');
    });

    setTimeout(() => (state.loginMode === 'pin' ? els.loginPin : els.loginPassword).focus(), 80);
  }

  async function showMain() {
    els.loginView.hidden = true;
    els.mainView.hidden = false;
    els.appShell.dataset.state = 'ready';
    hydrateProfile();
    hydrateSettings();
    const initialTab = new URLSearchParams(window.location.search).get('tab') || 'chat';
    showTab(['chat', 'memories', 'love', 'settings'].includes(initialTab) ? initialTab : 'chat', false);
    restoreDraft();
    
    // بارگذاری 0 میلی‌ثانیه‌ای از دیتابیس گوشی قبل از درخواست به سرور
    try {
      // بررسی اینکه آیا فایلی از گالری گوشی به برنامه Share شده است یا خیر
      const sharedItem = await LocalDB.get('settings', 'shared_item');
      if (sharedItem) {
         await LocalDB.delete('settings', 'shared_item');
         if (sharedItem.file) {
             state.pendingFile = sharedItem.file;
             renderAttachmentPill(sharedItem.file);
         }
         if (sharedItem.text) {
             els.messageInput.value = sharedItem.text;
             autoSizeTextarea();
         }
      }

      const localMessages = await LocalDB.getAll('messages');
      if (localMessages && localMessages.length) {
        mergeMessages(localMessages);
        renderMessages();
      }
      const localMemories = await LocalDB.getAll('memories');
      if (localMemories && localMemories.length) {
        state.memories = localMemories;
        renderMemories();
      }
      const localLove = await LocalDB.getAll('loveItems');
      if (localLove && localLove.length) {
        state.loveItems = localLove;
        renderLoveItems();
        updateLovePanel();
      }
    } catch(e) {}

    flushOutbox(); // ارسال پیام‌های در صف مانده
    await loadMessages(false);
    await loadMemories(false);
    await loadLoveItems(false);
    updateLovePanel();
    state.initialMessagesLoaded = true;
    state.forceScrollBottom = true;
    renderMessages();
    requestAnimationFrame(() => scrollToBottom('auto'));
    setTimeout(() => scrollToBottom('auto'), 160);
    setupSSE(); // راه‌اندازی موتور بلادرنگ به محض ورود
    scheduleMemoryPoll();
    if (window.autoLogout && typeof window.autoLogout.reset === 'function') {
      window.autoLogout.reset();
    }
  }

  async function onLogin(event) {
    event.preventDefault();
    const password = els.loginPassword.value;
    if (!password) {
      return;
    }

    try {
      const currentDevice = getDeviceCredentials();
      const data = await api('auth.php', {
        method: 'POST',
        body: {
          action: 'login',
          slug: state.selectedLogin,
          password,
          device_id: currentDevice.device_id || '',
          device_token: currentDevice.device_token || '',
          device_name: deviceName()
        }
      });
      state.user = data.user;
      state.partner = data.partner;
      state.csrf = data.csrf || state.csrf;
      
      // پیشنهاد فعال‌سازی اثرانگشت پس از ورود موفق
      if (await window.BiometricAuth.isAvailable() && !(await LocalDB.get('settings', 'bio_enabled'))) {
          setTimeout(() => promptBiometricRegistration(), 2000);
      }

      if (data.device) {
        saveDeviceCredentials(data.device, state.user.slug);
      }
      els.loginPassword.value = '';
      await loadSession();
    } catch (error) {
      toast(error.message);
    }
  }

  async function onPinLogin(event) {
    event.preventDefault();
    const pin = els.loginPin.value.trim();
    const device = getDeviceCredentials();
    if (!device.device_id || !pin) {
      toast('برای این دستگاه PIN ثبت نشده است.');
      return;
    }

    try {
      const data = await api('auth.php', {
        method: 'POST',
        body: {
          action: 'pin_login',
          device_id: device.device_id,
          pin
        }
      });
      state.user = data.user;
      state.partner = data.partner;
      state.csrf = data.csrf || state.csrf;
      els.loginPin.value = '';
      await loadSession();
    } catch (error) {
      toast(error.message);
    }
  }

  async function tryTrustedLogin() {
    const device = getDeviceCredentials();
    if (!device.device_id || !device.device_token) {
      return false;
    }

    try {
      const data = await api('auth.php', {
        method: 'POST',
        body: {
          action: 'device_login',
          device_id: device.device_id,
          device_token: device.device_token
        }
      });
      state.user = data.user;
      state.partner = data.partner;
      state.csrf = data.csrf || state.csrf;
      await showMain();
      return true;
    } catch (error) {
      return false;
    }
  }

  function setLoginMode(mode) {
    state.loginMode = mode === 'pin' ? 'pin' : 'password';
    $$('.mode-button').forEach((button) => button.classList.toggle('is-active', button.dataset.loginMode === state.loginMode));
    els.loginForm.hidden = state.loginMode !== 'password';
    els.pinLoginForm.hidden = state.loginMode !== 'pin';
    setTimeout(() => (state.loginMode === 'pin' ? els.loginPin : els.loginPassword).focus(), 50);
  }

  function updateLoginModeAvailability() {
    const hasDevice = Boolean(getDeviceCredentials().device_id);
    els.loginMode.hidden = !hasDevice;
    setLoginMode(hasDevice ? 'pin' : 'password');
  }

  async function logout() {
    try {
      await api('auth.php', { method: 'POST', body: { action: 'logout' } });
    } catch (error) {
      toast(error.message);
    }
    state.user = null;
    state.partner = null;
    state.messages.clear();
    state.lastId = 0;
    state.firstId = 0;
    state.searchActive = false;
    await LocalDB.clear('messages');
    await LocalDB.clear('memories');
    await LocalDB.clear('loveItems');
    await LocalDB.clear('outbox');
    localStorage.removeItem(DEVICE_KEY);
    showLogin();
  }

  function hydrateProfile() {
    const user = state.user || {};
    const partner = state.partner || {};
    applyAvatar(els.myAvatar, user);
    applyAvatar(els.settingsAvatar, user);
    applyAvatar(els.peerAvatar, partner);
    els.myName.textContent = user.display_name || '';
    els.settingsName.textContent = user.display_name || '';
    els.partnerName.textContent = partner.display_name ? `با ${partner.display_name}` : '';
    els.conversationTitle.textContent = partner.display_name ? `گفت‌وگو با ${partner.display_name}` : 'SoulMate';
    els.activePair.textContent = 'حسین و مبینا';
    els.presenceText.textContent = 'همگام';
    els.dailyPhrase.textContent = state.settings.daily_phrase || '';
    updateCoupleDays();
    updateLovePanel();
    updateNotificationStatus();
    renderInstallChecklist();
  }

  function renderInstallChecklist() {
    if (!els.installChecklist) {
      return;
    }
    const checks = [
      ['HTTPS', window.location.protocol === 'https:' || window.location.hostname === 'localhost'],
      ['Service Worker', 'serviceWorker' in navigator],
      ['Push', 'Notification' in window && Notification.permission === 'granted'],
      ['کلید رمزگذاری', Boolean(state.app.encryption_ready)],
      ['حذف install/update', false],
    ];
    els.installChecklist.innerHTML = checks.map(([label, ok]) => `
      <span class="${ok ? 'is-ok' : 'is-warn'}"><b>${ok ? '✓' : '!'}</b>${label}</span>
    `).join('');
  }

  function applyAvatar(element, user) {
    if (!element) {
      return;
    }
    element.textContent = user.avatar_path ? '' : (user.avatar_label || 'S');
    element.style.backgroundImage = user.avatar_path ? `url("${user.avatar_path}")` : '';
    element.classList.toggle('has-photo', Boolean(user.avatar_path));
  }

  function hydrateSettings() {
    els.coupleSinceInput.value = isoToJalaliInput(state.settings.couple_since || '');
    els.dailyPhraseInput.value = state.settings.daily_phrase || '';
    const notificationMode = state.settings.notification_mode || ((state.settings.notification_preview || '1') === '1' ? 'preview' : 'sender');
    if (els.notificationModeInput) {
      els.notificationModeInput.value = ['preview', 'sender', 'private'].includes(notificationMode) ? notificationMode : 'preview';
    }
    if (els.notificationPreviewInput) {
      els.notificationPreviewInput.checked = notificationMode === 'preview';
    }
  }

  function restoreDraft() {
    if (!state.user) {
      return;
    }
    const draft = localStorage.getItem(draftStorageKey()) || '';
    if (draft && !els.messageInput.value.trim()) {
      els.messageInput.value = draft;
      autoSizeTextarea();
    }
  }

  function saveDraft() {
    if (!state.user) {
      return;
    }
    const value = els.messageInput.value;
    if (value.trim()) {
      localStorage.setItem(draftStorageKey(), value);
    } else {
      localStorage.removeItem(draftStorageKey());
    }
  }

  function clearDraft() {
    if (state.user) {
      localStorage.removeItem(draftStorageKey());
    }
  }

  function draftStorageKey() {
    return `${DRAFT_KEY}-${state.user ? state.user.id : 'guest'}`;
  }

  function updateCoupleDays() {
    const days = currentCoupleDays();
    if (!days) {
      els.daysTogether.textContent = '۰';
      return;
    }
    els.daysTogether.textContent = toPersianNumber(days);
  }

  function showTab(tab, load = true) {
    if (state.activeTab === tab) return;
    
    const switchLogic = () => {
      state.activeTab = tab;
      $$('.nav-button').forEach((button) => button.classList.toggle('is-active', button.dataset.tab === tab));
      $$('.tab-panel').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.panel === tab));
      if (window.dynamicThemer) window.dynamicThemer.reset(); // تمیز کردن تم هنگام جابجایی
      if (tab === 'chat') {
        state.unreadMessageCount = 0;
        state.unreadIds.clear();
        state.unreadDividerId = 0;
        updateUiBadges();
        if (load) {
          loadMessages(true);
          setTimeout(() => scrollToBottom('auto'), 40);
        }
      }
      if (tab === 'memories') {
        state.unreadMemoryCount = 0;
        updateUiBadges();
        if (load) {
          loadMemories(false);
        }
      }
      if (tab === 'love') {
        updateLovePanel();
        if (load) { loadLoveItems(false); }
      }
    };

    // Use View Transitions API for Native-like routing animation
    if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const tabs = ['chat', 'memories', 'love', 'settings'];
      const currentIndex = tabs.indexOf(state.activeTab);
      const newIndex = tabs.indexOf(tab);
      document.documentElement.dataset.transitionDir = newIndex > currentIndex ? 'forward' : 'backward';
      
      document.startViewTransition(switchLogic);
    } else {
      switchLogic();
    }
  }

  function toggleSearchPanel() {
    const opening = els.chatSearch.hidden;
    els.chatSearch.hidden = !opening;
    if (opening) {
      showTab('chat', false);
      setTimeout(() => els.searchInput.focus(), 50);
    } else {
      clearSearch();
    }
  }

  function onSearchInput() {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => performSearch(els.searchInput.value), 260);
  }

  async function performSearch(rawQuery) {
    const query = rawQuery.trim().toLowerCase();
    if (query === '') {
      if (state.searchActive) {
        await clearSearch(false);
      }
      return;
    }

    state.searchActive = true;
    state.emptyMessage = 'در حال جستجو...';
    try {
      // جستجوی لوکال برای پشتیبانی از پیام‌های رمزنگاری شده E2EE
      const allMessages = await LocalDB.getAll('messages');
      const results = [];
      
      for (let i = 0; i < allMessages.length; i++) {
        const msg = allMessages[i];
        let body = msg.body || '';
        
        if (body.startsWith('E2EE:') && window.E2EEManager) {
            body = await window.E2EEManager.decrypt(body);
            msg.body = body; // بازنویسی موقت برای نمایش
        }
        
        const attachmentName = msg.attachment ? (msg.attachment.name || '') : '';
        
        if (body.toLowerCase().includes(query) || attachmentName.toLowerCase().includes(query)) {
            results.push(msg);
        }
      }
      
      results.sort((a, b) => Number(b.id) - Number(a.id));

      state.messages.clear();
      state.lastId = 0;
      state.firstId = 0;
      state.hasMoreMessages = false;
      state.emptyMessage = 'نتیجه‌ای پیدا نشد.';
      
      mergeMessages(results);
      renderMessages();
    } catch (error) {
      state.emptyMessage = 'جستجو ناموفق بود.';
      renderMessages();
      toast(error.message);
    }
  }

  async function clearSearch(hidePanel = true) {
    clearTimeout(state.searchTimer);
    if (els.searchInput) {
      els.searchInput.value = '';
    }
    if (hidePanel && els.chatSearch) {
      els.chatSearch.hidden = true;
    }
    const wasActive = state.searchActive;
    state.searchActive = false;
    state.emptyMessage = '';
    if (wasActive) {
      await reloadRecentMessages();
    }
  }

  async function loadMessages(after = true) {
    if (!state.user || state.searchActive) {
      return;
    }

    try {
      const params = new URLSearchParams();
      const limit = after ? 80 : 50;
      // Live polling intentionally reloads the latest window instead of only after lastId.
      // This prevents race conditions where a partner message with a slightly older id
      // arrives between our own send and the next poll.
      params.set('limit', String(limit));
      params.set('mark_read', isChatActive() && !document.hidden ? '1' : '0');
      const wasNearBottom = isNearBottom(els.messages);
      const data = await api(`messages.php?${params.toString()}`);
      rememberUnreadIds(data.unread_message_ids || []);
      if (!isChatActive() || document.hidden) {
        state.unreadMessageCount = Math.max(state.unreadMessageCount, Number(data.unread_count || 0));
        updateUiBadges();
      }
      if (data.messages) {
        for (let i = 0; i < data.messages.length; i++) {
          await decryptMessageObj(data.messages[i]);
        }
      }
      const mergeResult = mergeMessages(data.messages || [], { live: after && state.initialMessagesLoaded });
      syncUnreadDivider();
      
      // همگام‌سازی دیتابیس گوشی
      if (data.messages && data.messages.length) {
        LocalDB.putAll('messages', data.messages).catch(() => {});
      }
      if (data.deleted_message_ids && data.deleted_message_ids.length) {
        data.deleted_message_ids.forEach(id => LocalDB.delete('messages', Number(id)));
      }

      const messagesChanged = mergeResult.changed;
      const deletedChanged = processDeletedMessages(data.deleted_message_ids || []);
      if (!after) {
        state.hasMoreMessages = (data.messages || []).length >= limit;
        state.forceScrollBottom = true;
      }
      const receiptsChanged = applyReceiptUpdates(data.receipt_updates || []);
      if (messagesChanged || deletedChanged || !els.messages.children.length) {
        if (mergeResult.incoming.length && !wasNearBottom && !state.unreadDividerId) {
          state.unreadDividerId = Number(mergeResult.incoming[0].id);
        }
        if (mergeResult.incoming.length && wasNearBottom) {
          state.forceScrollBottom = true;
        }
        renderMessages();
        if (mergeResult.incoming.length) {
          notifyIncomingMessages(mergeResult.incoming, wasNearBottom);
        }
      } else if (receiptsChanged) {
        renderReceiptStatuses(data.receipt_updates || []);
      } else {
        updateBadge(Array.from(state.messages.values()));
        updateUiBadges();
      }
      if (state.activeTab === 'love') {
        updateLovePanel();
      }
    } catch (error) {
      if (navigator.onLine) {
        els.presenceText.textContent = 'در انتظار سرور';
      }
    }
  }

  async function loadOlderMessages() {
    if (!state.user || state.searchActive || state.loadingOlder || !state.hasMoreMessages || !state.firstId) {
      return;
    }
    state.loadingOlder = true;
    try {
      const limit = 50;
      const params = new URLSearchParams({
        before_id: String(state.firstId),
        limit: String(limit),
        mark_read: '0'
      });
      const data = await api(`messages.php?${params.toString()}`);
      const older = data.messages || [];
      for (let i = 0; i < older.length; i++) {
          await decryptMessageObj(older[i]);
      }
      processDeletedMessages(data.deleted_message_ids || []);
      state.hasMoreMessages = older.length >= limit;
      const olderResult = older.length ? mergeMessages(older) : { changed: false };
      if (older.length && olderResult.changed) {
        renderMessages();
      }
    } catch (error) {
      toast(error.message);
    } finally {
      state.loadingOlder = false;
    }
  }

  function mergeMessages(messages, options = {}) {
    let changed = false;
    const incoming = [];
    for (const message of messages) {
      const id = Number(message.id);
      if (!Number.isFinite(id) || id <= 0) {
        continue;
      }
      const previous = state.messages.get(id);
      const isNew = !previous;
      if (isNew || messageSignature(previous) !== messageSignature(message)) {
        state.messages.set(id, message);
        changed = true;
      }
      state.lastId = Math.max(state.lastId, id);
      state.firstId = state.firstId ? Math.min(state.firstId, id) : id;
      if (isNew && state.user && Number(message.sender_id) !== Number(state.user.id)) {
        if (options.live) {
          incoming.push(message);
        }
        if (document.hidden) {
          state.unreadBadge += 1;
        }
      }
    }
    return { changed, incoming };
  }

  function rememberUnreadIds(ids) {
    if (!Array.isArray(ids)) {
      return;
    }
    ids.map(Number).filter((id) => Number.isFinite(id) && id > 0).forEach((id) => state.unreadIds.add(id));
  }

  function syncUnreadDivider() {
    const visibleUnread = Array.from(state.unreadIds).filter((id) => state.messages.has(id)).sort((a, b) => a - b);
    if (visibleUnread.length && !state.unreadDividerId) {
      state.unreadDividerId = visibleUnread[0];
    }
  }

  function processDeletedMessages(ids) {
    if (!Array.isArray(ids) || !ids.length) {
      return false;
    }
    let changed = false;
    for (const rawId of ids) {
      const id = Number(rawId);
      if (state.messages.delete(id)) {
        changed = true;
      }
    }
    if (changed) {
      recalculateMessageBounds();
    }
    return changed;
  }

  function recalculateMessageBounds() {
    const ids = Array.from(state.messages.keys()).map(Number).filter(Number.isFinite);
    state.firstId = ids.length ? Math.min(...ids) : 0;
    state.lastId = ids.length ? Math.max(...ids) : 0;
  }

  function applyReceiptUpdates(updates) {
    let changed = false;
    for (const update of updates) {
      const message = state.messages.get(Number(update.message_id));
      if (message && message.status !== update.status) {
        message.status = update.status;
        changed = true;
      }
    }
    return changed;
  }

  function renderReceiptStatuses(updates) {
    for (const update of updates) {
      const status = els.messages.querySelector(`.message[data-id="${Number(update.message_id)}"] .status`);
      if (status) {
        status.dataset.status = update.status || 'sent';
        status.textContent = statusLabel(update.status);
      }
    }
    updateBadge(Array.from(state.messages.values()));
  }

  function bindMediaLoadScroll(shouldStick) {
    if (!shouldStick) {
      return;
    }
    $$('img, video', els.messages).forEach((media) => {
      if (media.complete || media.readyState >= 1) {
        return;
      }
      media.addEventListener('load', () => scrollToBottom('auto'), { once: true });
      media.addEventListener('loadedmetadata', () => scrollToBottom('auto'), { once: true });
    });
  }

  function notifyIncomingMessages(messages, wasNearBottom) {
    if (!messages.length) {
      return;
    }
    if (state.activeTab !== 'chat' || document.hidden || !wasNearBottom) {
      state.unreadMessageCount += messages.length;
    }
    updateUiBadges();
    if (!document.hidden) {
      playIncomingSound();
    }
    if (wasNearBottom && state.activeTab === 'chat' && !document.hidden) {
      state.forceScrollBottom = true;
      setTimeout(() => scrollToBottom('smooth'), 30);
    }
  }

  function updateUiBadges() {
    setBadge(els.chatTabBadge, state.unreadMessageCount);
    setBadge(els.memoriesTabBadge, state.unreadMemoryCount);
  }

  function setBadge(element, count) {
    if (!element) {
      return;
    }
    const value = Number(count) || 0;
    element.hidden = value < 1;
    element.textContent = value > 99 ? '۹۹+' : toPersianNumber(value);
  }

  function messageSignature(message) {
    return JSON.stringify({
      body: message.body || '',
      kind: message.kind || '',
      status: message.status || '',
      attachment: message.attachment || null,
      reply_to_id: message.reply_to_id || null,
      open_at: message.open_at || null,
      locked: message.locked || false,
      reply: message.reply || null,
      reactions: message.reactions || []
    });
  }

  function openLightbox(src) {
    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox-overlay';
    lightbox.innerHTML = `<img src="${escapeHtml(src)}" alt="تصویر تمام صفحه">`;
    
    lightbox.addEventListener('click', () => {
      lightbox.classList.add('closing');
      setTimeout(() => lightbox.remove(), 300);
    });
    
    document.body.appendChild(lightbox);
    // Trigger animation
    requestAnimationFrame(() => lightbox.classList.add('open'));
  }

  function syncDOM(container, newHtml) {
    // این تابع به جای دستکاری پیچیده DOM، فقط در صورت نیاز کل محتوا را جایگزین می‌کند.
    // این رویکرد ساده‌تر و مقاوم‌تر است و از باگ‌های Diffing جلوگیری می‌کند.
    // برای جلوگیری از پرش، منطق اسکرول در renderMessages به دقت کنترل می‌شود.
    if (container.innerHTML !== newHtml) {
      container.innerHTML = newHtml;
    }
  }

  function renderMessages() {
    // Combine real messages and optimistic temporary messages
    const allMessages = [...Array.from(state.messages.values()), ...Array.from(state.tempMessages.values())];
    
    // مرتب‌سازی پیام‌ها با مدیریت شناسه‌های موقت (temp-ID)
    const messages = allMessages.sort((a, b) => {
      const idA = String(a.id || '');
      const idB = String(b.id || '');

      const isTempA = idA.startsWith('temp-');
      const isTempB = idB.startsWith('temp-');

      // پیام‌های موقت همیشه بعد از پیام‌های واقعی با ID عددی قرار می‌گیرند
      if (isTempA && !isTempB) return 1; // A is temp, B is real -> A comes after B
      if (!isTempA && isTempB) return -1; // A is real, B is temp -> A comes before B

      // اگر هر دو موقت یا هر دو واقعی باشند، بر اساس ID عددی یا زمان ایجاد مرتب می‌شوند
      if (isTempA && isTempB) {
        // برای پیام‌های موقت، بر اساس زمان ایجاد مرتب‌سازی می‌کنیم
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      
      // برای پیام‌های واقعی، بر اساس ID عددی مرتب‌سازی می‌کنیم
      return Number(idA) - Number(idB);
    });
    
    const previousHeight = els.messages.scrollHeight || 0;
    const previousTop = els.messages.scrollTop || 0;
    const wasNearBottom = isNearBottom(els.messages);

    if (!messages.length) {
      syncDOM(els.messages, `<div class="empty-state">${escapeHtml(state.emptyMessage || 'اولین پیام اینجا می‌نشیند.')}</div>`);
      updateBadge([]);
      updateScrollButton();
      return;
    }

    let lastDateKey = '';
    let unreadInserted = false;
    
    // ساخت HTML جدید
    const messagesHtml = messages.map((message, i, arr) => {
      // Smart Grouping Logic
      const prev = i > 0 ? arr[i - 1] : null;
      const next = i < arr.length - 1 ? arr[i + 1] : null;
      
      const isSameSenderPrev = prev && prev.sender_id === message.sender_id && (new Date(message.created_at) - new Date(prev.created_at) < 300000); // 5 mins
      const isSameSenderNext = next && next.sender_id === message.sender_id && (new Date(next.created_at) - new Date(message.created_at) < 300000);

      message.isGroupStart = !isSameSenderPrev;
      message.isGroupEnd = !isSameSenderNext;

      const dateKey = String(message.created_at || '').slice(0, 10);
      const separator = dateKey && dateKey !== lastDateKey
        ? `<div class="date-separator"><span>${formatDate(message.created_at)}</span></div>`
        : '';
      lastDateKey = dateKey || lastDateKey;
      const unreadSeparator = !unreadInserted && state.unreadDividerId && Number(message.id) >= Number(state.unreadDividerId)
        ? '<div class="unread-separator"><span>پیام‌های جدید</span></div>'
        : '';
      if (unreadSeparator) {
        unreadInserted = true;
      }

      return separator + unreadSeparator + renderMessage(message);
    }).join(''); // اینجا HTML نهایی ساخته می‌شود

    syncDOM(els.messages, messagesHtml); // اینجا DOM فقط در صورت تغییر واقعی آپدیت می‌شود

    bindMediaLoadScroll(wasNearBottom || state.forceScrollBottom);
    if (wasNearBottom || state.forceScrollBottom) {
      scrollToBottom('auto');
    } else if (previousHeight > 0) {
      // اگر اسکرول به بالا بود، موقعیت را حفظ کن
      els.messages.scrollTop = previousTop;
    }
    state.forceScrollBottom = false;
    updateBadge(messages);
    updateScrollButton();
  }

  function renderMessage(message) {
    const own = Number(message.sender_id) === Number(state.user.id);
    const classes = ['message', own ? 'is-own' : 'is-partner'];
    if (message.isTemp) classes.push('is-optimistic-sending');
    if (message.kind === 'love' || message.kind === 'letter') {
      classes.push('is-love');
    }
    if (message.kind === 'letter') {
      classes.push('is-letter');
    }
    if (message.kind === 'timed') {
      classes.push('is-timed');
    }
    if (message.kind === 'sticker') {
      classes.push('is-sticker');
    }
    
    // Grouping classes
    if (!message.isGroupStart && !message.isGroupEnd) {
      classes.push('is-grouped-middle');
    } else if (!message.isGroupStart) {
      classes.push('is-grouped-bottom');
    } else if (!message.isGroupEnd) {
      classes.push('is-grouped-top');
    }

    const reply = renderReplySnippet(message);
    const body = renderMessageBody(message);
    const attachment = message.attachment ? renderAttachment(message.attachment) : '';
    const reactions = (message.reactions || []).length
      ? `<div class="reaction-row">${message.reactions.map((item) => `<span class="reaction-chip">${escapeHtml(item.reaction)}</span>`).join('')}</div>`
      : '';
    const status = own ? `<span class="status" data-status="${message.status || 'sent'}">${message.isTemp ? statusLabel(message.status || 'sending') : statusLabel(message.status)}</span>` : '';
    const deleteAction = own && canDeleteMessage(message)
      ? '<button class="message-delete-btn" type="button" data-message-action="delete" title="حذف پیام">حذف</button>'
      : '';
    const renderSig = escapeHtml(messageSignature(message) + `|${message.isGroupStart}|${message.isGroupEnd}|${message.isTemp}`);

    return `
      <article class="${classes.join(' ')}" data-id="${message.id}" data-signature="${renderSig}" tabindex="0">
        <div class="bubble">
          ${reply}
          ${body}
          ${attachment}
          ${reactions}
          <div class="message-meta">
            ${status}
            <time datetime="${escapeHtml(message.created_at)}">${message.isTemp ? 'در حال ارسال...' : formatTime(message.created_at)}</time>
            ${deleteAction}
          </div>
        </div>
      </article>
    `;
  }

  function renderMessageBody(message) {
    if (message.kind === 'sticker') {
      return message.body ? `<div class="sticker-message">${escapeHtml(message.body)}</div>` : '';
    }
    if (message.kind === 'timed') {
      const locked = Boolean(message.locked);
      const when = message.open_at ? formatDate(message.open_at) + ' ' + formatTime(message.open_at) : 'زمان تعیین‌شده';
      if (locked) {
        return `<div class="timed-locked"><strong>پیام زمان‌دار</strong><span>در ${escapeHtml(when)} باز می‌شود.</span></div>`;
      }
      const text = message.body ? `<p class="message-body">${escapeHtml(message.body)}</p>` : '';
      return `<div class="timed-unlocked"><small>پیام زمان‌دار باز شده</small>${text}</div>`;
    }
    return message.body ? `<p class="message-body">${escapeHtml(message.body)}</p>` : '';
  }

  function renderReplySnippet(message) {
    const reply = message.reply || null;
    if (!reply) {
      return '';
    }
    const sender = reply.sender_name || 'پیام';
    const text = reply.body || (reply.kind === 'letter' ? 'نامه عاشقانه' : 'پیام پیوست‌دار');
    return `
      <button class="message-reply-snippet" type="button" data-jump-message="${Number(reply.id)}">
        <strong>${escapeHtml(sender)}</strong>
        <span>${escapeHtml(text)}</span>
      </button>
    `;
  }

  function renderAttachment(file) {
    const url = escapeHtml(file.url);
    const rawName = file.name || 'فایل';
    const name = escapeHtml(rawName);
    const mime = file.mime || '';
    const size = file.size ? formatBytes(file.size) : '';

    if (mime.startsWith('image/')) {
      return `<div class="attachment attachment-image"><a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${name}" loading="lazy" decoding="async"></a></div>`;
    }
    if (mime.startsWith('audio/')) {
      const audioId = escapeHtml(String(file.id || file.url || rawName));
      return `
        <div class="attachment attachment-audio">
          <div class="voice-player" data-audio-url="${url}" data-audio-id="${audioId}">
            <button class="voice-toggle" type="button" data-voice-action="toggle" aria-label="پخش ویس">▶</button>
            <div class="voice-wave" aria-hidden="true">${Array.from({ length: 22 }, (_, index) => `<span style="--h:${28 + ((index * 19) % 48)}%"></span>`).join('')}</div>
            <span class="voice-time">۰۰:۰۰</span>
            <button class="voice-speed" type="button" data-voice-action="speed" aria-label="سرعت پخش">1×</button>
            <a class="voice-download" href="${url}" download="${name}" title="دانلود">↓</a>
          </div>
        </div>
      `;
    }
    if (mime.startsWith('video/')) {
      return `
        <div class="attachment attachment-video">
          <video src="${url}" controls playsinline preload="metadata"></video>
          <a class="file-link compact" href="${url}" target="_blank" rel="noopener" download="${name}">
            <span>${name}</span><small>${size}</small>
          </a>
        </div>
      `;
    }
    return `
      <div class="attachment attachment-file">
        <a class="file-link" href="${url}" target="_blank" rel="noopener" download="${name}">
          <span>${name}</span><small>${size}</small>
        </a>
      </div>
    `;
  }

  function jumpToMessage(messageId) {
    const element = els.messages.querySelector(`.message[data-id="${Number(messageId)}"]`);
    if (!element) {
      toast('این پیام در بخش فعلی چت نیست.');
      return;
    }
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    element.classList.add('is-highlighted');
    setTimeout(() => element.classList.remove('is-highlighted'), 1400);
  }

  function onMessagePointerDown(event) {
    const message = event.target.closest('.message');
    if (!message || event.target.closest('a, button, audio, video, input, textarea')) {
      return;
    }
    
    // توقف انیمیشن قبلی
    if (message._springLoop) cancelAnimationFrame(message._springLoop);

    state.swipeMessage = {
      element: message,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: performance.now(),
      velocityX: 0,
      active: false
    };
  }

  function onMessagePointerMove(event) {
    const swipe = state.swipeMessage;
    if (!swipe) {
      return;
    }
    
    // محاسبه سرعت لحظه‌ای (Velocity) برای فیزیک فنر
    const now = performance.now();
    const dt = Math.max(1, now - swipe.lastTime);
    swipe.velocityX = (event.clientX - swipe.lastX) / dt;
    swipe.lastX = event.clientX;
    swipe.lastTime = now;

    const dx = event.clientX - swipe.startX;
    const dy = event.clientY - swipe.startY;
    if (dx < -8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      swipe.active = true;
      const amount = Math.min(76, Math.max(0, -dx));
      swipe.element.style.setProperty('--swipe-x', `-${amount}px`);
      swipe.element.style.setProperty('--swipe-progress', String(Math.min(1, amount / 76)));
      swipe.element.classList.toggle('is-swiping-reply', amount > 18);
      if (amount > 56 && !swipe.element.classList.contains('is-swiping-reply-vibrated')) {
        if (navigator.vibrate) { navigator.vibrate(12); }
        swipe.element.classList.add('is-swiping-reply-vibrated');
      }
      if (amount <= 56) {
        swipe.element.classList.remove('is-swiping-reply-vibrated');
      }
      event.preventDefault();
    }
  }

  function onMessagePointerUp(event) {
    const swipe = state.swipeMessage;
    if (!swipe) {
      return;
    }
    const dx = event.clientX - swipe.startX;
    const dy = event.clientY - swipe.startY;
    const messageId = Number(swipe.element.dataset.id || 0);
    
    const shouldReply = messageId && dx < -56 && Math.abs(dx) > Math.abs(dy) * 1.2;
    
    // اعمال فیزیک فنر به جای reset خشک
    springToZero(swipe.element, dx, swipe.velocityX);
    
    state.swipeMessage = null;

    if (shouldReply) {
      setReply(messageId);
    }
  }

  function onMessagePointerCancel(event) {
    const swipe = state.swipeMessage;
    if (!swipe) {
      return;
    }
    // Just spring back to zero without triggering a reply
    springToZero(swipe.element, 0, 0);
    state.swipeMessage = null;
  }

  // انیمیشن بومی مبتنی بر فیزیک (Spring Physics) برای بازگشت ریپلای
  function springToZero(element, startX, startVelocity) {
    let x = Math.max(-76, Math.min(0, startX));
    let v = startVelocity * 16; // تبدیل سرعت
    const stiffness = 0.3;
    const damping = 0.7;

    element.classList.remove('is-swiping-reply', 'is-swiping-reply-vibrated');

    function loop() {
        const force = -x * stiffness;
        v = (v + force) * damping;
        x += v;

        if (Math.abs(x) < 0.5 && Math.abs(v) < 0.5) {
            element.style.removeProperty('--swipe-x');
            element.style.removeProperty('--swipe-progress');
            element._springLoop = null;
            return;
        }
        
        element.style.setProperty('--swipe-x', `${x}px`);
        element._springLoop = requestAnimationFrame(loop);
    }
    
    if (element._springLoop) cancelAnimationFrame(element._springLoop);
    element._springLoop = requestAnimationFrame(loop);
  }

  function buildReplyPreview(messageId) {
    const message = state.messages.get(Number(messageId));
    if (!message) {
      return null;
    }
    const sender = message.sender_name || (Number(message.sender_id) === Number(state.user?.id) ? 'خودم' : 'عشق من');
    const text = message.body || (message.attachment ? (message.attachment.name || 'فایل / ویس') : 'پیام');
    return {
      id: Number(message.id),
      sender_name: sender,
      body: text
    };
  }

  function setReply(messageId) {
    const message = state.messages.get(Number(messageId));
    if (!message) {
      return;
    }
    state.replyToId = Number(message.id);
    const sender = message.sender_name || (Number(message.sender_id) === Number(state.user?.id) ? 'خودم' : 'عشق من');
    const text = message.body || (message.attachment ? 'فایل / ویس' : 'پیام');
    if (els.replyPreview && els.replyPreviewText) {
      els.replyPreview.hidden = false;
      els.replyPreviewText.textContent = `${sender}: ${text}`;
    }
    els.composer.classList.add('has-reply', 'reply-pop');
    setTimeout(() => els.composer.classList.remove('reply-pop'), 360);
    focusComposer();
  }

  function clearReply(options = {}) {
    state.replyToId = null;
    if (els.replyPreview) {
      els.replyPreview.hidden = true;
    }
    if (els.replyPreviewText) {
      els.replyPreviewText.textContent = '';
    }
    els.composer.classList.remove('has-reply', 'reply-pop');
    if (!options.keepKeyboard) {
      requestAnimationFrame(() => keepComposerVisible(false));
    }
  }

  function toggleVoicePlayer(player) {
    if (!player) {
      return;
    }
    const url = player.dataset.audioUrl || '';
    if (!url) {
      return;
    }

    if (state.activeVoicePlayer === player && state.activeAudio) {
      if (state.activeAudio.paused) {
        playActiveAudio();
      } else {
        state.activeAudio.pause();
        player.classList.remove('is-playing');
      }
      return;
    }

    resetVoicePlayer();
    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous'; // مورد نیاز برای Web Audio API
    audio.preload = 'metadata';
    state.activeAudio = audio;
    state.activeVoicePlayer = player;
    audio.playbackRate = Number(player.dataset.speed || '1') || 1;
    player.classList.add('is-loading');

    // Spatial Audio (صدای سه‌بعدی و فضایی)
    try {
        if (!window.audioCtx) window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (window.audioCtx.state === 'suspended') window.audioCtx.resume();
        
        const source = window.audioCtx.createMediaElementSource(audio);
        const panner = window.audioCtx.createStereoPanner();
        
        // تشخیص صاحب ویس برای هدایت کانال صوتی
        const isOwn = player.closest('.message.is-own') !== null;
        panner.pan.value = isOwn ? 0.6 : -0.6; // 0.6 یعنی 60% صدای سمت راست
        
        source.connect(panner);
        panner.connect(window.audioCtx.destination);
    } catch (e) {
        console.warn('Spatial audio fallback used:', e);
    }

    audio.addEventListener('loadedmetadata', () => updateVoicePlayer(player, audio));
    audio.addEventListener('timeupdate', () => updateVoicePlayer(player, audio));
    audio.addEventListener('ended', resetVoicePlayer);
    audio.addEventListener('error', () => {
      resetVoicePlayer();
      toast('پخش ویس ناموفق بود.');
    });

    playActiveAudio();
  }

  function cycleVoiceSpeed(player) {
    if (!player) { return; }
    const speeds = [1, 1.25, 1.5, 2];
    const current = Number(player.dataset.speed || '1');
    const next = speeds[(Math.max(0, speeds.indexOf(current)) + 1) % speeds.length];
    player.dataset.speed = String(next);
    const speedButton = $('.voice-speed', player);
    if (speedButton) { speedButton.textContent = `${next}×`; }
    if (state.activeVoicePlayer === player && state.activeAudio) {
      state.activeAudio.playbackRate = next;
    }
  }

  function seekVoicePlayer(player, event) {
    if (!player || state.activeVoicePlayer !== player || !state.activeAudio || !Number.isFinite(state.activeAudio.duration)) {
      toggleVoicePlayer(player);
      return;
    }
    const wave = event.target.closest('.voice-wave');
    const rect = wave.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
    state.activeAudio.currentTime = state.activeAudio.duration * ratio;
    updateVoicePlayer(player, state.activeAudio);
  }

  function playActiveAudio() {
    if (!state.activeAudio || !state.activeVoicePlayer) {
      return;
    }
    state.activeAudio.play()
      .then(() => {
        state.activeVoicePlayer.classList.remove('is-loading');
        state.activeVoicePlayer.classList.add('is-playing');
      })
      .catch(() => {
        resetVoicePlayer();
        toast('پخش ویس توسط مرورگر متوقف شد.');
      });
  }

  function updateVoicePlayer(player, audio) {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const progress = duration > 0 ? Math.min(1, current / duration) : 0;
    player.style.setProperty('--progress', `${progress * 100}%`);
    const time = $('.voice-time', player);
    if (time) {
      time.textContent = formatDuration(Math.round(duration > 0 ? duration - current : current));
    }
  }

  function resetVoicePlayer() {
    if (state.activeAudio) {
      state.activeAudio.pause();
      state.activeAudio.src = '';
    }
    if (state.activeVoicePlayer) {
      state.activeVoicePlayer.classList.remove('is-playing', 'is-loading');
      state.activeVoicePlayer.style.setProperty('--progress', '0%');
      const time = $('.voice-time', state.activeVoicePlayer);
      if (time) {
        time.textContent = '۰۰:۰۰';
      }
    }
    state.activeAudio = null;
    state.activeVoicePlayer = null;
  }

  async function onSendMessage(event) {
    event.preventDefault();
    const rawText = normalizeComposerText(els.messageInput.value);
    const text = rawText.trim();
    const file = state.pendingFile;

    if (window.haptics) window.haptics.light(); // ویبره نرم هنگام ارسال

    if (!text && !file) {
      return;
    }

    const replyToId = state.replyToId ? Number(state.replyToId) : null;
    const messageKind = state.timedMode ? 'timed' : (state.letterMode ? 'letter' : (state.loveMode ? 'love' : 'text'));
    const openAt = state.timedMode ? (state.pendingOpenAt || localDateTimeToUtc(els.timedOpenAt?.value || '')) : null;

    setComposerBusy(true);

    const payloadBody = await window.E2EEManager.encrypt(rawText.trim() ? rawText : '');

    const tempId = 'temp-' + Date.now();
    const tempMessage = {
      id: tempId,
      isTemp: true,
      sender_id: state.user.id,
      body: rawText.trim() ? rawText : '',
      kind: messageKind,
      attachment: file ? { name: file.name, size: file.size, mime: file.type || '' } : null,
      reply_to_id: replyToId,
      reply: replyToId ? buildReplyPreview(replyToId) : null,
      created_at: new Date().toISOString(),
      status: navigator.onLine ? 'sending' : 'queued'
    };
    
    state.tempMessages.set(tempId, tempMessage);
    renderMessages();
    scrollToBottom('smooth');
    closeComposerTools();
    clearReply({ keepKeyboard: true });
    clearComposer();

    // هندلینگ پیام آفلاین و Background Sync
    if (!navigator.onLine) {
      await LocalDB.put('outbox', {
        tempId,
        message: tempMessage,
        payload: {
          body: payloadBody,
          kind: messageKind,
          reply_to_id: replyToId,
          open_at: openAt
        },
        file: file
      });
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.sync.register('sync-outbox');
      } catch(e) {}
      toast('در حالت آفلاین هستید. پیام در صف ارسال قرار گرفت.');
      setComposerBusy(false);
      return;
    }

    try {
      let attachmentId = null;
      if (file) {
        const uploaded = await uploadFile(file);
        attachmentId = uploaded.id;
      }

      const data = await api('messages.php', {
        method: 'POST',
        body: {
          client_id: createClientId(),
          body: payloadBody,
          kind: messageKind,
          attachment_id: attachmentId,
          reply_to_id: replyToId,
          open_at: openAt
        }
      });

      if (data.message) {
        await decryptMessageObj(data.message);
        mergeMessages([data.message]);
        await LocalDB.put('messages', data.message);
        state.forceScrollBottom = true;
        if (data.message.kind === 'love' || data.message.kind === 'letter' || data.message.kind === 'timed' || data.message.kind === 'sticker') {
          createHeartBurst(data.message.kind === 'letter' ? 'letter' : 'heart');
        }
      }
      state.tempMessages.delete(tempId);
      renderMessages();
      scrollToBottom();
      focusComposer();
      await sendTyping(false);
    } catch (error) {
      state.tempMessages.delete(tempId);
      renderMessages();
      toast(error.message);
    } finally {
      setComposerBusy(false);
    }
  }

  async function flushOutbox() {
    if (!navigator.onLine || !state.user) return;
    const items = await LocalDB.getAll('outbox');
    if (!items || !items.length) return;

    for (const item of items) {
      try {
        let attachmentId = null;
        if (item.file) {
          const uploaded = await uploadFile(item.file);
          attachmentId = uploaded.id;
        }
        const data = await api('messages.php', {
          method: 'POST',
          body: {
            client_id: item.tempId,
            body: item.payload.body,
            kind: item.payload.kind,
            attachment_id: attachmentId,
            reply_to_id: item.payload.reply_to_id,
            open_at: item.payload.open_at
          }
        });
        if (data.message) {
          await decryptMessageObj(data.message);
          mergeMessages([data.message]);
          await LocalDB.put('messages', data.message);
        }
        await LocalDB.delete('outbox', item.tempId);
        state.tempMessages.delete(item.tempId);
      } catch (error) {
        console.error('Offline send failed', error);
      }
    }
    renderMessages();
  }

  async function uploadFile(file) {
    const form = new FormData();
    form.append('file', file, file.name || `voice-${Date.now()}.webm`);
    const data = await api('upload.php', {
      method: 'POST',
      body: form
    });
    return data.attachment;
  }

  function onMessageInput() {
    autoSizeTextarea();
    saveDraft();
    if (els.messageInput.value.trim()) {
      maybeSendTyping();
    } else {
      sendTyping(false);
    }
  }

  function onMessageKeydown(event) {
    if (event.key === 'Escape') {
      closeComposerTools();
    }
  }

  function toggleComposerTools(event) {
    event.preventDefault();
    event.stopPropagation();
    const opening = els.composerTools.hidden;
    els.composerTools.hidden = !opening;
    els.composerMenuButton.classList.toggle('is-active', opening);
    document.body.classList.toggle('composer-tools-sheet-open', opening);
  }

  function closeComposerTools() {
    if (!els.composerTools || els.composerTools.hidden) {
      return;
    }
    els.composerTools.hidden = true;
    els.composerMenuButton?.classList.remove('is-active');
    document.body.classList.remove('composer-tools-sheet-open');
  }

  function autoSizeTextarea() {
    els.messageInput.style.height = 'auto';
    els.messageInput.style.height = `${Math.min(132, els.messageInput.scrollHeight)}px`;
    keepComposerVisible(false);
  }

  async function maybeSendTyping() {
    const now = Date.now();
    if (now - state.lastTypingSent > 1800) {
      state.lastTypingSent = now;
      await sendTyping(true);
    }
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => sendTyping(false), 2000);
  }

  async function sendTyping(typing) {
    if (!state.user) {
      return;
    }
    try {
      await api('typing.php', {
        method: 'POST',
        body: { typing: Boolean(typing) }
      });
    } catch (error) {
      // Typing state is intentionally best-effort.
    }
  }

  // این تابع حالا مستقیماً توسط SSE صدا زده می‌شود
  function renderTypingState(isTyping) {
      const partnerName = (state.partner && state.partner.display_name) || 'طرف مقابل';
      const partnerLabel = state.partner ? (state.partner.avatar_label || partnerName.charAt(0)) : 'م';
      
      if (isTyping) {
        els.typingLine.classList.add('is-active');
        els.typingLine.innerHTML = `
          <div class="typing-bubble">
            <span class="typing-avatar">${escapeHtml(partnerLabel)}</span>
            <span class="typing-text">${escapeHtml(partnerName)} در حال نوشتن</span>
            <div class="typing-dots"><span></span><span></span><span></span></div>
          </div>
        `;
      } else {
        els.typingLine.classList.remove('is-active');
      }
      els.presenceText.textContent = isTyping ? 'در حال نوشتن' : 'همگام';
  }

  function onFilePicked() {
    const file = els.fileInput.files && els.fileInput.files[0];
    if (!file) {
      return;
    }

    if (state.app.max_upload_bytes && file.size > state.app.max_upload_bytes) {
      toast('حجم فایل بیش از حد مجاز است.');
      els.fileInput.value = '';
      return;
    }

    state.pendingFile = file;
    state.pendingFileDuration = 0;
    renderAttachmentPill(file);
  }

  async function toggleRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
      stopRecording(true);
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      toast('ضبط ویس روی این مرورگر فعال نیست.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = supportedRecordingMime();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      state.mediaChunks = [];
      state.mediaRecorder = recorder;
      state.mediaStream = stream;
      state.recordingCanceled = false;

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          state.mediaChunks.push(event.data);
        }
      });

      recorder.addEventListener('stop', () => {
        stopRecordingTracks();
        stopRecordingTimer();
        setRecordingUi(false);
        const chunks = state.mediaChunks.slice();
        const type = recorder.mimeType || 'audio/webm';
        const elapsed = Math.max(0, Math.floor((Date.now() - state.recordingStartedAt) / 1000));
        if (!state.recordingCanceled && chunks.length) {
          const blob = new Blob(chunks, { type });
          if (elapsed < 1 || blob.size < 200) {
            toast('ویس خیلی کوتاه بود.');
          } else if (blob.size > 0) {
            const extension = recordingExtension(type);
            state.pendingFile = new File([blob], `voice-${Date.now()}.${extension}`, { type });
            state.pendingFileDuration = elapsed;
            renderAttachmentPill(state.pendingFile, elapsed);
            toast('ویس آماده ارسال است.');
          }
        }
        state.mediaRecorder = null;
        state.mediaChunks = [];
        state.recordingCanceled = false;
      });

      recorder.start(250);
      state.recordingStartedAt = Date.now();
      startRecordingTimer();
      setRecordingUi(true);
      toast('ضبط شروع شد.');
    } catch (error) {
      stopRecordingTracks();
      setRecordingUi(false);
      toast('دسترسی به میکروفون داده نشد.');
    }
  }

  function stopRecording(save) {
    if (!state.mediaRecorder) {
      return;
    }
    state.recordingCanceled = !save;
    if (state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
  }

  function cancelRecording() {
    if (!state.mediaRecorder) {
      return;
    }
    stopRecording(false);
    toast('ضبط ویس لغو شد.');
  }

  function supportedRecordingMime() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ];
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) {
      return '';
    }
    return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  function recordingExtension(type) {
    if (type.includes('mp4') || type.includes('aac')) {
      return 'm4a';
    }
    if (type.includes('ogg')) {
      return 'ogg';
    }
    return 'webm';
  }

  function stopRecordingTracks() {
    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach((track) => track.stop());
      state.mediaStream = null;
    }
  }

  function setRecordingUi(active) {
    els.recordButton.classList.toggle('is-recording', active);
    els.recordButton.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (els.recordingPanel) {
      els.recordingPanel.hidden = !active;
    }
    if (!active && els.recordingTime) {
      els.recordingTime.textContent = '۰۰:۰۰';
    }
  }

  function startRecordingTimer() {
    stopRecordingTimer();
    updateRecordingTime();
    state.recordingTimer = setInterval(updateRecordingTime, 500);
  }

  function stopRecordingTimer() {
    if (state.recordingTimer) {
      clearInterval(state.recordingTimer);
      state.recordingTimer = null;
    }
  }

  function updateRecordingTime() {
    const elapsed = Math.max(0, Math.floor((Date.now() - state.recordingStartedAt) / 1000));
    if (els.recordingTime) {
      els.recordingTime.textContent = formatDuration(elapsed);
    }
    if (elapsed >= 180 && state.mediaRecorder && state.mediaRecorder.state === 'recording') {
      stopRecording(true);
      toast('حداکثر زمان ویس ۳ دقیقه است.');
    }
  }

  function renderAttachmentPill(file, durationSeconds = 0) {
    els.attachmentPill.hidden = false;
    const mime = file.type || '';
    const isAudio = mime.startsWith('audio/');
    const isImage = mime.startsWith('image/');
    const isVideo = mime.startsWith('video/');
    const typeLabel = isAudio ? 'ویس' : (isImage ? 'عکس' : (isVideo ? 'ویدیو' : 'فایل'));
    const voiceMeta = isAudio && durationSeconds ? ` · ${formatDuration(durationSeconds)}` : '';
    const label = isAudio ? 'ویس آماده ارسال' : (file.name || 'فایل');
    const wave = isAudio ? `<div class="pending-wave" aria-hidden="true">${Array.from({ length: 14 }, (_, index) => `<span style="--h:${30 + ((index * 23) % 55)}%"></span>`).join('')}</div>` : '';
    els.attachmentPill.innerHTML = `
      <span class="pending-file-icon" data-kind="${escapeHtml(typeLabel)}"></span>
      <span class="pending-file-meta"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(typeLabel)}${voiceMeta} · ${formatBytes(file.size)}</small></span>
      ${wave}
      <button type="button" data-clear-attachment aria-label="حذف پیوست">×</button>
    `;
  }

  function clearPendingAttachment() {
    state.pendingFile = null;
    state.pendingFileDuration = 0;
    els.fileInput.value = '';
    els.attachmentPill.hidden = true;
    els.attachmentPill.textContent = '';
  }

  function clearComposer() {
    els.messageInput.value = '';
    clearDraft();
    clearPendingAttachment();
    setComposerMode('text');
    autoSizeTextarea();
  }

  function setComposerMode(mode) {
    state.loveMode = mode === 'love';
    state.letterMode = mode === 'letter';
    state.timedMode = mode === 'timed';
    if (!state.timedMode) {
      state.pendingOpenAt = '';
      if (els.timedOpenAt) {
        els.timedOpenAt.value = '';
      }
    } else if (els.timedOpenAt && !els.timedOpenAt.value) {
      els.timedOpenAt.value = defaultOpenAtValue();
      state.pendingOpenAt = localDateTimeToUtc(els.timedOpenAt.value);
    }
    els.loveModeButton.classList.toggle('is-active', state.loveMode);
    els.letterModeButton.classList.toggle('is-active', state.letterMode);
    els.timedModeButton?.classList.toggle('is-active', state.timedMode);
    if (els.timedPanel) {
      els.timedPanel.hidden = !state.timedMode;
    }
    els.composer.classList.toggle('is-love-mode', state.loveMode);
    els.composer.classList.toggle('is-letter-mode', state.letterMode);
    els.composer.classList.toggle('is-timed-mode', state.timedMode);
    els.messageInput.placeholder = state.timedMode ? 'پیام زمان‌دار...' : (state.letterMode ? 'نامه عاشقانه...' : (state.loveMode ? 'پیام قلبی...' : 'پیام...'));
    requestAnimationFrame(() => keepComposerVisible(false));
  }

  function setComposerBusy(busy) {
    els.sendButton.disabled = busy;
    els.attachButton.disabled = busy;
    els.recordButton.disabled = busy;
    if (els.emojiButton) {
      els.emojiButton.disabled = busy;
    }
    if (els.composerMenuButton) {
      els.composerMenuButton.disabled = busy;
    }
    els.messageInput.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  function canDeleteMessage(message) {
    if (!message || Number(message.sender_id) !== Number(state.user?.id)) {
      return false;
    }
    const created = Date.parse(String(message.created_at || '').replace(' ', 'T') + 'Z');
    if (!Number.isFinite(created)) {
      return false;
    }
    return Date.now() - created <= 5 * 60 * 1000;
  }

  async function deleteMessage(messageId) {
    if (!messageId) {
      return;
    }
    
    const confirmed = await openBottomSheet({
        title: 'حذف پیام',
        description: 'این پیام برای هر دو نفر حذف می‌شود. آیا مطمئن هستید؟',
        confirmText: 'بله، حذف شود',
        danger: true
    });
    if (!confirmed) return;
    if (window.haptics) window.haptics.heavy(); // ویبره سنگین برای حذف

    try {
      await api('messages.php', {
        method: 'DELETE',
        body: { message_id: messageId }
      });
      state.messages.delete(Number(messageId));
      LocalDB.delete('messages', Number(messageId)).catch(() => {});
      recalculateMessageBounds();
      renderMessages();
      toast('پیام حذف شد.');
    } catch (error) {
      toast(error.message);
    }
  }

  async function onReactionClick(event) {
    const button = event.target.closest('button[data-reaction]');
    if (!button || !state.selectedMessageId) {
      return;
    }
    try {
      await api('reactions.php', {
        method: 'POST',
        body: {
          message_id: state.selectedMessageId,
          reaction: button.dataset.reaction
        }
      });
      hideReactionDock();
      await reloadRecentMessages();
    } catch (error) {
      toast(error.message);
    }
    if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
  }

  function hideReactionDock() {
    els.reactionDock.hidden = true;
    state.selectedMessageId = null;
    document.body.classList.remove('reaction-active');
    $$('.message.is-reaction-target').forEach(m => m.classList.remove('is-reaction-target'));
  }

  async function reloadRecentMessages() {
    await loadMessages(true);
  }

  async function loadMemories(markSeen = true) {
    if (!state.user) {
      return;
    }
    try {
      const previousLast = state.lastSeenMemoryId || 0;
      const data = await api('memories.php');
      state.memories = data.memories || [];
      const maxId = state.memories.reduce((max, memory) => Math.max(max, Number(memory.id) || 0), 0);
      if (previousLast && maxId > previousLast && state.activeTab !== 'memories') {
        state.unreadMemoryCount += state.memories.filter((memory) => Number(memory.id) > previousLast).length;
        updateUiBadges();
        playIncomingSound();
      }
      if (maxId) {
        state.lastSeenMemoryId = maxId;
      }
      LocalDB.clear('memories').then(() => LocalDB.putAll('memories', state.memories)).catch(() => {});
      renderMemories();
      updateLovePanel();
    } catch (error) {
      toast(error.message);
    } finally {
      scheduleMemoryPoll();
    }
  }

  function scheduleMemoryPoll() {
    if (state.memoryPollTimer) {
      clearTimeout(state.memoryPollTimer);
    }
    if (!state.user) {
      return;
    }
    state.memoryPollTimer = setTimeout(() => loadMemories(false), document.hidden ? 18000 : 7000);
  }

  function renderMemories() {
    if (!state.memories.length) {
      els.memoryList.innerHTML = '<div class="empty-state">خاطره‌های مهم اینجا می‌مانند.</div>';
      return;
    }

    els.memoryList.innerHTML = state.memories.map((memory) => {
      const isLocked = Number(memory.locked || 0) === 1;
      const canReadLocked = !isLocked || Number(memory.unlocked || 0) === 1;
      const lockedBadge = isLocked ? `<span class="memory-lock-badge">${canReadLocked ? 'قفل باز شده' : 'قفل خصوصی'}</span>` : '';
      const image = canReadLocked && memory.image && memory.image.url
        ? `<a class="memory-image" href="${escapeHtml(memory.image.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(memory.image.url)}" alt="${escapeHtml(memory.image.name || memory.title || 'عکس خاطره')}" loading="lazy" decoding="async"></a>`
        : '';
      const note = !canReadLocked
        ? '<div class="memory-private-cover"><span aria-hidden="true"></span><strong>خاطره خصوصی</strong><p>متن و تصویر این خاطره پشت قفل خصوصی محفوظ مانده.</p></div>'
        : (memory.note ? `<p>${escapeHtml(memory.note)}</p>` : '');
      return `
      <article class="memory-card ${isLocked && !canReadLocked ? 'is-private-locked' : ''}" data-memory-card="${Number(memory.id)}">
        <header>
          <div>
            <strong>${escapeHtml(memory.emoji || '❤')} ${escapeHtml(memory.title)}</strong>
            ${memory.memory_date ? `<time>${formatDate(memory.memory_date)}</time>` : ''}
            ${lockedBadge}
          </div>
          <div class="memory-actions">
            ${isLocked && !canReadLocked ? '<button class="memory-unlock" type="button" data-memory-unlock="' + memory.id + '" title="باز کردن قفل">باز کردن</button>' : ''}
            <button class="memory-edit" type="button" data-memory-edit="${memory.id}" title="ویرایش" ${isLocked && !canReadLocked ? 'disabled aria-disabled="true"' : ''}>ویرایش</button>
            <button class="memory-delete" type="button" data-memory-id="${memory.id}" title="حذف">×</button>
          </div>
        </header>
        ${image}
        ${note}
      </article>
    `;
    }).join('');
  }

  async function saveMemory(event) {
    event.preventDefault();
    try {
      let attachmentId = state.pendingMemoryAttachmentId;
      if (state.pendingMemoryImageFile) {
        const uploaded = await uploadFile(state.pendingMemoryImageFile);
        attachmentId = uploaded.id;
      }
      const editing = Number(state.editingMemoryId || 0);
      await api('memories.php', {
        method: 'POST',
        body: {
          action: editing ? 'update' : 'create',
          id: editing || undefined,
          title: els.memoryTitle.value,
          note: els.memoryNote.value,
          memory_date: jalaliInputToIso(els.memoryDate.value),
          emoji: els.memoryEmoji.value || '❤',
          attachment_id: attachmentId,
          locked: els.memoryLocked && els.memoryLocked.checked ? 1 : 0
        }
      });
      resetMemoryForm();
      await loadMemories();
      toast(editing ? 'خاطره ویرایش شد.' : 'خاطره ثبت شد.');
    } catch (error) {
      toast(error.message);
    }
  }

  async function deleteMemory(event) {
    const unlockButton = event.target.closest('[data-memory-unlock]');
    if (unlockButton) {
      unlockMemory(Number(unlockButton.dataset.memoryUnlock));
      return;
    }
    const editButton = event.target.closest('[data-memory-edit]');
    if (editButton) {
      if (editButton.disabled || editButton.getAttribute('aria-disabled') === 'true') {
        toast('اول قفل خاطره را باز کن.');
        return;
      }
      editMemory(Number(editButton.dataset.memoryEdit));
      return;
    }
    const button = event.target.closest('[data-memory-id]');
    if (!button) {
      return;
    }
    try {
      await api('memories.php', {
        method: 'POST',
        body: {
          action: 'delete',
          id: Number(button.dataset.memoryId)
        }
      });
      await loadMemories();
    } catch (error) {
      toast(error.message);
    }
  }

  async function unlockMemory(memoryId) {
    let password = null;
    // تلاش برای باز کردن با اثر انگشت / تشخیص چهره
    if (await window.BiometricAuth.isAvailable() && await LocalDB.get('settings', 'bio_enabled')) {
        const data = await window.BiometricAuth.verify(state.user?.slug || state.selectedLogin);
        if (data) {
          try {
            state.csrf = data.csrf || state.csrf;
            await api('memories.php', {
              method: 'POST',
              body: { action: 'unlock_biometric', id: Number(memoryId) }
            });
            await loadMemories(false);
            toast('قفل خاطره باز شد.');
            return;
          } catch (error) {
            toast(error.message);
          }
        }
    }

    if (!password) {
      password = await openBottomSheet({
        title: 'باز کردن قفل خاطره',
        description: 'برای مشاهده این خاطره خصوصی، رمز ورود خود را وارد کنید:',
        inputType: 'password',
        confirmText: 'باز کردن'
      });
    }
    
    if (!password) return;

    try {
      await api('memories.php', {
        method: 'POST',
        body: { action: 'unlock', id: Number(memoryId), password }
      });
      await loadMemories(false);
      toast('قفل خاطره باز شد.');
    } catch (error) {
      toast(error.message);
    }
  }

  function editMemory(memoryId) {
    const memory = state.memories.find((item) => Number(item.id) === Number(memoryId));
    if (!memory) {
      return;
    }
    if (Number(memory.locked || 0) === 1 && Number(memory.unlocked || 0) !== 1) {
      toast('اول قفل خاطره را باز کن.');
      return;
    }
    state.editingMemoryId = Number(memory.id);
    state.pendingMemoryImageFile = null;
    state.pendingMemoryAttachmentId = memory.image ? Number(memory.image.id) : null;
    els.memoryEmoji.value = memory.emoji || '❤';
    els.memoryTitle.value = memory.title || '';
    els.memoryDate.value = isoToJalaliInput(memory.memory_date || '');
    els.memoryNote.value = memory.note || '';
    if (els.memoryLocked) { els.memoryLocked.checked = Number(memory.locked || 0) === 1; }
    renderMemoryImagePill(memory.image ? memory.image.name || 'عکس خاطره' : '');
    els.cancelMemoryEditButton.hidden = false;
    els.memoryForm.querySelector('.primary-button').textContent = 'ذخیره ویرایش';
    els.memoryTitle.focus({ preventScroll: true });
  }

  function resetMemoryForm() {
    els.memoryForm.reset();
    els.memoryEmoji.value = '❤';
    if (els.memoryLocked) { els.memoryLocked.checked = false; }
    state.editingMemoryId = null;
    clearMemoryImage();
    els.cancelMemoryEditButton.hidden = true;
    els.memoryForm.querySelector('.primary-button').textContent = 'ثبت خاطره';
  }

  // فعال‌سازی دستی بیومتریک از تنظیمات
  async function promptBiometricRegistration() {
      const wantBio = await openBottomSheet({
          title: 'فعال‌سازی اثر انگشت',
          description: 'آیا می‌خواهید از این به بعد با اثر انگشت/FaceID وارد شوید و قفل خاطرات را باز کنید؟',
          confirmText: 'بله، فعال کن'
      });
      if (wantBio) {
          const success = await window.BiometricAuth.register();
          if (success) {
              if (window.haptics) window.haptics.success();
              toast('ورود بیومتریک فعال شد.');
          } else {
              toast('ثبت بیومتریک لغو شد یا ناموفق بود.');
          }
      }
  }

  function onMemoryImagePicked() {
    const file = els.memoryImageInput.files && els.memoryImageInput.files[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast('برای خاطره فقط عکس انتخاب کن.');
      els.memoryImageInput.value = '';
      return;
    }
    state.pendingMemoryImageFile = file;
    state.pendingMemoryAttachmentId = null;
    renderMemoryImagePill(`${file.name} · ${formatBytes(file.size)}`);
      
      if (window.dynamicThemer) window.dynamicThemer.applyFromImage(file);
  }

  function renderMemoryImagePill(label) {
    if (!els.memoryImagePill) {
      return;
    }
    if (!label) {
      els.memoryImagePill.hidden = true;
      els.memoryImagePill.textContent = '';
      return;
    }
    els.memoryImagePill.hidden = false;
    els.memoryImagePill.innerHTML = `<span>${escapeHtml(label)}</span><button type="button" data-clear-memory-image aria-label="حذف عکس">×</button>`;
  }

  function clearMemoryImage() {
    state.pendingMemoryImageFile = null;
    state.pendingMemoryAttachmentId = null;
    if (els.memoryImageInput) {
      els.memoryImageInput.value = '';
    }
    renderMemoryImagePill('');
      if (window.dynamicThemer) window.dynamicThemer.reset();
  }

  async function saveSettings(event) {
    event.preventDefault();
    try {
      const data = await api('settings.php', {
        method: 'POST',
        body: {
          couple_since: jalaliInputToIso(els.coupleSinceInput.value),
          daily_phrase: els.dailyPhraseInput.value,
          notification_mode: els.notificationModeInput ? els.notificationModeInput.value : (els.notificationPreviewInput.checked ? 'preview' : 'sender'),
          notification_preview: els.notificationModeInput ? els.notificationModeInput.value === 'preview' : els.notificationPreviewInput.checked
        }
      });
      state.settings = data.settings || state.settings;
      hydrateProfile();
      hydrateSettings();
      toast('تنظیمات ذخیره شد.');
    } catch (error) {
      toast(error.message);
    }
  }

  async function uploadAvatar() {
    const file = els.avatarInput.files && els.avatarInput.files[0];
    if (!file) {
      return;
    }
    const form = new FormData();
    form.append('action', 'avatar');
    form.append('avatar', file, file.name || 'avatar.jpg');

    try {
      const data = await api('profile.php', {
        method: 'POST',
        body: form
      });
      state.user.avatar_path = data.avatar_path;
      hydrateProfile();
      toast('عکس پروفایل ذخیره شد.');
    } catch (error) {
      toast(error.message);
    } finally {
      els.avatarInput.value = '';
    }
  }

  async function ensureDeviceForSettings() {
    const device = getDeviceCredentials();
    if (device.device_id && device.device_token) {
      return device;
    }
    const data = await api('auth.php', {
      method: 'POST',
      body: {
        action: 'ensure_device',
        device_name: deviceName()
      }
    });
    if (data.device) {
      saveDeviceCredentials(data.device, state.user.slug);
      return getDeviceCredentials();
    }
    throw new Error('ثبت این دستگاه ناموفق بود.');
  }

  async function savePin(event) {
    event.preventDefault();
    const pin = els.pinInput.value.trim();
    if (!/^\d{4,8}$/.test(pin)) {
      toast('PIN باید ۴ تا ۸ رقم باشد.');
      return;
    }
    try {
      const device = await ensureDeviceForSettings();
      await api('auth.php', {
        method: 'POST',
        body: {
          action: 'set_pin',
          device_id: device.device_id,
          pin
        }
      });
      els.pinInput.value = '';
      toast('PIN این دستگاه ثبت شد.');
    } catch (error) {
      toast(error.message);
    }
  }

  async function clearPin() {
    const device = getDeviceCredentials();
    if (!device.device_id) {
      toast('برای این دستگاه PIN ثبت نشده است.');
      return;
    }
    try {
      await api('auth.php', {
        method: 'POST',
        body: {
          action: 'clear_pin',
          device_id: device.device_id
        }
      });
      toast('PIN حذف شد.');
    } catch (error) {
      toast(error.message);
    }
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      return;
    }
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (error) {
      toast('ثبت سرویس‌ورکر ناموفق بود.');
    }
  }

  async function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      toast('Web Push روی این مرورگر فعال نیست.');
      updateNotificationStatus();
      return;
    }

    if (!state.app.vapid_public_key) {
      toast('کلید نوتیفیکیشن تنظیم نشده است.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast('اجازه نوتیفیکیشن داده نشد.');
        updateNotificationStatus();
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(state.app.vapid_public_key)
        });
      }

      await api('push.php', {
        method: 'POST',
        body: {
          action: 'subscribe',
          subscription: subscription.toJSON()
        }
      });
      updateNotificationStatus();
      renderInstallChecklist();
      toast('نوتیفیکیشن فعال شد.');
    } catch (error) {
      toast(error.message || 'فعال‌سازی نوتیفیکیشن ناموفق بود.');
    }
  }

  async function testPush() {
    try {
      await api('push.php', {
        method: 'POST',
        body: { action: 'test' }
      });
      toast('تست ارسال شد.');
    } catch (error) {
      toast(error.message);
    }
  }

  function updateNotificationStatus() {
    if (!('Notification' in window)) {
      els.notificationStatus.textContent = 'نوتیفیکیشن پشتیبانی نمی‌شود';
      return;
    }
    const permission = Notification.permission;
    els.notificationStatus.textContent = permission === 'granted'
      ? 'نوتیفیکیشن فعال'
      : permission === 'denied'
        ? 'نوتیفیکیشن مسدود'
        : 'نوتیفیکیشن آماده';
  }

  function updateInstallState() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    els.installButton.hidden = standalone || !state.installPrompt;
    els.installStatus.textContent = standalone ? 'نصب شده' : (state.installPrompt ? 'آماده نصب' : 'قابل اجرا در مرورگر');
  }

  async function promptInstall() {
    if (!state.installPrompt) {
      toast('نصب از منوی مرورگر انجام می‌شود.');
      return;
    }

    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    updateInstallState();
  }


  function bindViewportFixes() {
    syncViewportSize();
    window.addEventListener('resize', syncViewportSize, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(syncViewportSize, 250), { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncViewportSize, { passive: true });
      window.visualViewport.addEventListener('scroll', syncViewportSize, { passive: true });
    }
  }

  function syncViewportSize() {
    const viewport = window.visualViewport;
    const height = viewport ? viewport.height : window.innerHeight;
    const keyboardInset = viewport
      ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      : 0;
    document.documentElement.style.setProperty('--app-height', `${Math.round(height)}px`);
    document.documentElement.style.setProperty('--keyboard-inset', `${Math.round(keyboardInset)}px`);
    document.body.classList.toggle('keyboard-open', keyboardInset > 90);
    if (document.activeElement === els.messageInput) {
      keepComposerVisible(false);
    }
  }

  function onComposerFocus() {
    document.body.classList.add('composer-focused');
    syncViewportSize();
    setTimeout(() => keepComposerVisible(true), 80);
  }

  function onComposerBlur() {
    document.body.classList.remove('composer-focused');
    setTimeout(syncViewportSize, 80);
  }

  function keepComposerVisible(smooth = false) {
    if (!els.composer || !isChatActive()) {
      return;
    }
    const rect = els.composer.getBoundingClientRect();
    const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const safeBottom = viewportHeight - 8;
    if (rect.bottom > safeBottom) {
      els.composer.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
    }
  }

  function normalizeComposerText(value) {
    return String(value || '').replace(/\r\n?/g, '\n');
  }

  function schedulePoll(delay) {
    if (!state.sseConnection || state.sseConnection.readyState === EventSource.CLOSED) {
        setupSSE();
    }
  }

  function stopPolling() {
    if (state.sseConnection) {
      state.sseConnection.close();
      state.sseConnection = null;
    }
  }

  // ========== Server-Sent Events (SSE) Engine ==========
  function setupSSE() {
    if (state.sseConnection) {
        state.sseConnection.close();
    }
    if (!state.user || !window.EventSource || state.searchActive) {
        return;
    }

    state.sseConnection = new EventSource(`${apiBase}stream.php?last_id=${state.lastId}`);

    state.sseConnection.addEventListener('update', () => {
        loadMessages(true);
    });

    state.sseConnection.addEventListener('typing', (e) => {
        try {
            const data = JSON.parse(e.data);
            renderTypingState(data.typing);
        } catch(err) {}
    });

    state.sseConnection.onerror = () => {
        state.sseConnection.close();
        if (navigator.onLine && !document.hidden) {
            setTimeout(setupSSE, 3000);
        }
    };
  }

  function isChatActive() {
    return $('#chatTab').classList.contains('is-active');
  }

  function isNearBottom(element) {
    return element.scrollHeight - element.scrollTop - element.clientHeight < 160;
  }

  function scrollToBottom(behavior = 'smooth') {
    const top = els.messages.scrollHeight;
    if (behavior === 'smooth' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.messages.scrollTo({ top, behavior: 'smooth' });
      return;
    }
    els.messages.scrollTop = top;
  }

  function focusComposer() {
    requestAnimationFrame(() => {
      els.messageInput.focus({ preventScroll: true });
      keepComposerVisible(true);
    });
  }

  function onMessagesScroll() {
    updateScrollButton();
    if (state.messages.size >= 50 && els.messages.scrollTop < 80 && !isNearBottom(els.messages)) {
      loadOlderMessages();
    }
  }

  function updateScrollButton() {
    if (!els.scrollBottomButton) {
      return;
    }
    els.scrollBottomButton.hidden = isNearBottom(els.messages);
  }

  function statusLabel(status) {
    if (status === 'queued') {
      return '◌';
    }
    if (status === 'sending') {
      return '…';
    }
    if (status === 'read') {
      return '✓✓';
    }
    if (status === 'delivered') {
      return '✓✓';
    }
    return '✓';
  }

  function updateBadge(messages) {
    if (!('setAppBadge' in navigator) || !state.user) {
      return;
    }
    if (!document.hidden) {
      state.unreadBadge = 0;
    }
    if (document.hidden && state.unreadBadge > 0) {
      navigator.setAppBadge(state.unreadBadge).catch(() => {});
    } else if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  }

  function unlockIncomingSound() {
    state.soundUnlocked = true;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass && !state.incomingAudioContext) {
        state.incomingAudioContext = new AudioContextClass();
      }
      if (state.incomingAudioContext && state.incomingAudioContext.state === 'suspended') {
        state.incomingAudioContext.resume().catch(() => {});
      }
    } catch (error) {
      // Sound is best-effort.
    }
  }

  function playIncomingSound() {
    if (!state.soundUnlocked) {
      return;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = state.incomingAudioContext || (AudioContextClass ? new AudioContextClass() : null);
      if (!ctx) {
        return;
      }
      state.incomingAudioContext = ctx;
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.055, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      gain.connect(ctx.destination);
      [660, 880].forEach((frequency, index) => {
        const oscillator = ctx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, now + index * 0.09);
        oscillator.connect(gain);
        oscillator.start(now + index * 0.09);
        oscillator.stop(now + 0.36 + index * 0.06);
      });
    } catch (error) {
      // Ignore browser autoplay or audio errors.
    }
  }

  function toggleTheme() {
    const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    document.body.dataset.theme = next;
    localStorage.setItem('soulmate-theme', next);
  }

  function applySavedTheme() {
    const saved = localStorage.getItem('soulmate-theme') || localStorage.getItem('mobina-theme');
    if (saved === 'dark' || saved === 'light') {
      document.body.dataset.theme = saved;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.body.dataset.theme = 'dark';
    }
    
    // Listen for system theme changes if user hasn't forced a theme
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
      if (!localStorage.getItem('soulmate-theme')) {
        document.body.dataset.theme = event.matches ? 'dark' : 'light';
      }
    });
  }

  function createClientId() {
    if (crypto.randomUUID) {
      return crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function getDeviceCredentials() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DEVICE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveDeviceCredentials(device, slug) {
    if (!device || !device.device_id || !device.device_token) {
      return;
    }
    localStorage.setItem(DEVICE_KEY, JSON.stringify({
      device_id: device.device_id,
      device_token: device.device_token,
      slug: slug || '',
      saved_at: Date.now()
    }));
  }

  function deviceName() {
    const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || 'Device';
    return `${platform} · ${new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date())}`;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTime(value) {
    const date = parseServerDate(value);
    if (!date) {
      return '—';
    }
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch (error) {
      return '—';
    }
  }

  function formatDate(value) {
    const date = parseServerDate(value, true);
    if (!date) {
      return '—';
    }
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }).format(date);
    } catch (error) {
      return '—';
    }
  }

  function isoToJalaliInput(value) {
    if (!value) {
      return '';
    }
    const parts = String(value).slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
      return '';
    }
    const [jy, jm, jd] = gregorianToJalali(parts[0], parts[1], parts[2]);
    return `${toPersianNumber(jy)}/${toPersianNumber(String(jm).padStart(2, '0'))}/${toPersianNumber(String(jd).padStart(2, '0'))}`;
  }

  function jalaliInputToIso(value) {
    const normalized = normalizeDigits(value).trim();
    if (!normalized) {
      return '';
    }
    const match = normalized.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (!match) {
      throw new Error('تاریخ شمسی را مثل ۱۴۰۳/۰۲/۰۶ وارد کن.');
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year >= 1900) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      throw new Error('تاریخ شمسی معتبر نیست.');
    }
    const [gy, gm, gd] = jalaliToGregorian(year, month, day);
    const [checkY, checkM, checkD] = gregorianToJalali(gy, gm, gd);
    if (checkY !== year || checkM !== month || checkD !== day) {
      throw new Error('تاریخ شمسی معتبر نیست.');
    }
    return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
  }



  async function loadLoveItems(markSeen = true) {
    if (!state.user) {
      return;
    }
    try {
      const data = await api('love.php');
      state.loveItems = Array.isArray(data.items) ? data.items : [];
      LocalDB.clear('loveItems').then(() => LocalDB.putAll('loveItems', state.loveItems)).catch(() => {});
      renderLoveItems();
      updateLovePanel();
    } catch (error) {
      // Love tab must never break the messenger. Keep this as a toast only.
      toast(error.message || 'بارگذاری بخش عشقمون ناموفق بود.');
    }
  }

  function renderLoveItems() {
    const items = Array.isArray(state.loveItems) ? state.loveItems : [];
    const photos = items.filter((item) => item.type === 'photo');
    const moods = items.filter((item) => item.type === 'mood');
    const events = items.filter((item) => item.type === 'event');
    const promises = items.filter((item) => item.type === 'promise');

    if (els.albumTimeline) {
      els.albumTimeline.innerHTML = photos.length ? photos.map((item) => {
        const img = item.attachment && item.attachment.url
          ? `<img src="${escapeHtml(item.attachment.url)}" alt="${escapeHtml(item.title || 'عکس دونفره')}" loading="lazy" decoding="async">`
          : '<div class="album-placeholder">عکس</div>';
        return `<article class="album-item">
          <a href="${escapeHtml(item.attachment?.url || '#')}" target="_blank" rel="noopener">${img}</a>
          <div><strong>${escapeHtml(item.note || item.title || 'عکس دونفره')}</strong><small>${formatTime(item.created_at)} · ${escapeHtml(item.creator_name || '')}</small></div>
        </article>`;
      }).join('') : '<div class="empty-state compact">هنوز عکسی در آلبوم نیست.</div>';
    }

    if (els.moodList) {
      els.moodList.innerHTML = moods.length ? moods.slice(0, 10).map((item) => {
        const mood = item.data && item.data.mood ? item.data.mood : (item.title || '❤');
        const date = item.event_date ? formatDate(item.event_date) : formatTime(item.created_at);
        return `<div class="mood-row"><span>${escapeHtml(mood)}</span><strong>${escapeHtml(item.creator_name || '')}</strong><small>${date}</small></div>`;
      }).join('') : '<div class="empty-state compact">مود امروز را انتخاب کن.</div>';
    }

    if (els.eventList) {
      const sortedEvents = events.slice().sort((a, b) => String(a.event_date || '').localeCompare(String(b.event_date || '')) || Number(b.id) - Number(a.id));
      els.eventList.innerHTML = sortedEvents.length ? sortedEvents.map((item) => {
        const date = item.event_date ? formatDate(item.event_date) : 'بدون تاریخ';
        return `<div class="event-row"><div><strong>${escapeHtml(item.title || 'مناسبت')}</strong><small>${escapeHtml(item.note || '')}</small></div><time>${date}</time></div>`;
      }).join('') : '<div class="empty-state compact">هنوز مناسبتی ثبت نشده.</div>';
    }

    if (els.promiseList) {
      els.promiseList.innerHTML = promises.length ? promises.map((item) => {
        const done = Boolean(item.data && item.data.done);
        return `<button class="promise-row ${done ? 'is-done' : ''}" type="button" data-promise-id="${Number(item.id)}">
          <span>${done ? '✓' : '○'}</span><strong>${escapeHtml(item.title || item.note || 'قول عاشقانه')}</strong>
        </button>`;
      }).join('') : '<div class="empty-state compact">اولین قول قشنگ را ثبت کن.</div>';
    }
  }

  function currentCoupleDays() {
    const start = String(state.settings?.couple_since || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      return 0;
    }
    const startDate = new Date(`${start}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!Number.isFinite(startDate.getTime())) {
      return 0;
    }
    const diff = Math.floor((today.getTime() - startDate.getTime()) / 86400000) + 1;
    return Math.max(0, diff);
  }

  function updateLovePanel() {
    try {
    const days = currentCoupleDays();
    if (els.daysTogether) {
      els.daysTogether.textContent = toPersianNumber(days || 0);
    }
    if (els.loveDaysBig) {
      els.loveDaysBig.textContent = toPersianNumber(days || 0);
    }
    if (els.loveDailyNote) {
      els.loveDailyNote.textContent = state.settings?.daily_phrase || 'هنوز یادداشت روز ثبت نشده.';
    }
    if (els.loveTodayDate) {
      els.loveTodayDate.textContent = formatDate(new Date().toISOString());
    }
    if (els.loveTogetherLine) {
      els.loveTogetherLine.textContent = days ? `${toPersianNumber(days)} روز از شروع قصه‌مون گذشته.` : 'تاریخ شروع را در تنظیمات ثبت کن.';
    }
    const latestMemory = (state.memories || [])[0];
    if (els.loveLastMemoryTitle) {
      els.loveLastMemoryTitle.textContent = latestMemory ? `${latestMemory.emoji || '❤'} ${latestMemory.title || 'خاطره'}` : '—';
    }
    if (els.loveLastMemoryDate) {
      els.loveLastMemoryDate.textContent = latestMemory && latestMemory.memory_date ? formatDate(latestMemory.memory_date) : 'خاطره‌ای ثبت نشده.';
    }
    if (els.loveSuggestion) {
      const dayIndex = Math.floor(Date.now() / 86400000) % lovePrompts.length;
      els.loveSuggestion.textContent = lovePrompts[dayIndex] || 'یک پیام کوتاه بفرست و فقط بگو: همین الان بهت فکر کردم.';
    }
    if (els.missYouText) {
      const partnerMessages = Array.from(state.messages.values())
        .filter((message) => state.partner && Number(message.sender_id) === Number(state.partner.id))
        .sort((a, b) => Number(b.id) - Number(a.id));
      if (!partnerMessages.length) {
        els.missYouText.textContent = 'هنوز پیامی از عشقت در این دستگاه نیست.';
      } else {
        const last = parseServerDate(partnerMessages[0].created_at);
        const minutes = Math.max(0, Math.floor((Date.now() - last.getTime()) / 60000));
        if (minutes < 1) {
          els.missYouText.textContent = 'همین الان پیام داده ❤';
        } else if (minutes < 60) {
          els.missYouText.textContent = `${toPersianNumber(minutes)} دقیقه`;
        } else if (minutes < 1440) {
          els.missYouText.textContent = `${toPersianNumber(Math.floor(minutes / 60))} ساعت`;
        } else {
          els.missYouText.textContent = `${toPersianNumber(Math.floor(minutes / 1440))} روز`;
        }
      }
    }
    } catch (error) {
      console.warn('SoulMate love panel skipped:', error);
    }
  }

  async function sendLovePreset(text) {
    const message = String(text || '').trim();
    if (!message) {
      return;
    }
    setComposerMode('love');
    els.messageInput.value = message;
    autoSizeTextarea();
    await onSendMessage({ preventDefault() {} });
  }

  async function runLoveTool(tool) {
    const key = String(tool || '');
    let text = '';
    if (key === 'surprise') {
      text = randomItem(loveSurprises);
    } else if (key === 'prompt') {
      text = randomItem(lovePrompts);
    } else if (key === 'day') {
      const days = currentCoupleDays();
      text = days ? `امروز ${toPersianNumber(days)} روزه که قصه‌مون شروع شده ❤` : 'امروز هم یه صفحه قشنگ برای ماست ❤';
    } else {
      const toolboxKey = {
        compliment: 'compliments',
        date: 'dates',
        challenge: 'challenges',
        memory: 'memories',
        promise: 'promises',
        poem: 'poems'
      }[key] || key;
      const bucket = loveToolbox[toolboxKey] || [];
      text = randomItem(Array.isArray(bucket) ? bucket : []);
    }
    if (!text) {
      text = randomItem(loveSurprises);
    }
    els.messageInput.value = text;
    setComposerMode(key === 'poem' ? 'letter' : 'love');
    autoSizeTextarea();
    closeComposerTools();
    focusComposer();
  }

  async function sendTimedLoveMessage(event) {
    event.preventDefault();
    const body = String(els.timedMessageText?.value || '').trim();
    const openAt = localDateTimeToUtc(els.timedMessageOpenAt?.value || '');
    if (!body) {
      toast('متن پیام زمان‌دار را بنویس.');
      return;
    }
    if (!openAt) {
      toast('زمان باز شدن پیام را انتخاب کن.');
      return;
    }
    try {
        const payloadBody = await window.E2EEManager.encrypt(body);
      const data = await api('messages.php', {
        method: 'POST',
        body: {
          client_id: createClientId(),
            body: payloadBody,
          kind: 'timed',
          attachment_id: null,
          reply_to_id: null,
          open_at: openAt
        }
      });
      if (data.message) {
          await decryptMessageObj(data.message);
        mergeMessages([data.message]);
        state.forceScrollBottom = true;
        renderMessages();
      }
      els.timedMessageForm?.reset();
      showTab('chat', false);
      scrollToBottom('smooth');
      createHeartBurst('heart');
      schedulePoll(350);
      toast('پیام زمان‌دار ارسال شد.');
    } catch (error) {
      toast(error.message);
    }
  }

  async function saveAlbumPhoto(event) {
    event.preventDefault();
    const file = els.albumFileInput?.files?.[0];
    if (!file) {
      toast('یک عکس برای آلبوم انتخاب کن.');
      return;
    }
    if (!String(file.type || '').startsWith('image/')) {
      toast('برای آلبوم فقط عکس مجاز است.');
      return;
    }
    try {
      const uploaded = await uploadFile(file);
      await api('love.php', {
        method: 'POST',
        body: {
          type: 'photo',
          title: 'عکس دونفره',
          note: els.albumCaptionInput?.value || '',
          attachment_id: uploaded.id,
          data: {}
        }
      });
      els.albumForm?.reset();
      await loadLoveItems(false);
      toast('عکس به آلبوم اضافه شد.');
    } catch (error) {
      toast(error.message);
    }
  }

  async function saveMood(event) {
    const button = event.target.closest('[data-mood]');
    if (!button) {
      return;
    }
    const mood = button.dataset.mood || '❤';
    try {
      await api('love.php', {
        method: 'POST',
        body: {
          type: 'mood',
          title: mood,
          note: 'مود امروز',
          event_date: new Date().toISOString().slice(0, 10),
          data: { mood }
        }
      });
      await loadLoveItems(false);
      toast('مود امروز ثبت شد.');
    } catch (error) {
      toast(error.message);
    }
  }

  async function sendSticker(event) {
    const button = event.target.closest('[data-sticker]');
    if (!button) {
      return;
    }
    const sticker = button.dataset.sticker || button.textContent.trim();
    if (!sticker) {
      return;
    }
    try {
        const payloadBody = await window.E2EEManager.encrypt(sticker);
      const data = await api('messages.php', {
        method: 'POST',
        body: {
          client_id: createClientId(),
            body: payloadBody,
          kind: 'sticker',
          attachment_id: null,
          reply_to_id: null,
          open_at: null
        }
      });
      if (data.message) {
          await decryptMessageObj(data.message);
        mergeMessages([data.message]);
        state.forceScrollBottom = true;
        renderMessages();
        scrollToBottom('smooth');
        createHeartBurst('heart');
      }
      showTab('chat', false);
      schedulePoll(350);
    } catch (error) {
      toast(error.message);
    }
  }

  async function saveLoveEvent(event) {
    event.preventDefault();
    const title = String(els.eventTitleInput?.value || '').trim();
    const eventDate = String(els.eventDateInput?.value || '').trim();
    if (!title || !eventDate) {
      toast('عنوان و تاریخ مناسبت را وارد کن.');
      return;
    }
    try {
      await api('love.php', {
        method: 'POST',
        body: { type: 'event', title, event_date: eventDate, data: {} }
      });
      els.eventForm?.reset();
      await loadLoveItems(false);
      toast('مناسبت ثبت شد.');
    } catch (error) {
      toast(error.message);
    }
  }

  async function savePromise(event) {
    event.preventDefault();
    const text = String(els.promiseTextInput?.value || '').trim();
    if (!text) {
      toast('متن قول را بنویس.');
      return;
    }
    try {
      await api('love.php', {
        method: 'POST',
        body: { type: 'promise', title: text, note: '', data: { done: false } }
      });
      els.promiseForm?.reset();
      await loadLoveItems(false);
      toast('قول ثبت شد.');
    } catch (error) {
      toast(error.message);
    }
  }

  async function togglePromise(event) {
    const button = event.target.closest('[data-promise-id]');
    if (!button) {
      return;
    }
    const id = Number(button.dataset.promiseId);
    const item = (state.loveItems || []).find((entry) => Number(entry.id) === id);
    if (!item) {
      return;
    }
    const data = Object.assign({}, item.data || {}, { done: !(item.data && item.data.done) });
    try {
      await api('love.php', {
        method: 'POST',
        body: {
          action: 'update',
          id,
          type: 'promise',
          title: item.title || item.note || 'قول عاشقانه',
          note: item.note || '',
          event_date: item.event_date || '',
          data
        }
      });
      await loadLoveItems(false);
    } catch (error) {
      toast(error.message);
    }
  }

  async function advancedSearch(event) {
    event.preventDefault();
    const query = String(els.advancedSearchInput?.value || '').trim().toLowerCase();
    if (!query) {
      if (els.advancedSearchResults) {
        els.advancedSearchResults.innerHTML = '<div class="empty-state compact">عبارت جستجو را وارد کن.</div>';
      }
      return;
    }
    if (els.advancedSearchResults) {
      els.advancedSearchResults.innerHTML = '<div class="empty-state compact">در حال جستجو...</div>';
    }
    try {
      const data = await api(`search.php?q=${encodeURIComponent(query)}`);
      let results = Array.isArray(data.results) ? data.results : [];
      
      // حذف پیام‌های رمزنگاری‌شده بازگشتی از سرور
      results = results.filter(item => !(item.type === 'message' && String(item.text).startsWith('E2EE:')));
      
      // اضافه‌کردن جستجوی لوکال از IndexedDB برای کشف پیام‌های E2EE
      const localMsgs = await LocalDB.getAll('messages');
      for (const msg of localMsgs) {
          let body = msg.body || '';
          if (body.startsWith('E2EE:') && window.E2EEManager) {
              body = await window.E2EEManager.decrypt(body);
          }
          const attachmentName = msg.attachment ? (msg.attachment.name || '') : '';
          if (body.toLowerCase().includes(query) || attachmentName.toLowerCase().includes(query)) {
              results.push({
                  type: 'message',
                  id: Number(msg.id),
                  title: msg.sender_name || 'پیام',
                  text: body || attachmentName,
                  created_at: msg.created_at
              });
          }
      }
      
      // مرتب‌سازی نزولی
      results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (!els.advancedSearchResults) {
        return;
      }
      renderAdvancedSearchResults(results);
    } catch (error) {
      if (els.advancedSearchResults) {
        els.advancedSearchResults.innerHTML = '<div class="empty-state compact">جستجو ناموفق بود.</div>';
      }
      toast(error.message);
    }
  }

  function renderAdvancedSearchResults(results) {
    if (!els.advancedSearchResults) {
      return;
    }
    if (!results.length) {
      els.advancedSearchResults.innerHTML = '<div class="empty-state compact">نتیجه‌ای پیدا نشد.</div>';
      return;
    }

    const counts = results.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {});
    const tabs = [
      ['all', 'همه', results.length],
      ['message', 'پیام‌ها', counts.message || 0],
      ['memory', 'خاطره‌ها', counts.memory || 0],
      ['file', 'فایل‌ها', counts.file || 0],
    ];
    const tabHtml = `<div class="search-result-tabs">${tabs.map(([type, label, count], index) => `
      <button type="button" class="${index === 0 ? 'is-active' : ''}" data-search-filter="${type}">
        <span>${label}</span><b>${toPersianNumber(count)}</b>
      </button>`).join('')}</div>`;

    const rows = results.map((item) => {
      const type = item.type === 'file' ? 'file' : (item.type === 'memory' ? 'memory' : 'message');
      const label = type === 'message' ? 'پیام' : (type === 'memory' ? 'خاطره' : 'فایل');
      const isPrivate = type === 'memory' && Number(item.locked || 0) === 1 && Number(item.unlocked || 0) !== 1;
      if (isPrivate) {
        return `<article class="search-result-row is-private" data-result-type="memory" data-result-id="${Number(item.id)}">
          <span class="private-lock" aria-hidden="true"></span>
          <div>
            <small>خاطره خصوصی</small>
            <strong>${escapeHtml(item.title || 'خاطره قفل‌شده')}</strong>
            <em>برای دیدن متن و تصویر، قفل خصوصی را باز کن.</em>
          </div>
          <button type="button" class="private-unlock-cta" data-memory-unlock="${Number(item.id)}">باز کردن</button>
        </article>`;
      }
      return `<button class="search-result-row" type="button" data-result-type="${escapeHtml(type)}" data-result-id="${Number(item.id)}">
        <span>${label}</span><strong>${escapeHtml(item.title || '')}</strong><small>${escapeHtml(item.text || '')}</small>
      </button>`;
    }).join('');

    els.advancedSearchResults.innerHTML = tabHtml + rows;
  }

  async function onAdvancedSearchResultClick(event) {
    const filter = event.target.closest('[data-search-filter]');
    if (filter) {
      const type = filter.dataset.searchFilter || 'all';
      $$('.search-result-tabs button', els.advancedSearchResults).forEach((button) => {
        button.classList.toggle('is-active', button === filter);
      });
      $$('.search-result-row', els.advancedSearchResults).forEach((row) => {
        row.hidden = type !== 'all' && row.dataset.resultType !== type;
      });
      return;
    }

    const unlock = event.target.closest('[data-memory-unlock]');
    if (unlock) {
      showTab('memories');
      await unlockMemory(Number(unlock.dataset.memoryUnlock));
      return;
    }

    const row = event.target.closest('[data-result-type][data-result-id]');
    if (!row || row.classList.contains('is-private')) {
      return;
    }
    const type = row.dataset.resultType;
    const id = Number(row.dataset.resultId);
    if (type === 'message') {
      showTab('chat');
      setTimeout(() => jumpToMessage(id), 120);
    } else if (type === 'memory') {
      showTab('memories');
      setTimeout(() => {
        const card = els.memoryList.querySelector(`[data-memory-card="${id}"]`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 180);
    } else if (type === 'file') {
      window.open(`api/file.php?id=${id}`, '_blank', 'noopener');
    }
  }

  function defaultOpenAtValue() {
    const date = new Date(Date.now() + 60 * 60 * 1000);
    date.setSeconds(0, 0);
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function localDateTimeToUtc(value) {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return '';
    }
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  function normalizeDigits(value) {
    const persian = '۰۱۲۳۴۵۶۷۸۹';
    const arabic = '٠١٢٣٤٥٦٧٨٩';
    return String(value || '')
      .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
      .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)));
  }

  function gregorianToJalali(gy, gm, gd) {
    const gDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const jDaysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
    gy -= 1600;
    gm -= 1;
    gd -= 1;
    let gDayNo = 365 * gy + Math.floor((gy + 3) / 4) - Math.floor((gy + 99) / 100) + Math.floor((gy + 399) / 400);
    for (let i = 0; i < gm; i += 1) {
      gDayNo += gDaysInMonth[i];
    }
    if (gm > 1 && ((gy + 1600) % 4 === 0 && ((gy + 1600) % 100 !== 0 || (gy + 1600) % 400 === 0))) {
      gDayNo += 1;
    }
    gDayNo += gd;

    let jDayNo = gDayNo - 79;
    const jNp = Math.floor(jDayNo / 12053);
    jDayNo %= 12053;
    let jy = 979 + 33 * jNp + 4 * Math.floor(jDayNo / 1461);
    jDayNo %= 1461;
    if (jDayNo >= 366) {
      jy += Math.floor((jDayNo - 1) / 365);
      jDayNo = (jDayNo - 1) % 365;
    }
    let jm = 0;
    while (jm < 11 && jDayNo >= jDaysInMonth[jm]) {
      jDayNo -= jDaysInMonth[jm];
      jm += 1;
    }
    return [jy, jm + 1, jDayNo + 1];
  }

  function jalaliToGregorian(jy, jm, jd) {
    const gDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const jDaysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
    jy -= 979;
    jm -= 1;
    jd -= 1;
    let jDayNo = 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4);
    for (let i = 0; i < jm; i += 1) {
      jDayNo += jDaysInMonth[i];
    }
    jDayNo += jd;

    let gDayNo = jDayNo + 79;
    let gy = 1600 + 400 * Math.floor(gDayNo / 146097);
    gDayNo %= 146097;
    let leap = true;
    if (gDayNo >= 36525) {
      gDayNo -= 1;
      gy += 100 * Math.floor(gDayNo / 36524);
      gDayNo %= 36524;
      if (gDayNo >= 365) {
        gDayNo += 1;
      } else {
        leap = false;
      }
    }
    gy += 4 * Math.floor(gDayNo / 1461);
    gDayNo %= 1461;
    if (gDayNo >= 366) {
      leap = false;
      gDayNo -= 1;
      gy += Math.floor(gDayNo / 365);
      gDayNo %= 365;
    }
    const months = gDaysInMonth.slice();
    months[1] = leap ? 29 : 28;
    let gm = 0;
    while (gm < 11 && gDayNo >= months[gm]) {
      gDayNo -= months[gm];
      gm += 1;
    }
    return [gy, gm + 1, gDayNo + 1];
  }

  function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${toPersianNumber(String(minutes).padStart(2, '0'))}:${toPersianNumber(String(remaining).padStart(2, '0'))}`;
  }

  function parseServerDate(value, dateOnly = false) {
    if (value instanceof Date) {
      return Number.isFinite(value.getTime()) ? value : null;
    } // Ensure value is a string before trimming
    const raw = String(value ?? '').trim();
    if (!raw) {
      return null;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const d = new Date(`${raw}T00:00:00`);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    let normalized = raw.replace(' ', 'T');
    if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(normalized)) {
      normalized += 'Z';
    }
    let date = new Date(normalized);
    if (!Number.isFinite(date.getTime())) {
      date = new Date(raw);
    }
    if (!Number.isFinite(date.getTime())) {
      return null;
    }
    if (dateOnly) {
      date.setHours(0, 0, 0, 0);
    }
    return date;
  }

  function formatBytes(bytes) {
    if (!bytes) {
      return '۰ B';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = Number(bytes);
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index++;
    }
    return `${toPersianNumber(size.toFixed(index ? 1 : 0))} ${units[index]}`;
  }

  function toPersianNumber(value) {
    return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
  }

  function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)] || '';
  }

  function createHeartBurst(mode = 'heart') {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    // استفاده از موتور قدرتمند Canvas به جای CSS قدیمی
    if (window.particleEngine) {
        const yPos = window.innerHeight - Math.max(100, parseInt(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset')) || 0);
        window.particleEngine.burst(window.innerWidth / 2, yPos, mode);
        if (window.haptics) window.haptics.heartbeat();
        return;
    }

    const layer = document.createElement('div');
    layer.className = 'heart-burst';
    const hearts = mode === 'letter'
      ? ['✉', '❤', '✨', 'Soul']
      : ['❤', '♡', '✨', 'Soul'];
    for (let i = 0; i < 18; i++) {
      const item = document.createElement('span');
      item.textContent = hearts[i % hearts.length];
      item.style.setProperty('--x', `${Math.random() * 220 - 110}px`);
      item.style.setProperty('--y', `${Math.random() * -220 - 50}px`);
      item.style.setProperty('--d', `${Math.random() * 0.5}s`);
      layer.appendChild(item);
    }
    document.body.appendChild(layer);
    if (window.haptics) window.haptics.heartbeat(); // ویبره ضربان قلب
    setTimeout(() => layer.remove(), 1500);
  }

  let toastTimer = null;
  function toast(message) {
    const specificMessages = {
      'network_unavailable': 'مشکل در اتصال به سرور. لطفاً اتصال اینترنت خود را بررسی کنید.',
      'Failed to fetch': 'مشکل در اتصال به سرور. لطفاً اتصال اینترنت خود را بررسی کنید.',
      'Invalid time value': 'تاریخ یا زمان نامعتبر است.',
    };
    clearTimeout(toastTimer);
    const safeMessage = specificMessages[message] || String(message || '');
    els.toast.textContent = safeMessage;
    els.toast.hidden = false;
    toastTimer = setTimeout(() => {
      els.toast.hidden = true;
    }, 3600);
  }

  // New/Modified: openBottomSheet to support checkboxes
  async function openBottomSheet(options) {
    bsEls.overlay.hidden = false;
    bsEls.title.textContent = options.title || '';
    bsEls.desc.textContent = options.description || '';
    bsEls.input.type = options.inputType || 'text';
    bsEls.input.value = options.defaultValue || '';
    bsEls.input.hidden = options.hideInput ?? false;
    bsEls.confirm.textContent = options.confirmText || 'تایید';
    bsEls.confirm.classList.toggle('danger', options.danger ?? false);
    bsEls.cancel.textContent = options.cancelText || 'لغو';
    bsEls.cancel.hidden = options.cancelText === null;

    // Clear previous checkbox if any
    const existingCheckbox = bsEls.body.querySelector('.bottom-sheet-checkbox-wrapper');
    if (existingCheckbox) existingCheckbox.remove();

    if (options.checkbox) {
        const checkboxWrapper = document.createElement('div');
        checkboxWrapper.className = 'bottom-sheet-checkbox-wrapper';
        checkboxWrapper.innerHTML = `<label class="check"><input type="checkbox" id="${options.checkbox.id}">${options.checkbox.label}</label>`;
        bsEls.body.insertBefore(checkboxWrapper, bsEls.confirm);
    }

    return new Promise(resolve => {
        bsEls.confirm.onclick = () => {
            const value = bsEls.input.value;
            const remember = options.checkbox ? $(`#${options.checkbox.id}`).checked : false;
            closeBottomSheet();
            resolve({ value, remember });
        };
        bsEls.cancel.onclick = () => { closeBottomSheet(); resolve(null); };
        bsEls.overlay.onclick = (e) => { if (e.target === bsEls.overlay) { closeBottomSheet(); resolve(null); } };
        if (!bsEls.input.hidden) setTimeout(() => bsEls.input.focus(), 100);
    });
  }

  function closeBottomSheet() {
    bsEls.overlay.hidden = true;
    bsEls.input.value = '';
    bsEls.input.hidden = false;
    bsEls.confirm.classList.remove('danger');
    const checkboxWrapper = bsEls.body.querySelector('.bottom-sheet-checkbox-wrapper');
    if (checkboxWrapper) checkboxWrapper.remove();
  }

  window.SoulMateApp = {
    api,
    logout,
    toast,
    reloadRecentMessages,
    biometricLogin: async () => {
        const data = await window.BiometricAuth.verify(state.selectedLogin);
        if (data && data.user) {
            window.SoulMateApp.state.user = data.user;
            window.SoulMateApp.state.partner = data.partner;
            window.SoulMateApp.state.csrf = data.csrf || window.SoulMateApp.state.csrf;
            await window.SoulMateApp.loadSession();
        } else {
            toast('احراز هویت لغو شد.');
        }
    },
    setupE2EE: async () => {
        const pwd = await openBottomSheet({
            title: 'رمزنگاری سرتاسری (E2EE)',
            description: 'کلید مشترک را وارد کن تا فقط برای همین نشست باز شود. کلید دیگر در localStorage ذخیره نمی‌شود.',
            inputType: 'password',
            confirmText: 'باز کردن کلید'
        });
        if (pwd && pwd.value !== null) { // Check pwd.value for actual password
            await window.E2EEManager.setup(pwd);
            toast(pwd ? 'کلید E2EE برای این نشست باز شد.' : 'رمزنگاری سرتاسری غیرفعال شد.');
            state.messages.clear(); await loadMessages(false);
        }
    },
    promptBiometricRegistration,
    getCsrf: () => state.csrf,
    isAuthenticated: () => Boolean(state.user)
  };
})();
