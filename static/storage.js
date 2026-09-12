// [v1.0.4-OLD] IndexedDB Storage v1 preserved in comment below
/*
const DB = {
    dbName: 'multiguess_db',
    version: 1, ...
}
*/

const DB = {
    dbName: 'multiguess_db',
    version: 2,
    db: null,

    async init() {
        if (!window.indexedDB) {
            console.warn("IndexedDB not supported, using localStorage fallback.");
            return false;
        }
        return new Promise((resolve) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onerror = () => {
                console.warn("IndexedDB failed to open, using localStorage fallback.");
                resolve(false);
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(true);
            };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings');
                }
                if (!db.objectStoreNames.contains('history')) {
                    db.createObjectStore('history', { autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('stats')) {
                    db.createObjectStore('stats');
                }
                if (!db.objectStoreNames.contains('sounds')) {
                    db.createObjectStore('sounds', { keyPath: 'path' });
                }
                if (!db.objectStoreNames.contains('sound_meta')) {
                    db.createObjectStore('sound_meta', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('user_random_sounds')) {
                    db.createObjectStore('user_random_sounds', { keyPath: 'userId' });
                }
            };
        });
    },

    async get(store, key) {
        if (!this.db) return localStorage.getItem(`${store}_${key}`);
        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction(store, 'readonly');
                const req = tx.objectStore(store).get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(localStorage.getItem(`${store}_${key}`));
            } catch (err) {
                resolve(localStorage.getItem(`${store}_${key}`));
            }
        });
    },

    async set(store, key, value) {
        localStorage.setItem(`${store}_${key}`, typeof value === 'string' ? value : JSON.stringify(value));
        if (!this.db) return;
        try {
            const tx = this.db.transaction(store, 'readwrite');
            tx.objectStore(store).put(value, key);
        } catch (err) {
            console.warn("IndexedDB set failed", err);
        }
    },

    async getSound(path) {
        if (!this.db) return null;
        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction('sounds', 'readonly');
                const req = tx.objectStore('sounds').get(path);
                req.onsuccess = () => resolve(req.result ? req.result.blob : null);
                req.onerror = () => resolve(null);
            } catch (err) {
                resolve(null);
            }
        });
    },

    async putSound(path, blob, size, hash) {
        if (!this.db) return;
        try {
            const tx = this.db.transaction('sounds', 'readwrite');
            tx.objectStore('sounds').put({ path, blob, size, hash });
        } catch (err) {
            console.warn("IndexedDB putSound failed", err);
        }
    }
};

let hapticEnabled = true;

function setHapticEnabled(enabled) {
    hapticEnabled = enabled;
    DB.set('settings', 'haptic_enabled', enabled ? 'true' : 'false');
}

function vibrate(pattern) {
    if (!hapticEnabled || !('navigator' in window) || !('vibrate' in navigator)) {
        return;
    }
    try {
        navigator.vibrate(pattern);
    } catch (e) {
        // iOS Safari or permission denied
    }
}

function getOrCreateUserId() {
    let userId = localStorage.getItem('mg_user_id');
    if (!userId) {
        userId = 'user_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
        localStorage.setItem('mg_user_id', userId);
    }
    return userId;
}
