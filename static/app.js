// App Global State & Socket Initialization
// [v1.0.5-OLD] const APP_VERSION = "1.0.5";
// [v2.0.2-OLD] const APP_VERSION = "2.0.2";
const APP_VERSION = "2.0.3";
window.AppSocket = io();
window.currentRoomCode = null;
window.isHost = false;
window.currentSid = null;
window.roomPlayerCount = 0;

document.addEventListener('DOMContentLoaded', async function() {
    // Initialize Client IndexedDB Storage
    await DB.init();

    // Sound Preloader & Player Initialization
    SoundPlayer.init();
    await SoundLoader.loadSounds();

    // Canvas Init
    CanvasManager.init('game-canvas');

    // UI Elements
    const screenHome = document.getElementById('screen-home');
    const screenGame = document.getElementById('screen-game');

    const inputPlayerName = document.getElementById('player-name');
    const inputRoomCode = document.getElementById('room-code-input');
    const btnCreateRoom = document.getElementById('btn-create-room');
    const btnJoinRoom = document.getElementById('btn-join-room');

    const displayRoomCode = document.getElementById('display-room-code');
    const displayRoundBadge = document.getElementById('round-badge');
    const timerDisplay = document.getElementById('timer-display');
    const btnLeave = document.getElementById('btn-leave');
    const btnBackLobby = document.getElementById('btn-back-lobby');

    const turnStatusText = document.getElementById('turn-status-text');
    const wordMaskDisplay = document.getElementById('word-mask-display');

    const drawingToolbar = document.getElementById('drawing-toolbar');
    const colorBtns = document.querySelectorAll('.color-btn');
    const selectBrushSize = document.getElementById('brush-size');
    const btnEraser = document.getElementById('btn-eraser');
    const btnUndo = document.getElementById('btn-undo');
    const btnClear = document.getElementById('btn-clear');

    const leaderboardToggle = document.getElementById('leaderboard-toggle');
    const leaderboardList = document.getElementById('leaderboard-list');
    const lbToggleIcon = document.getElementById('lb-toggle-icon');
    const playerCount = document.getElementById('player-count');

    const chatList = document.getElementById('chat-list');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const toastHampirBenar = document.getElementById('toast-hampir-benar');

    const floatingOverlayContainer = document.getElementById('floating-overlay-container');
    const reactionBtns = document.querySelectorAll('#reaction-bar .btn-reaction');

    // Dev Panel Elements (v2.0.3)
    const btnDevPanel = document.getElementById('btn-dev-panel');
    const modalDevPanel = document.getElementById('modal-dev-panel');
    const btnCloseDevPanel = document.getElementById('btn-close-dev-panel');

    const btnDevInviteBot = document.getElementById('btn-dev-invite-bot');
    const btnDevRemoveBot = document.getElementById('btn-dev-remove-bot');
    const devBotStatusBadge = document.getElementById('dev-bot-status-badge');

    const devSoundType = document.getElementById('dev-sound-type');
    const btnDevTriggerSound = document.getElementById('btn-dev-trigger-sound');
    const devSoundAckLog = document.getElementById('dev-sound-ack-log');

    const devReactionBtns = document.querySelectorAll('.btn-dev-reaction');
    const devReactionAckLog = document.getElementById('dev-reaction-ack-log');

    const btnDevForceRoundEnd = document.getElementById('btn-dev-force-round-end');
    const devConsoleLog = document.getElementById('dev-console-log');

    // Countdown Overlay
    const countdownOverlay = document.getElementById('countdown-overlay');
    const countdownNumber = document.getElementById('countdown-number');

    // Toast Popup
    const appToast = document.getElementById('app-toast');
    const toastMessage = document.getElementById('toast-message');

    function showToast(msg, duration = 3000) {
        toastMessage.textContent = msg;
        appToast.classList.remove('hidden');
        setTimeout(() => {
            appToast.classList.add('hidden');
        }, duration);
    }

    // Floating Overlay Function (v2.0.2)
    function showFloatingOverlay({ username, text, variant, slot }) {
        if (!floatingOverlayContainer) return;

        const card = document.createElement('div');
        card.className = `floating-overlay ${variant || 'random'}`;

        if (variant === 'censored') {
            const badge = document.createElement('span');
            badge.className = 'slot-badge';
            badge.textContent = '!';
            const nameSpan = document.createElement('span');
            nameSpan.textContent = `${username}: ${text}`;
            card.appendChild(badge);
            card.appendChild(nameSpan);
        } else {
            const nameSpan = document.createElement('span');
            nameSpan.textContent = username;
            const badge = document.createElement('span');
            badge.className = 'slot-badge';
            badge.textContent = slot || '1';
            card.appendChild(nameSpan);
            card.appendChild(badge);
        }

        floatingOverlayContainer.appendChild(card);

        setTimeout(() => {
            if (card && card.parentNode) {
                card.parentNode.removeChild(card);
            }
        }, 2800);
    }

    // Modals
    const modalLobby = document.getElementById('modal-lobby');
    const lobbyRoomCode = document.getElementById('lobby-room-code');
    const hostSettings = document.getElementById('host-settings');
    const settingTimer = document.getElementById('setting-timer');
    const settingRounds = document.getElementById('setting-rounds');
    const toggleHaptic = document.getElementById('toggle-haptic');
    const toggleSound = document.getElementById('toggle-sound');
    const lobbyPlayerList = document.getElementById('lobby-player-list');
    const btnStartGame = document.getElementById('btn-start-game');
    const waitingHostMsg = document.getElementById('waiting-host-msg');

    const modalConfirm = document.getElementById('modal-confirm');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmMessage = document.getElementById('confirm-message');
    const btnConfirmYes = document.getElementById('btn-confirm-yes');
    const btnConfirmNo = document.getElementById('btn-confirm-no');
    let onConfirmAction = null;

    const modalWordSelect = document.getElementById('modal-word-select');
    const wordCardsContainer = document.getElementById('word-cards-container');

    const modalRoundEnded = document.getElementById('modal-round-ended');
    const revealWordDisplay = document.getElementById('reveal-word-display');
    const roundSummaryList = document.getElementById('round-summary-list');

    const modalPodium = document.getElementById('modal-podium');
    const podiumContainer = document.getElementById('podium-container');
    const btnPlayAgain = document.getElementById('btn-play-again');
    const btnExitPodium = document.getElementById('btn-exit-podium');

    // Restore Name & Settings from DB
    const savedName = await DB.get('settings', 'player_name');
    if (savedName) {
        inputPlayerName.value = savedName;
    }
    const savedHaptic = await DB.get('settings', 'haptic_enabled');
    if (savedHaptic !== null) {
        const isHapticOn = (savedHaptic === 'true');
        toggleHaptic.checked = isHapticOn;
        setHapticEnabled(isHapticOn);
    }

    if (toggleSound) {
        toggleSound.checked = SoundPlayer.getSoundEnabled();
        toggleSound.addEventListener('change', function() {
            SoundPlayer.setSoundEnabled(this.checked);
        });
    }

    toggleHaptic.addEventListener('change', function() {
        setHapticEnabled(this.checked);
    });

    async function savePlayerName() {
        const name = inputPlayerName.value.trim();
        if (name) {
            await DB.set('settings', 'player_name', name);
        }
        return name;
    }

    // Reaction Buttons Event Binding
    reactionBtns.forEach(btn => {
        btn.addEventListener('click', async function() {
            vibrate(10);
            const slot = parseInt(this.dataset.slot) || 1;
            const userId = getOrCreateUserId();
            const userSounds = await SoundPlayer.getUserRandomSounds(userId);
            const soundPath = userSounds[slot - 1];

            if (window.currentRoomCode && soundPath) {
                window.AppSocket.emit('trigger_reaction', {
                    room_code: window.currentRoomCode,
                    slot: slot,
                    userId: userId,
                    soundPath: soundPath
                });
            }
        });
    });

    // Event Handlers - Room Creation & Joining
    btnCreateRoom.addEventListener('click', async function() {
        vibrate(10);
        const name = await savePlayerName();
        if (!name) {
            showToast('Masukkan nama kamu terlebih dahulu!');
            return;
        }
        window.AppSocket.emit('create_room', { player_name: name });
    });

    btnJoinRoom.addEventListener('click', async function() {
        vibrate(10);
        const name = await savePlayerName();
        const rawCode = inputRoomCode.value.trim();
        if (!name) {
            showToast('Masukkan nama kamu terlebih dahulu!');
            return;
        }
        if (!rawCode) {
            showToast('Masukkan kode room terlebih dahulu!');
            return;
        }
        window.AppSocket.emit('join_room', { player_name: name, room_code: rawCode });
    });

    // Back / Cancel / Leave Header Logic
    btnBackLobby.addEventListener('click', function() {
        vibrate(10);
        handleLeaveOrBackAction();
    });

    btnLeave.addEventListener('click', function() {
        vibrate(10);
        handleLeaveOrBackAction();
    });

    function handleLeaveOrBackAction() {
        if (!window.currentRoomCode) {
            resetToHome();
            return;
        }

        if (window.isHost && window.roomPlayerCount <= 1) {
            confirmTitle.textContent = "Batalkan Room";
            confirmMessage.textContent = `Batalkan room ${window.currentRoomCode} dan kembali ke menu utama?`;
            onConfirmAction = function() {
                window.AppSocket.emit('cancel_room', { room_code: window.currentRoomCode });
            };
            modalConfirm.classList.remove('hidden');
        } else {
            confirmTitle.textContent = "Keluar dari Room";
            if (window.isHost) {
                confirmMessage.textContent = "Keluar dari room? Host akan dipindahkan ke pemain lain.";
            } else {
                confirmMessage.textContent = "Keluar dari room dan kembali ke menu utama?";
            }
            onConfirmAction = function() {
                window.AppSocket.emit('leave_room', { room_code: window.currentRoomCode });
            };
            modalConfirm.classList.remove('hidden');
        }
    }

    btnConfirmYes.addEventListener('click', function() {
        vibrate(10);
        modalConfirm.classList.add('hidden');
        if (typeof onConfirmAction === 'function') {
            onConfirmAction();
        }
    });

    btnConfirmNo.addEventListener('click', function() {
        vibrate(10);
        modalConfirm.classList.add('hidden');
        onConfirmAction = null;
    });

    function resetToHome() {
        window.currentRoomCode = null;
        window.isHost = false;
        window.roomPlayerCount = 0;
        screenGame.classList.add('hidden');
        modalLobby.classList.add('hidden');
        modalWordSelect.classList.add('hidden');
        modalRoundEnded.classList.add('hidden');
        modalPodium.classList.add('hidden');
        countdownOverlay.classList.add('hidden');
        screenHome.classList.remove('hidden');
        chatList.innerHTML = '';
        if (floatingOverlayContainer) floatingOverlayContainer.innerHTML = '';
        CanvasManager.clear();
    }

    // Host Settings Change
    settingTimer.addEventListener('change', sendHostSettings);
    settingRounds.addEventListener('change', sendHostSettings);

    function sendHostSettings() {
        if (window.isHost && window.currentRoomCode) {
            window.AppSocket.emit('update_settings', {
                room_code: window.currentRoomCode,
                timer_duration: parseInt(settingTimer.value),
                total_rounds: parseInt(settingRounds.value)
            });
        }
    }

    btnStartGame.addEventListener('click', function() {
        vibrate(10);
        if (window.isHost && window.currentRoomCode) {
            window.AppSocket.emit('start_game', { room_code: window.currentRoomCode });
        }
    });

    // Toolbar Event Listeners
    colorBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            vibrate(10);
            colorBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            CanvasManager.setColor(this.dataset.color);
        });
    });

    selectBrushSize.addEventListener('change', function() {
        CanvasManager.setLineWidth(parseInt(this.value));
    });

    btnEraser.addEventListener('click', function() {
        vibrate(10);
        CanvasManager.setEraser(true);
    });

    btnUndo.addEventListener('click', function() {
        vibrate(10);
        window.AppSocket.emit('undo_stroke', { room_code: window.currentRoomCode });
    });

    btnClear.addEventListener('click', function() {
        vibrate(10);
        window.AppSocket.emit('clear_canvas', { room_code: window.currentRoomCode });
    });

    // Leaderboard Toggle
    leaderboardToggle.addEventListener('click', function() {
        vibrate(10);
        if (leaderboardList.style.display === 'none') {
            leaderboardList.style.display = 'flex';
            lbToggleIcon.textContent = '▲';
        } else {
            leaderboardList.style.display = 'none';
            lbToggleIcon.textContent = '▼';
        }
    });

    // Chat / Guess Submission
    chatForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (text && window.currentRoomCode) {
            window.AppSocket.emit('send_message', {
                room_code: window.currentRoomCode,
                text: text
            });
            chatInput.value = '';
        }
    });

    btnPlayAgain.addEventListener('click', function() {
        vibrate(10);
        if (window.isHost && window.currentRoomCode) {
            window.AppSocket.emit('play_again', { room_code: window.currentRoomCode });
            modalPodium.classList.add('hidden');
        }
    });

    btnExitPodium.addEventListener('click', function() {
        vibrate(10);
        resetToHome();
    });

    // Socket.IO Incoming Event Receivers
    window.AppSocket.on('connect', function() {
        window.currentSid = window.AppSocket.id;
    });

    window.AppSocket.on('error_message', function(data) {
        showToast(data.message);
    });

    window.AppSocket.on('join_error', function(data) {
        if (data.reason === 'not_found') {
            showToast(`Room '${data.code}' tidak ditemukan. Cek kembali kodenya.`);
        } else if (data.reason === 'in_progress') {
            showToast(`Room '${data.code}' sedang dalam permainan.`);
        } else if (data.reason === 'invalid_code') {
            showToast('Kode room tidak valid.');
        } else {
            showToast('Gagal bergabung ke room.');
        }
    });

    window.AppSocket.on('room_cancelled', function() {
        showToast('Room telah dibatalkan.');
        resetToHome();
    });

    window.AppSocket.on('left_room_success', function() {
        resetToHome();
    });

    window.AppSocket.on('room_joined', function(data) {
        window.currentRoomCode = data.room_code;
        window.isHost = data.is_host;

        displayRoomCode.textContent = window.currentRoomCode;
        lobbyRoomCode.textContent = window.currentRoomCode;

        screenHome.classList.add('hidden');
        screenGame.classList.remove('hidden');

        if (window.isHost) {
            hostSettings.classList.remove('hidden');
            btnStartGame.classList.remove('hidden');
            waitingHostMsg.classList.add('hidden');
        } else {
            hostSettings.classList.add('hidden');
            btnStartGame.classList.add('hidden');
            waitingHostMsg.classList.remove('hidden');
        }

        modalLobby.classList.remove('hidden');

        // Signal Canvas Ready to server
        window.AppSocket.emit('canvas_ready', { room_code: window.currentRoomCode });
    });

    window.AppSocket.on('room_updated', function(data) {
        window.currentRoomCode = data.room_code;
        const mySid = window.currentSid || (window.AppSocket ? window.AppSocket.id : null);
        window.isHost = (mySid === data.host_sid);
        window.roomPlayerCount = data.players.length;

        displayRoundBadge.textContent = `Ronde ${data.current_round}/${data.total_rounds}`;
        playerCount.textContent = data.players.length;

        if (window.isHost && window.roomPlayerCount <= 1) {
            btnBackLobby.textContent = "← Kembali";
        } else {
            btnBackLobby.textContent = "← Keluar";
        }

        if (window.isHost) {
            if (btnDevPanel) btnDevPanel.classList.remove('hidden');
        } else {
            if (btnDevPanel) btnDevPanel.classList.add('hidden');
        }

        if (window.isHost && data.state === 'LOBBY') {
            hostSettings.classList.remove('hidden');
            btnStartGame.classList.remove('hidden');
            waitingHostMsg.classList.add('hidden');
        } else if (!window.isHost && data.state === 'LOBBY') {
            hostSettings.classList.add('hidden');
            btnStartGame.classList.add('hidden');
            waitingHostMsg.classList.remove('hidden');
        }

        lobbyPlayerList.innerHTML = '';
        data.players.forEach(p => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${p.name} ${p.is_host ? '👑 (Host)' : ''}</span> <span>${p.score} pts</span>`;
            lobbyPlayerList.appendChild(li);
        });

        leaderboardList.innerHTML = '';
        data.players.forEach(p => {
            const div = document.createElement('div');
            let classes = 'leaderboard-item';
            if (p.sid === data.current_drawer) classes += ' drawer';
            if (p.has_guessed) classes += ' guessed';
            div.className = classes;

            let icon = '';
            if (p.sid === data.current_drawer) icon = '✏️ ';
            if (p.has_guessed) icon = '✅ ';

            div.innerHTML = `<span class="lb-name">${icon}${p.name}</span><span class="lb-score">${p.score}</span>`;
            leaderboardList.appendChild(div);
        });

        console.log('[drawer-mode]', mySid === data.current_drawer, data.current_drawer);

        if (data.state === 'LOBBY') {
            modalLobby.classList.remove('hidden');
            modalWordSelect.classList.add('hidden');
            modalRoundEnded.classList.add('hidden');
            modalPodium.classList.add('hidden');
            countdownOverlay.classList.add('hidden');
            turnStatusText.textContent = "Menunggu host memulai...";
            wordMaskDisplay.textContent = "";
            if (drawingToolbar) drawingToolbar.classList.add('hidden');
            CanvasManager.setDrawerMode(false);
        } else if (data.state === 'SELECTING_WORD') {
            modalLobby.classList.add('hidden');
            modalRoundEnded.classList.add('hidden');
            modalPodium.classList.add('hidden');
            countdownOverlay.classList.add('hidden');
            wordMaskDisplay.textContent = "";

            if (window.currentSid === data.current_drawer) {
                turnStatusText.textContent = "Kamu sedang memilih kata...";
            } else {
                turnStatusText.textContent = `${data.current_drawer_name} sedang memilih kata...`;
            }
        } else if (data.state === 'PLAYING') {
            modalLobby.classList.add('hidden');
            modalWordSelect.classList.add('hidden');
            modalRoundEnded.classList.add('hidden');
            modalPodium.classList.add('hidden');
            countdownOverlay.classList.add('hidden');

            const isDrawer = (window.currentSid === data.current_drawer);
            CanvasManager.setDrawerMode(isDrawer);

            if (isDrawer) {
                if (drawingToolbar) drawingToolbar.classList.remove('hidden');
                turnStatusText.textContent = "Giliran kamu menggambar!";
            } else {
                if (drawingToolbar) drawingToolbar.classList.add('hidden');
                turnStatusText.textContent = "Tebak gambarnya:";
            }
        }
    });

    window.AppSocket.on('countdown_start', function(data) {
        modalLobby.classList.add('hidden');
        modalWordSelect.classList.add('hidden');
        modalRoundEnded.classList.add('hidden');

        let count = data.duration || 3;
        countdownNumber.textContent = count;
        countdownOverlay.classList.remove('hidden');
        vibrate(50);

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownNumber.textContent = count;
                vibrate(50);
            } else {
                clearInterval(interval);
                countdownOverlay.classList.add('hidden');
            }
        }, 1000);
    });

    window.AppSocket.on('round_started', function(data) {
        countdownOverlay.classList.add('hidden');
        const mySid = window.currentSid || (window.AppSocket ? window.AppSocket.id : null);
        const isDrawer = (mySid === data.drawer_sid);

        console.log('[drawer-mode]', isDrawer, data.drawer_sid);
        CanvasManager.setDrawerMode(isDrawer);

        if (isDrawer) {
            if (drawingToolbar) drawingToolbar.classList.remove('hidden');
            turnStatusText.textContent = "Giliran kamu menggambar!";
        } else {
            if (drawingToolbar) drawingToolbar.classList.add('hidden');
            turnStatusText.textContent = "Tebak gambarnya:";
        }
    });

    window.AppSocket.on('choose_word_prompt', function(data) {
        wordCardsContainer.innerHTML = '';
        data.words.forEach(word => {
            const btn = document.createElement('button');
            btn.className = 'word-card';
            btn.textContent = word;
            btn.addEventListener('click', function() {
                vibrate(10);
                window.AppSocket.emit('select_word', {
                    room_code: window.currentRoomCode,
                    word: word
                });
                modalWordSelect.classList.add('hidden');
            });
            wordCardsContainer.appendChild(btn);
        });
        modalWordSelect.classList.remove('hidden');
    });

    window.AppSocket.on('your_word', function(data) {
        wordMaskDisplay.textContent = data.word.toUpperCase();
    });

    window.AppSocket.on('timer_tick', function(data) {
        timerDisplay.textContent = `${data.time_remaining}s`;
    });

    window.AppSocket.on('draw_stroke', function(stroke) {
        CanvasManager.addRemoteStroke(stroke);
    });

    window.AppSocket.on('strokes_rebuild', function(strokes) {
        CanvasManager.rebuildStrokes(strokes);
    });

    window.AppSocket.on('clear_canvas', function() {
        CanvasManager.clear();
    });

    // Centralized Play Sound Receiver (v2.0.2)
    window.AppSocket.on('play_sound', function(payload) {
        const type = payload.type;
        const mySid = window.currentSid || (window.AppSocket ? window.AppSocket.id : null);

        if (type === 'CorrectAnswer') {
            vibrate([30, 50, 30]);
            SoundPlayer.play('CorrectAnswer');
        } else if (type === 'WrongAnswer') {
            vibrate(20);
            SoundPlayer.play('WrongAnswer');
        } else if (type === 'FailedRound') {
            vibrate([50, 100, 50]);
            SoundPlayer.play('FailedRound');
        } else if (type === 'YourTurn') {
            vibrate([40, 60, 40]);
            SoundPlayer.play('YourTurn');
        } else if (type === 'WinnerScore') {
            vibrate([50, 100, 50, 100, 50]);
            SoundPlayer.play('WinnerScore');
        } else if (type === 'TimeRemaining') {
            vibrate(15);
            SoundPlayer.play('TimeRemaining');
        } else if (type === 'Censored') {
            vibrate(30);
            SoundPlayer.play('Censored');
            showFloatingOverlay({
                username: payload.username,
                text: payload.extra ? payload.extra.original_text : '',
                variant: 'censored'
            });
        } else if (type === 'Random') {
            vibrate(25);
            if (payload.soundPath) {
                SoundPlayer.playByPath(payload.soundPath);
            } else {
                SoundPlayer.play('Random', payload.userId);
            }
            showFloatingOverlay({
                username: payload.username,
                slot: payload.slot || 1,
                variant: 'random'
            });
        }
    });

    window.AppSocket.on('chat_message', function(data) {
        const div = document.createElement('div');
        div.className = `chat-msg ${data.type}`;

        if (data.type === 'system') {
            div.textContent = data.text;
        } else if (data.type === 'correct') {
            div.textContent = data.text;
        } else if (data.type === 'censored') {
            div.textContent = `${data.sender}: ${data.text}`;
        } else {
            div.innerHTML = `<span class="chat-sender">${data.sender}:</span> ${data.text}`;
        }

        chatList.appendChild(div);
        chatList.scrollTop = chatList.scrollHeight;
    });

    window.AppSocket.on('system_message', function(data) {
        const div = document.createElement('div');
        div.className = 'chat-msg system';
        div.textContent = data.text;
        chatList.appendChild(div);
        chatList.scrollTop = chatList.scrollHeight;
    });

    window.AppSocket.on('hampir_benar', function() {
        vibrate(20);
        toastHampirBenar.classList.remove('hidden');
        setTimeout(() => {
            toastHampirBenar.classList.add('hidden');
        }, 2000);
    });

    window.AppSocket.on('turn_ended', function(data) {
        vibrate([50, 100, 50]);
        revealWordDisplay.textContent = data.word.toUpperCase();
        roundSummaryList.innerHTML = '';

        data.summary.forEach(item => {
            const div = document.createElement('div');
            div.className = 'summary-item';
            div.innerHTML = `<span>${item.name}</span> <span>+${item.points_gained} pt (Total: ${item.total_score})</span>`;
            roundSummaryList.appendChild(div);
        });

        modalRoundEnded.classList.remove('hidden');
    });

    // Dev Panel Socket Events & Handlers (v2.0.3)
    if (btnDevPanel) {
        btnDevPanel.addEventListener('click', function() {
            vibrate(10);
            if (modalDevPanel) modalDevPanel.classList.remove('hidden');
            checkBotStatus();
        });
    }

    if (btnCloseDevPanel) {
        btnCloseDevPanel.addEventListener('click', function() {
            vibrate(10);
            if (modalDevPanel) modalDevPanel.classList.add('hidden');
        });
    }

    function appendDevLog(msg) {
        if (!devConsoleLog) return;
        const div = document.createElement('div');
        div.className = 'log-line';
        div.textContent = msg;
        devConsoleLog.appendChild(div);
        devConsoleLog.scrollTop = devConsoleLog.scrollHeight;
    }

    async function devApiRequest(url, method = 'GET', body = null) {
        try {
            const headers = {
                'Content-Type': 'application/json',
                'X-Socket-ID': window.currentSid || (window.AppSocket ? window.AppSocket.id : '')
            };
            const options = { method, headers };
            if (body) options.body = JSON.stringify(body);
            const res = await fetch(url, options);
            return await res.json();
        } catch (err) {
            console.error('[DevApi] Error:', err);
            return { error: err.message };
        }
    }

    async function checkBotStatus() {
        if (!window.currentRoomCode) return;
        const data = await devApiRequest(`/api/dev/bot/status?room_code=${window.currentRoomCode}`);
        if (data && data.active_bots && data.active_bots.length > 0) {
            if (devBotStatusBadge) {
                devBotStatusBadge.textContent = "Bot Active";
                devBotStatusBadge.className = "badge badge-active";
            }
        } else {
            if (devBotStatusBadge) {
                devBotStatusBadge.textContent = "Bot Inactive";
                devBotStatusBadge.className = "badge badge-inactive";
            }
        }
    }

    if (btnDevInviteBot) {
        btnDevInviteBot.addEventListener('click', async function() {
            vibrate(10);
            if (!window.currentRoomCode) return;
            const res = await devApiRequest('/api/dev/bot/join', 'POST', {
                room_code: window.currentRoomCode,
                sid: window.currentSid
            });
            appendDevLog(`Invite Bot: ${res.message || res.error}`);
            checkBotStatus();
        });
    }

    if (btnDevRemoveBot) {
        btnDevRemoveBot.addEventListener('click', async function() {
            vibrate(10);
            if (!window.currentRoomCode) return;
            const res = await devApiRequest('/api/dev/bot/leave', 'POST', {
                room_code: window.currentRoomCode,
                sid: window.currentSid
            });
            appendDevLog(`Remove Bot: ${res.message || res.error}`);
            checkBotStatus();
        });
    }

    if (btnDevTriggerSound) {
        btnDevTriggerSound.addEventListener('click', async function() {
            vibrate(10);
            if (!window.currentRoomCode) return;
            const type = devSoundType ? devSoundType.value : 'CorrectAnswer';
            const res = await devApiRequest('/api/dev/bot/trigger_sound', 'POST', {
                room_code: window.currentRoomCode,
                type: type,
                sid: window.currentSid
            });
            appendDevLog(`Trigger Sound (${type}): ${res.message || res.error}`);
        });
    }

    devReactionBtns.forEach(btn => {
        btn.addEventListener('click', async function() {
            vibrate(10);
            if (!window.currentRoomCode) return;
            const slot = parseInt(this.dataset.slot) || 1;
            const res = await devApiRequest('/api/dev/bot/trigger_reaction', 'POST', {
                room_code: window.currentRoomCode,
                slot: slot,
                sid: window.currentSid
            });
            appendDevLog(`Trigger Bot Reaction (Slot ${slot}): ${res.message || res.error}`);
        });
    });

    if (btnDevForceRoundEnd) {
        btnDevForceRoundEnd.addEventListener('click', async function() {
            vibrate(10);
            if (!window.currentRoomCode) return;
            const res = await devApiRequest('/api/dev/bot/force_round_end', 'POST', {
                room_code: window.currentRoomCode,
                sid: window.currentSid
            });
            appendDevLog(`Force Round End: ${res.message || res.error}`);
        });
    }

    window.AppSocket.on('dev_log', function(data) {
        appendDevLog(`[${data.level.toUpperCase()}] ${data.message}`);
    });

    window.AppSocket.on('bot_ack', function(data) {
        const line = `Bot ACK: ${data.type} at ${new Date(data.received_at).toLocaleTimeString()}`;
        if (data.type === 'Random' || data.payload.slot) {
            if (devReactionAckLog) devReactionAckLog.textContent = line;
        } else {
            if (devSoundAckLog) devSoundAckLog.textContent = line;
        }
        appendDevLog(line);
    });

    window.AppSocket.on('dev_bot_joined', function(data) {
        checkBotStatus();
        appendDevLog(`Bot Joined: ${data.bot_name}`);
    });

    window.AppSocket.on('dev_bot_left', function(data) {
        checkBotStatus();
        appendDevLog(`Bot Left: ${data.bot_name}`);
    });

    window.AppSocket.on('game_over', function(data) {
        modalRoundEnded.classList.add('hidden');
        podiumContainer.innerHTML = '';

        data.leaderboard.forEach((p, idx) => {
            const div = document.createElement('div');
            let rankClass = 'podium-card';
            let trophy = '';
            if (idx === 0) { rankClass += ' rank-1'; trophy = '🥇 '; }
            else if (idx === 1) { rankClass += ' rank-2'; trophy = '🥈 '; }
            else if (idx === 2) { rankClass += ' rank-3'; trophy = '🥉 '; }

            div.className = rankClass;
            div.innerHTML = `<span>${trophy}#${idx + 1} ${p.name}</span> <span>${p.score} Poin</span>`;
            podiumContainer.appendChild(div);
        });

        if (window.isHost) {
            btnPlayAgain.classList.remove('hidden');
        } else {
            btnPlayAgain.classList.add('hidden');
        }

        modalPodium.classList.remove('hidden');
    });
});
