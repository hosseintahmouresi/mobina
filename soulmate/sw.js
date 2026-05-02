/**
 * SoulMate Messenger - Service Worker
 * Enables offline functionality and push notifications
 */

const CACHE_NAME = 'soulmate-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.php',
    '/assets/css/style.css',
    '/assets/js/app.js',
    '/manifest.json'
];

// Install Event - Cache Assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Caching assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate Event - Clean Old Caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => {
                return Promise.all(
                    keys
                        .filter(key => key !== CACHE_NAME)
                        .map(key => caches.delete(key))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch Event - Network First, Fallback to Cache
self.addEventListener('fetch', event => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Skip API requests from caching
    if (event.request.url.includes('/api/')) {
        return;
    }
    
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Clone response for caching
                const responseClone = response.clone();
                
                // Cache successful responses
                if (response.status === 200) {
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseClone);
                        });
                }
                
                return response;
            })
            .catch(() => {
                // Network failed, try cache
                return caches.match(event.request)
                    .then(cachedResponse => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        
                        // Show offline page for navigation requests
                        if (event.request.mode === 'navigate') {
                            return caches.match('/offline.html')
                                .then(offlinePage => {
                                    return offlinePage || new Response('آفلاین هستید. لطفاً اتصال اینترنت خود را بررسی کنید.', {
                                        headers: { 'Content-Type': 'text/html; charset=utf-8' }
                                    });
                                });
                        }
                        
                        return new Response('Offline', { status: 503 });
                    });
            })
    );
});

// Push Notification Event
self.addEventListener('push', event => {
    let data = {};
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = { title: 'SoulMate 💕', body: event.data.text() };
        }
    }
    
    const title = data.title || 'SoulMate 💕';
    const options = {
        body: data.body || 'پیام جدید دارید',
        icon: 'assets/images/icon-192.png',
        badge: 'assets/images/icon-192.png',
        vibrate: [200, 100, 200],
        data: data,
        actions: [
            { action: 'open', title: 'باز کردن' },
            { action: 'close', title: 'بستن' }
        ],
        dir: 'rtl',
        lang: 'fa'
    };
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Notification Click Event
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.openWindow(event.notification.data.url || '/soulmate/')
        );
    }
});

// Background Sync Event
self.addEventListener('sync', event => {
    if (event.tag === 'send-message') {
        event.waitUntil(syncMessages());
    }
});

// Sync Messages Function
async function syncMessages() {
    // Get pending messages from IndexedDB
    // Send them to server
    // This is a placeholder for future implementation
    console.log('Syncing messages...');
}

// Message Handler from Main Thread
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'NEW_MESSAGE_AVAILABLE') {
        // Notify all clients about new message
        self.clients.matchAll().then(clients => {
            clients.forEach(client => {
                client.postMessage({
                    type: 'NEW_MESSAGE',
                    data: event.data.data
                });
            });
        });
    }
});
