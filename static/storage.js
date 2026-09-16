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

    // [v2.2.1-OLD]
    /*
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
            const objectStore = tx.objectStore(store);
            if (objectStore.keyPath) {
                objectStore.put(value);
            } else {
                objectStore.put(value, key);
            }
        } catch (err) {
            console.warn("IndexedDB set failed", err);
        }
    },
    */
    // [v2.2.1-NEW] Guaranteed timeout fallback for DB get and set operations
    async get(store, key) {
        const localVal = localStorage.getItem(`${store}_${key}`);
        if (!this.db) return localVal;
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                console.warn(`[DB.get] Timeout for ${store}:${key}, fallback to localStorage`);
                resolve(localVal);
            }, 300);
            try {
                const tx = this.db.transaction(store, 'readonly');
                const req = tx.objectStore(store).get(key);
                req.onsuccess = () => {
                    clearTimeout(timer);
                    resolve(req.result !== undefined ? req.result : localVal);
                };
                req.onerror = () => {
                    clearTimeout(timer);
                    resolve(localVal);
                };
            } catch (err) {
                clearTimeout(timer);
                resolve(localVal);
            }
        });
    },

    async set(store, key, value) {
        localStorage.setItem(`${store}_${key}`, typeof value === 'string' ? value : JSON.stringify(value));
        if (!this.db) return;
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(), 300);
            try {
                const tx = this.db.transaction(store, 'readwrite');
                const objectStore = tx.objectStore(store);
                tx.oncomplete = () => { clearTimeout(timer); resolve(); };
                tx.onerror = () => { clearTimeout(timer); resolve(); };
                if (objectStore.keyPath) {
                    objectStore.put(value);
                } else {
                    objectStore.put(value, key);
                }
            } catch (err) {
                clearTimeout(timer);
                resolve();
            }
        });
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

// Migration: Reset settings version to v2.0.4 to ensure haptic & sound are default ON
(async function migrateSettings() {
    try {
        const ver = await DB.get('settings', 'settings_version');
        if (ver !== '2.0.4') {
            await DB.set('settings', 'haptic_enabled', 'true');
            await DB.set('settings', 'sound_effects', 'true');
            await DB.set('settings', 'settings_version', '2.0.4');
        }
    } catch (e) {
        console.warn("Settings migration warning:", e);
    }
})();

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

/* [v2.0.2-OLD]
function getOrCreateUserId() {
    let userId = localStorage.getItem('mg_user_id');
    if (!userId) {
        userId = 'user_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
        localStorage.setItem('mg_user_id', userId);
    }
    return userId;
}
*/
function getOrCreateUserId() {
    let userId = localStorage.getItem('mg_user_id');
    if (!userId) {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            userId = crypto.randomUUID();
        } else {
            userId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        localStorage.setItem('mg_user_id', userId);
    }
    return userId;
}
