const SoundPlayer = (function() {
    let audioCtx = null;
    let audioUnlocked = false;
    let isSoundEnabled = true;
    const bufferCache = new Map(); // path -> AudioBuffer

    let soundConfig = null;
    let pendingPlaybackQueue = [];

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

    function init() {
        loadSoundConfig();
        // Unlock AudioContext on first user gesture for ALL clients
        const unlockEvents = ['pointerdown', 'touchstart', 'click', 'keydown'];
        const unlockHandler = () => {
            if (!audioCtx) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (AudioContextClass) {
                    audioCtx = new AudioContextClass();
                }
            }
            if (audioCtx) {
                if (audioCtx.state === 'suspended') {
                    audioCtx.resume();
                }
                // Play a silent buffer inline in the gesture handler — required by
                // Chrome Android / iOS Safari to actually mark the context unlocked.
                try {
                    const silentBuffer = audioCtx.createBuffer(1, 1, 22050);
                    const src = audioCtx.createBufferSource();
                    src.buffer = silentBuffer;
                    src.connect(audioCtx.destination);
                    src.start(0);
                } catch (e) { /* ignore */ }

                if (audioCtx.state === 'running') {
                    audioUnlocked = true;
                    console.log('[SoundPlayer] AudioContext unlocked successfully.');
                    unlockEvents.forEach(evt => document.removeEventListener(evt, unlockHandler, true));
                }
                // If still not 'running' (e.g. still 'suspended'), we deliberately
                // keep the listeners attached so the NEXT gesture retries unlocking
                // instead of giving up after one failed attempt.
            }
        };

        unlockEvents.forEach(evt => document.addEventListener(evt, unlockHandler, { capture: true }));

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
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) audioCtx = new AudioContextClass();
        }
        if (!audioCtx) return;

        try {
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }

            const freqMap = (soundConfig && soundConfig.fallback_freq) ? soundConfig.fallback_freq : {};
            const freq = freqMap[category] || 440;

            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            osc.start();
            osc.stop(audioCtx.currentTime + 0.3);
            console.log('[SoundPlayer] Played fallback tone for category:', category, 'freq:', freq);
        } catch (err) {
            console.error('[SoundPlayer] Fallback tone playback error:', err);
        }
    }

    async function getAudioBuffer(path) {
        if (bufferCache.has(path)) {
            return bufferCache.get(path);
        }

        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) audioCtx = new AudioContextClass();
        }

        if (!audioCtx) return null;

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

        try {
            const arrayBuffer = await blob.arrayBuffer();
            const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            bufferCache.set(path, decodedBuffer);
            return decodedBuffer;
        } catch (err) {
            console.error('[SoundPlayer] Error decoding audio data for path:', path, err);
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

    async function playByPath(targetPath) {
        const startTime = performance.now();
        console.log('[sound] playByPath', targetPath, 'unlocked=', audioUnlocked);
        if (!isSoundEnabled || !targetPath) return;

        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) audioCtx = new AudioContextClass();
        }

        if (audioCtx && audioCtx.state === 'suspended') {
            try {
                await audioCtx.resume();
            } catch (e) {
                console.warn('[SoundPlayer] audioCtx.resume() failed:', e);
            }
        }

        try {
            const buffer = await getAudioBuffer(targetPath);
            if (!buffer || !audioCtx) {
                console.warn('[sound] playByPath buffer null or AudioContext unavailable for path:', targetPath);
                return;
            }

            const source = audioCtx.createBufferSource();
            const gainNode = audioCtx.createGain();

            source.buffer = buffer;
            gainNode.gain.value = 0.7; // Default 0.7 volume

            source.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            source.start(0);
            console.log(`[SoundPlayer] Played sound ${targetPath} in ${(performance.now() - startTime).toFixed(2)}ms`);
        } catch (err) {
            console.error('[SoundPlayer] Error playing sound path:', targetPath, err);
        }
    }

    async function play(category, userId = null, retriesLeft = 5) {
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

        await playByPath(targetPath);
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
