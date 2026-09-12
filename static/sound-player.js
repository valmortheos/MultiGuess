const SoundPlayer = (function() {
    let audioCtx = null;
    let audioUnlocked = false;
    let isSoundEnabled = true;
    const bufferCache = new Map(); // path -> AudioBuffer

    const SOUND_CATEGORIES = {
        'Censored': ['Censored/cn_boom.mp3'],
        'CorrectAnswer': ['CorrectAnswer/cr_wow.mp3'],
        'FailedRound': ['FailedRound/fl_sponge.mp3'],
        'RandomAll': [
            'Random/rd_ack.mp3',
            'Random/rd_ahh.mp3',
            'Random/rd_laugh.mp3',
            'Random/rd_meow.mp3',
            'Random/rd_metalclang.mp3',
            'Random/rd_taco.mp3'
        ],
        'TimeRemaining': ['TimeRemaining/tm_sponge.mp3'],
        'WinnerScore': ['WinnerScore/ws_dubistgut.mp3'],
        'WrongAnswer': ['WrongAnswer/wg_fahh.mp3', 'WrongAnswer/wg_jokowi.mp3'],
        'YourTurn': ['YourTurn/yt_amongus.mp3']
    };

    function init() {
        // Unlock AudioContext on first user gesture for ALL clients
        const unlockEvents = ['pointerdown', 'touchstart', 'click'];
        const unlockHandler = () => {
            if (!audioCtx) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (AudioContextClass) {
                    audioCtx = new AudioContextClass();
                }
            }
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume();
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
                blob = await res.blob();
            } catch (err) {
                console.warn('[SoundPlayer] Failed to fetch sound fallback:', path, err);
                return null;
            }
        }

        try {
            const arrayBuffer = await blob.arrayBuffer();
            const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            bufferCache.set(path, decodedBuffer);
            return decodedBuffer;
        } catch (err) {
            console.warn('[SoundPlayer] Failed to decode audio data for path:', path, err);
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
        if (stored && stored.sounds && stored.sounds.length === 3) {
            return stored.sounds;
        }

        const all = [...SOUND_CATEGORIES.RandomAll];
        const picked = shuffle(all).slice(0, 3);
        await DB.set('user_random_sounds', userId, { userId, sounds: picked });
        return picked;
    }

    async function playByPath(targetPath) {
        console.log('[sound] playByPath', targetPath, 'unlocked=', audioUnlocked);
        if (!isSoundEnabled || !targetPath) return;

        try {
            const buffer = await getAudioBuffer(targetPath);
            if (!buffer || !audioCtx) {
                console.warn('[sound] playByPath buffer null for path:', targetPath);
                return;
            }

            if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
            }

            const source = audioCtx.createBufferSource();
            const gainNode = audioCtx.createGain();

            source.buffer = buffer;
            gainNode.gain.value = 0.7; // Default 0.7 volume

            source.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            source.start(0);
        } catch (err) {
            console.warn('[SoundPlayer] Error playing sound path:', targetPath, err);
        }
    }

    async function play(category, userId = null) {
        console.log('[sound]', category, 'unlocked=', audioUnlocked);
        if (!isSoundEnabled) return;

        let targetPath = null;
        if (category === 'Random') {
            const currentUserId = userId || getOrCreateUserId();
            const userSounds = await getUserRandomSounds(currentUserId);
            targetPath = userSounds[Math.floor(Math.random() * userSounds.length)];
        } else if (SOUND_CATEGORIES[category]) {
            const options = SOUND_CATEGORIES[category];
            targetPath = options[Math.floor(Math.random() * options.length)];
        }

        if (!targetPath) return;
        await playByPath(targetPath);
    }

    return {
        init: init,
        play: play,
        playByPath: playByPath,
        getUserRandomSounds: getUserRandomSounds,
        setSoundEnabled: setSoundEnabled,
        getSoundEnabled: getSoundEnabled
    };
})();
