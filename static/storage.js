const DB = {
    dbName: 'multiguess_db',
    version: 1,
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
        localStorage.setItem(`${store}_${key}`, value);
        if (!this.db) return;
        try {
            const tx = this.db.transaction(store, 'readwrite');
            tx.objectStore(store).put(value, key);
        } catch (err) {
            console.warn("IndexedDB set failed", err);
        }
    }
};

let hapticEnabled = true;

function setHapticEnabled(enabled) {
    hapticEnabled = enabled;
    DB.set('settings', 'haptic', enabled ? 'true' : 'false');
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
