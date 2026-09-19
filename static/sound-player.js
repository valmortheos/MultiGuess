const SoundPlayer = (function() {
    let audioCtx = null;
    let audioUnlocked = false;
    let isSoundEnabled = true;
    const SOUND_CACHE_VERSION = 'v2.2.1';
    const bufferCache = new Map(); // path -> AudioBuffer

    let soundConfig = null;
    let pendingPlaybackQueue = [];

    function ensureAudioContext() {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                audioCtx = new AudioContextClass();
            }
        }
        return audioCtx;
    }

    async function fetchBlobWithCheck(path) {
        let blob = await DB.getSound(path);
        if (!blob) {
            try {
                const res = await fetch(`/Sound/${path}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                blob = await res.blob();
            } catch (err) {
                console.warn('[SoundPlayer] Failed to fetch sound file:', path, err);
                return null;
            }
        }
        return blob;
    }

    function loadSoundConfig() {
        fetch('/api/sound-config')
            .then(res => {
                if (!res.ok) throw new Error(`HTTP error ${res.status}`);
                return res.json();
            })
            .then(data => {
                if (data && typeof data === 'object' && Object.keys(data).length > 0) {
                    soundConfig = data;
                    console.log('[SoundPlayer] Sound config loaded dynamically:', soundConfig);
                    processPendingQueue();
                } else {
                    console.warn('[SoundPlayer] Sound config response empty, disabling soundConfig.');
                    soundConfig = null;
                }
            })
            .catch(err => {
                console.error('[SoundPlayer] Failed to load sound config:', err);
                soundConfig = null;
            });
    }

    function processPendingQueue() {
        if (pendingPlaybackQueue.length > 0 && soundConfig) {
            console.log(`[SoundPlayer] Processing ${pendingPlaybackQueue.length} queued play requests...`);
            while (pendingPlaybackQueue.length > 0) {
                const item = pendingPlaybackQueue.shift();
                if (item.type === 'play') {
                    play(item.category, item.userId);
                } else if (item.type === 'playByPath') {
                    playByPath(item.targetPath);
                }
            }
        }
    }

    async function init() {
        loadSoundConfig();

        // Version check for bufferCache clearing
        try {
            const cachedVer = await DB.get('settings', 'sound_cache_version');
            if (cachedVer !== SOUND_CACHE_VERSION) {
                bufferCache.clear();
                await DB.set('settings', 'sound_cache_version', SOUND_CACHE_VERSION);
                console.log(`[SoundDebug] bufferCache cleared for version ${SOUND_CACHE_VERSION}`);
            }
        } catch (e) {
            console.warn('[SoundPlayer] Sound cache version check error:', e);
        }

        // Unlock AudioContext on first user gesture for ALL clients
        const unlockEvents = ['pointerdown', 'touchstart', 'click'];
        const unlockHandler = () => {
            const ctx = ensureAudioContext();
            if (ctx && ctx.state === 'suspended') {
                ctx.resume();
            }
            audioUnlocked = true;
            console.log('[SoundPlayer] AudioContext unlocked successfully.');
            unlockEvents.forEach(evt => document.removeEventListener(evt, unlockHandler));
        };

        unlockEvents.forEach(evt => document.addEventListener(evt, unlockHandler, { once: true, capture: true }));

        // Load preference
        DB.get('settings', 'sound_effects').then(val => {
            if (val !== null) {
                isSoundEnabled = (val === 'true');
            }
        });
    }

    function setSoundEnabled(enabled) {
        isSoundEnabled = enabled;
        DB.set('settings', 'sound_effects', enabled ? 'true' : 'false');
    }

    function getSoundEnabled() {
        return isSoundEnabled;
    }

    function playFallbackTone(category) {
        const ctx = ensureAudioContext();
        if (!ctx) return;

        try {
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            const freqMap = (soundConfig && soundConfig.fallback_freq) ? soundConfig.fallback_freq : {};
            const freq = freqMap[category] || 440;

            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);

            gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

            osc.connect(gainNode);
            gainNode.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 0.3);
            console.log('[SoundPlayer] Played fallback tone for category:', category, 'freq:', freq);
        } catch (err) {
            console.error('[SoundPlayer] Fallback tone playback error:', err);
        }
    }

    async function getAudioBuffer(path) {
        if (bufferCache.has(path)) {
            console.log('[SoundDebug] cache hit:', path);
            return bufferCache.get(path);
        }

        const ctx = ensureAudioContext();
        if (!ctx) { console.warn('[SoundDebug] no AudioContext'); return null; }

        const blob = await fetchBlobWithCheck(path);
        if (!blob) { console.warn('[SoundDebug] blob null:', path); return null; }

        console.log('[SoundDebug] blob size:', blob.size, 'type:', blob.type);

        try {
            const arrayBuffer = await blob.arrayBuffer();
            const decodedBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
            bufferCache.set(path, decodedBuffer);
            console.log('[SoundDebug] decoded OK:', path, decodedBuffer.duration);
            return decodedBuffer;
        } catch (err) {
            console.error('[SoundDebug] decode FAILED for', path, err);
            return null;
        }
    }

    function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    async function getUserRandomSounds(userId) {
        let stored = await DB.get('user_random_sounds', userId);
        const randomPool = (soundConfig && soundConfig.categories) ? (soundConfig.categories.Random || []) : [];
        if (stored && stored.sounds && stored.sounds.length === 3) {
            const valid = stored.sounds.every(s => randomPool.includes(s));
            if (valid) return stored.sounds;
        }

        const all = [...randomPool];
        const picked = shuffle(all).slice(0, Math.min(3, all.length));
        await DB.set('user_random_sounds', userId, { userId, sounds: picked });
        return picked;
    }

    async function playByPath(targetPath, category = null) {
        console.log('[SoundDebug] request:', targetPath);
        if (!isSoundEnabled || !targetPath) return;

        const ctx = ensureAudioContext();
        console.log('[SoundDebug] audioCtx.state:', ctx && ctx.state);

        if (ctx && ctx.state === 'suspended') {
            try {
                await ctx.resume();
            } catch (e) {
                console.warn('[SoundDebug] audioCtx.resume() failed:', e);
            }
        }

        if (ctx && ctx.state === 'suspended') {
            console.warn('[SoundDebug] audioCtx state remains suspended after resume attempt, playing fallback tone');
            playFallbackTone(category || 'Random');
            return;
        }

        try {
            const buffer = await getAudioBuffer(targetPath);
            if (!buffer || !ctx) {
                console.warn('[SoundDebug] playByPath buffer null or AudioContext unavailable for path:', targetPath);
                playFallbackTone(category || 'Random');
                return;
            }

            const source = ctx.createBufferSource();
            const gainNode = ctx.createGain();

            source.buffer = buffer;
            gainNode.gain.value = 0.7; // Default 0.7 volume

            source.connect(gainNode);
            gainNode.connect(ctx.destination);

            source.start(0);
            console.log('[SoundDebug] source.start() called at', performance.now());
        } catch (err) {
            console.error('[SoundDebug] Error playing sound path:', targetPath, err);
            playFallbackTone(category || 'Random');
        }
    }

    async function play(category, userId = null) {
        console.log('[sound]', category, 'unlocked=', audioUnlocked);
        if (!isSoundEnabled) return;

        if (!soundConfig || !soundConfig.categories) {
            console.warn('[SoundPlayer] soundConfig not yet ready, queueing playback for category:', category);
            pendingPlaybackQueue.push({ type: 'play', category, userId });
            return;
        }

        let targetPath = null;
        if (category === 'Random') {
            const currentUserId = userId || getOrCreateUserId();
            const userSounds = await getUserRandomSounds(currentUserId);
            if (userSounds && userSounds.length > 0) {
                targetPath = userSounds[Math.floor(Math.random() * userSounds.length)];
            }
        } else if (soundConfig.categories[category]) {
            const options = soundConfig.categories[category];
            if (options && options.length > 0) {
                targetPath = options[Math.floor(Math.random() * options.length)];
            }
        }

        if (!targetPath) {
            console.warn('[SoundPlayer] No targetPath found for category:', category, 'playing fallback tone');
            playFallbackTone(category);
            return;
        }

        await playByPath(targetPath, category);
    }

    return {
        init: init,
        play: play,
        playByPath: playByPath,
        playFallbackTone: playFallbackTone,
        getUserRandomSounds: getUserRandomSounds,
        setSoundEnabled: setSoundEnabled,
        getSoundEnabled: getSoundEnabled
    };
})();
