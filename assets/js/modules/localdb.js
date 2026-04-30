/**
 * LocalDB - موتور دیتابیس محلی (IndexedDB)
 * مدیریت ذخیره‌سازی آفلاین پیام‌ها، خاطرات و تنظیمات
 * @module LocalDB
 */

const LocalDB = {
  db: null,
  dbName: 'SoulMateDB',
  dbVersion: 2, // Increased for pagination support

  /**
   * Initialize IndexedDB connection
   * @returns {Promise<void>}
   */
  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.dbVersion);
      
      req.onupgradeneeded = (e) => {
        const database = e.target.result;
        
        // Messages store with indexes for pagination
        if (!database.objectStoreNames.contains('messages')) {
          const messageStore = database.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('timestamp', 'timestamp', { unique: false });
          messageStore.createIndex('type', 'type', { unique: false });
        }
        
        // Other stores
        if (!database.objectStoreNames.contains('memories')) {
          database.createObjectStore('memories', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('loveItems')) {
          database.createObjectStore('loveItems', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('outbox')) {
          database.createObjectStore('outbox', { keyPath: 'tempId' });
        }
        if (!database.objectStoreNames.contains('settings')) {
          database.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!database.objectStoreNames.contains('starredMessages')) {
          database.createObjectStore('starredMessages', { keyPath: 'messageId' });
        }
      };
      
      req.onsuccess = (e) => {
        this.db = e.target.result;
        console.log('✅ LocalDB initialized');
        resolve();
      };
      
      req.onerror = () => {
        console.error('❌ LocalDB initialization failed:', req.error);
        reject(req.error);
      };
    });
  },

  /**
   * Get item from store
   * @param {string} storeName 
   * @param {any} key 
   * @returns {Promise<any>}
   */
  async get(storeName, key) {
    return new Promise((resolve) => {
      if (!this.db) return resolve(null);
      try {
        const req = this.db.transaction(storeName, 'readonly')
          .objectStore(storeName)
          .get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  },

  /**
   * Get all items from store
   * @param {string} storeName 
   * @returns {Promise<Array>}
   */
  async getAll(storeName) {
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      try {
        const req = this.db.transaction(storeName, 'readonly')
          .objectStore(storeName)
          .getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  },

  /**
   * Get items with pagination
   * @param {string} storeName 
   * @param {number} limit 
   * @param {number} offset 
   * @param {string} direction - 'prev' or 'next'
   * @param {any} cursorKey - starting key
   * @returns {Promise<Array>}
   */
  async getPaginated(storeName, limit = 50, offset = 0, direction = 'prev', cursorKey = null) {
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      
      try {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const results = [];
        
        let request;
        if (cursorKey !== null) {
          request = store.openCursor(cursorKey, direction);
        } else if (direction === 'prev') {
          request = store.openCursor(null, 'prev');
        } else {
          request = store.openCursor(null, 'next');
        }
        
        let count = 0;
        let skipped = 0;
        
        request.onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor || count >= limit) {
            resolve(results);
            return;
          }
          
          if (skipped < offset) {
            skipped++;
            cursor.continue();
            return;
          }
          
          results.push(cursor.value);
          count++;
          cursor.continue();
        };
        
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  },

  /**
   * Put single item to store
   * @param {string} storeName 
   * @param {any} item 
   * @returns {Promise<boolean>}
   */
  async put(storeName, item) {
    return new Promise((resolve) => {
      if (!this.db) return resolve(false);
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(item);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  },

  /**
   * Put multiple items to store
   * @param {string} storeName 
   * @param {Array} items 
   * @returns {Promise<boolean>}
   */
  async putAll(storeName, items) {
    return new Promise((resolve) => {
      if (!this.db) return resolve(false);
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        for (const item of items) {
          store.put(item);
        }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  },

  /**
   * Delete item from store
   * @param {string} storeName 
   * @param {any} key 
   * @returns {Promise<boolean>}
   */
  async delete(storeName, key) {
    return new Promise((resolve) => {
      if (!this.db) return resolve(false);
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  },

  /**
   * Clear entire store
   * @param {string} storeName 
   * @returns {Promise<boolean>}
   */
  async clear(storeName) {
    return new Promise((resolve) => {
      if (!this.db) return resolve(false);
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  },

  /**
   * Count items in store
   * @param {string} storeName 
   * @returns {Promise<number>}
   */
  async count(storeName) {
    return new Promise((resolve) => {
      if (!this.db) return resolve(0);
      try {
        const req = this.db.transaction(storeName, 'readonly')
          .objectStore(storeName)
          .count();
        req.onsuccess = () => resolve(req.result || 0);
        req.onerror = () => resolve(0);
      } catch {
        resolve(0);
      }
    });
  },

  /**
   * Get latest N items by timestamp
   * @param {string} storeName 
   * @param {number} limit 
   * @returns {Promise<Array>}
   */
  async getLatest(storeName, limit = 50) {
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      
      try {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index('timestamp');
        const results = [];
        
        const request = index.openCursor(null, 'prev');
        let count = 0;
        
        request.onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor || count >= limit) {
            resolve(results);
            return;
          }
          results.push(cursor.value);
          count++;
          cursor.continue();
        };
        
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }
};

// Export for ES6 modules compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LocalDB;
}
