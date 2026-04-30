const CACHE_NAME = 'soulmate-shell-v322';
const SHELL = [
  './',
  './index.php',
  './assets/app.css?v=322',
  './assets/enhancements.css?v=322',
  './assets/app.js?v=322',
  './assets/enhancements.js?v=322',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './offline.html',
  './manifest.webmanifest'
];

// مدیریت لوکال دیتابیس برای Background Sync
const LocalDB = {
  async getDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('SoulMateDB', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async getAll(storeName) {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
    });
  },
  async get(storeName, key) {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
    });
  },
  async delete(storeName, key) {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve(true);
    });
  },
  async put(storeName, item) {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(item);
      tx.oncomplete = () => resolve(true);
    });
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(SHELL.map((asset) => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // هندل کردن دریافت فایل از منوی Share گوشی
  if (url.pathname.endsWith('/share-receive') && event.request.method === 'POST') {
      event.respondWith((async () => {
          try {
              const formData = await event.request.formData();
              const file = formData.get('file');
              const text = formData.get('text') || formData.get('title') || formData.get('url');
              
              if (file || text) {
                  await LocalDB.put('settings', { key: 'shared_item', file: file, text: text });
              }
          } catch (e) {
              console.error('Share Target Error:', e);
          }
          return Response.redirect('./', 303);
      })());
      return;
  }

  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        if (event.request.method === 'HEAD') {
          return new Response(null, { status: 204 });
        } // Return a generic error response for API failures
        return new Response(JSON.stringify({ ok: false, error: 'network_unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      })
    );
    return;
  }

  if (event.request.headers.has('range') || url.pathname.includes('/uploads/')) {
    event.respondWith(fetch(event.request).catch(() => new Response(null, { status: 503 })));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./', copy));
          return response;
        })
        .catch(() => caches.match('./offline.html').then((offline) => offline || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// گوش دادن به رویداد Background Sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-outbox') {
    event.waitUntil(flushOutboxInSW());
  }
});

async function flushOutboxInSW() {
  const items = await LocalDB.getAll('outbox');
  if (!items || !items.length) return;

  const csrfSetting = await LocalDB.get('settings', 'csrf');
  const csrf = csrfSetting ? csrfSetting.value : '';
  if (!csrf) return; // بدون نشست فعال امکان ارسال در پس‌زمینه نیست

  for (const item of items) {
    try {
      let attachmentId = null;
      if (item.file) {
        const form = new FormData();
        form.append('file', item.file, item.file.name || 'file');
        const uploadRes = await fetch('./api/upload.php', { method: 'POST', headers: { 'X-Mobina-CSRF': csrf }, body: form });
        const uploadData = await uploadRes.json();
        if (uploadData.ok) attachmentId = uploadData.attachment.id;
      }

      const msgRes = await fetch('./api/messages.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Mobina-CSRF': csrf },
        body: JSON.stringify({ client_id: item.tempId, body: item.payload.body, kind: item.payload.kind, attachment_id: attachmentId, reply_to_id: item.payload.reply_to_id, open_at: item.payload.open_at })
      });
      const msgData = await msgRes.json();

      if (msgData.ok) {
        await LocalDB.delete('outbox', item.tempId);
        if (msgData.message) await LocalDB.put('messages', msgData.message);
        // به تب‌های باز اطلاع بده که رفرش شوند
        const clients = await self.clients.matchAll();
        clients.forEach(c => c.postMessage({ type: 'soulmate-push', payload: { type: 'message' } }));
      }
    } catch (e) {
      throw e; // این ارور باعث می‌شود مرورگر فرآیند Sync را بعداً دوباره تلاش کند
    }
  }
}

self.addEventListener('push', (event) => {
  let payload = {
    title: 'SoulMate',
    body: 'پیام تازه داری.',
    url: './',
    tag: 'soulmate-message'
  };

  if (event.data) {
    try {
      payload = Object.assign(payload, event.data.json());
    } catch (error) {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(Promise.all([
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'soulmate-push', payload }));
    }),
    self.registration.showNotification(payload.title || 'SoulMate', {
      body: payload.body || '',
      icon: './assets/icon-192.png',
      badge: './assets/icon-192.png',
      tag: payload.tag || 'soulmate-message',
      data: {
        url: payload.url || './',
        messageId: payload.message_id || null,
        memoryId: payload.memory_id || null,
        type: payload.type || 'message'
      },
      vibrate: [70, 35, 70],
      actions: [
        { action: 'open', title: 'باز کردن' }
      ]
    })
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notificationData = event.notification.data || {};
  const targetUrl = new URL(notificationData.url || './', self.registration.scope).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client && client.url.startsWith(self.registration.scope)) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
