// App Global State & Socket Initialization
// [v1.0.5-OLD] const APP_VERSION = "1.0.5";
// [v2.0.2-OLD] const APP_VERSION = "2.0.2";
// [v2.0.3-OLD] const APP_VERSION = "2.0.3";
// [v2.0.4-OLD] const APP_VERSION = "2.0.4";
// [v2.0.5-OLD] const APP_VERSION = "2.0.5";
// [v2.2.0-OLD] const APP_VERSION = "2.2.0";
// [v2.2.1-OLD] const APP_VERSION = "2.2.1";
// [v2.2.2-OLD] const APP_VERSION = "2.2.2";
// [v2.2.3-OLD] const APP_VERSION = "2.2.3";
// [v2.3.0-OLD] const APP_VERSION = "2.3.0";
// [v2.4.1-OLD] const APP_VERSION = "2.4.1";
const APP_VERSION = "2.5.0";
window.AppSocket = io();
window.currentRoomCode = null;
window.isHost = false;
window.currentSid = null;
window.roomPlayerCount = 0;
window.clientToken = getOrCreateClientToken();

// Global Error Handlers (v2.0.5)
window.addEventListener('error', e => console.error('[global-error]', e.message, e.filename, e.lineno, e.error));
window.addEventListener('unhandledrejection', e => console.error('[promise-reject]', e.reason));

document.addEventListener('DOMContentLoaded', async function() {
    // Initialize Client IndexedDB Storage non-blockingly
    try {
        await DB.init();
    } catch (err) {
        console.warn('[DB] Storage init warning:', err);
    }

    // Sound Player Initialization
    try {
        SoundPlayer.init();
    } catch (err) {
        console.warn('[SoundPlayer] Init warning:', err);
    }

    // Start Sound Loader non-blockingly (do NOT await before attaching socket/UI handlers)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('nosound') === '1') {
        console.log('[init] sound disabled via ?nosound=1');
    } else {
        SoundLoader.loadSounds().catch(err => {
            console.warn('[SoundLoader] Non-blocking load exception:', err);
        });
    }

    // Canvas Init
    CanvasManager.init('game-canvas');

    // Sticker Preloader
    const stickerCache = CanvasManager.getStickerCache();
    async function preloadStickers() {
        try {
            const res = await fetch('/api/stickers');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const stickers = await res.json();
            if (Array.isArray(stickers)) {
                stickers.forEach(s => {
                    const fullPath = s.path.startsWith('/Stickers/') ? s.path : `/Stickers/${s.path}`;
                    if (!stickerCache.has(fullPath)) {
                        const img = new Image();
                        img.onload = () => {
                            CanvasManager.registerStickerImage(fullPath, img);
                        };
                        img.onerror = () => {
                            console.warn('[Stickers] Preload failed for:', fullPath);
                        };
                        img.src = fullPath;
                    }
                });
            }
        } catch (err) {
            console.warn('[Stickers] Preload sticker fetch warning:', err);
        }
    }

    preloadStickers();

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
    const btnLobbyBack = document.getElementById('btn-lobby-back');

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
            nameSpan.textContent = text ? `${username}: ${text}` : username;
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
    if (savedHaptic !== null && toggleHaptic) {
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

    if (toggleHaptic) {
        toggleHaptic.addEventListener('change', function() {
            setHapticEnabled(this.checked);
        });
    }

    async function savePlayerName() {
        const name = inputPlayerName.value.trim();
        if (name) {
            await DB.set('settings', 'player_name', name);
        }
        return name;
    }

    function formatSoundName(soundPath) {
        if (!soundPath) return null;
        let name = soundPath.split('/').pop() || soundPath;
        const underscoreIdx = name.indexOf('_');
        if (underscoreIdx !== -1 && underscoreIdx < 5) {
            name = name.substring(underscoreIdx + 1);
        }
        if (name.endsWith('.mp3')) {
            name = name.substring(0, name.length - 4);
        }
        const fullName = name;
        const shortName = name.length > 8 ? name.substring(0, 8) + '…' : name;
        return { fullName, shortName };
    }

    function updateReactionButtons(slots) {
        reactionBtns.forEach((btn, idx) => {
            const slotNum = idx + 1;
            const soundPath = slots && slots[idx] ? slots[idx] : null;
            if (soundPath) {
                btn.dataset.soundPath = soundPath;
                const formatted = formatSoundName(soundPath);
                btn.textContent = `${slotNum} ${formatted.shortName}`;
                btn.title = formatted.fullName;
            } else {
                btn.textContent = `${slotNum}`;
                btn.title = "Loading...";
            }
        });
    }

    // Reaction Buttons Event Binding
    reactionBtns.forEach(btn => {
        btn.addEventListener('click', async function() {
            vibrate(10);
            const slot = parseInt(this.dataset.slot) || 1;
            const userId = getOrCreateUserId();
            let soundPath = this.dataset.soundPath;
            if (!soundPath) {
                const userSounds = await SoundPlayer.getUserRandomSounds(userId);
                soundPath = userSounds[slot - 1];
            }

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

    // Safe Emit Helper Function (v2.0.5)
    function safeEmit(event, data) {
        const socket = window.AppSocket;
        if (socket && socket.connected) {
            console.log(`[safeEmit] ${event}`, data, { connected: true });
            socket.emit(event, data);
            return true;
        } else if (socket) {
            console.warn(`[safeEmit] socket not connected, queueing: ${event}`, data);
            showToast('Menghubungkan ke server...');
            socket.once('connect', () => {
                console.log(`[safeEmit] flushing queued: ${event}`, data);
                socket.emit(event, data);
            });
            return false;
        } else {
            console.error('[safeEmit] AppSocket instance not found');
            showToast('Gagal terhubung ke server Socket.IO');
            return false;
        }
    }

    // Event Handlers - Room Creation & Joining with Diagnostic Logs
    btnCreateRoom.addEventListener('click', async function() {
        console.log('[btn] create-room clicked');
        vibrate(10);
        try {
            const name = await savePlayerName();
            console.log('[btn] name =', JSON.stringify(name));
            if (!name) {
                showToast('Isi nama dulu ya');
                return;
            }
            console.log('[btn] socket.connected =', window.AppSocket?.connected);
            safeEmit('create_room', { player_name: name, name: name, client_token: window.clientToken });
            console.log('[emit] create_room sent OK');
        } catch (err) {
            console.error('[btn] error:', err);
            showToast('Error: ' + err.message);
        }
    });

    btnJoinRoom.addEventListener('click', async function() {
        console.log('[btn] join-room clicked');
        vibrate(10);
        try {
            const name = await savePlayerName();
            const rawCode = inputRoomCode.value.trim();
            console.log('[btn] name =', JSON.stringify(name), 'code =', JSON.stringify(rawCode));
            if (!name) {
                showToast('Isi nama dulu ya');
                return;
            }
            if (!rawCode) {
                showToast('Masukkan kode room terlebih dahulu!');
                return;
            }
            console.log('[btn] socket.connected =', window.AppSocket?.connected);
            safeEmit('join_room', { player_name: name, name: name, room_code: rawCode, client_token: window.clientToken });
            console.log('[emit] join_room sent OK');
        } catch (err) {
            console.error('[btn] error:', err);
            showToast('Error: ' + err.message);
        }
    });

    // Back / Cancel / Leave Header & Lobby Logic
    btnBackLobby.addEventListener('click', function() {
        vibrate(10);
        handleLeaveOrBackAction();
    });

    if (btnLobbyBack) {
        btnLobbyBack.addEventListener('click', function() {
            vibrate(10);
            handleLeaveOrBackAction();
        });
    }

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
        localStorage.removeItem('mg_current_room');
        document.body.classList.remove('is-drawer');
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
    const btnFill = document.getElementById('btn-fill');

    function setActiveTool(tool) {
        if (tool === 'eraser') {
            btnEraser.classList.add('active');
            if (btnFill) btnFill.classList.remove('active');
        } else if (tool === 'fill') {
            if (btnFill) btnFill.classList.add('active');
            btnEraser.classList.remove('active');
        } else { // 'brush'
            btnEraser.classList.remove('active');
            if (btnFill) btnFill.classList.remove('active');
        }
    }

    const colorPicker = document.getElementById('color-picker');
    if (colorPicker) {
        colorPicker.addEventListener('input', function() {
            colorBtns.forEach(b => b.classList.remove('active'));
            setActiveTool('brush');
            CanvasManager.setColor(this.value);
        });
    }

    colorBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            vibrate(10);
            colorBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            if (colorPicker) colorPicker.value = this.dataset.color;
            setActiveTool('brush');
            CanvasManager.setColor(this.dataset.color);
        });
    });

    if (btnFill) {
        btnFill.addEventListener('click', function() {
            vibrate(10);
            const isFillActive = (CanvasManager.getCurrentTool() === 'fill');
            if (isFillActive) {
                setActiveTool('brush');
                CanvasManager.setFillMode(false);
            } else {
                setActiveTool('fill');
                CanvasManager.setFillMode(true);
            }
        });
    }

    // Sticker Panel & Drag/Drop Placement Handler (v2.3.0)
    const btnStickerToggle = document.getElementById('btn-sticker-toggle');
    const stickerPanel = document.getElementById('sticker-panel');
    const btnCloseStickers = document.getElementById('btn-close-stickers');
    const stickerGrid = document.getElementById('sticker-grid');
    const canvasContainer = document.getElementById('canvas-container');

    if (btnStickerToggle) {
        btnStickerToggle.addEventListener('click', async function() {
            vibrate(10);
            if (!stickerPanel) return;
            const isHidden = stickerPanel.classList.contains('hidden');
            if (isHidden) {
                stickerPanel.classList.remove('hidden');
                loadStickerGrid();
            } else {
                stickerPanel.classList.add('hidden');
            }
        });
    }

    if (btnCloseStickers) {
        btnCloseStickers.addEventListener('click', function() {
            vibrate(10);
            if (stickerPanel) stickerPanel.classList.add('hidden');
        });
    }

    async function loadStickerGrid() {
        if (!stickerGrid) return;
        try {
            const res = await fetch('/api/stickers');
            const stickers = await res.json();
            stickerGrid.innerHTML = '';

            if (!stickers || stickers.length === 0) {
                stickerGrid.innerHTML = '<div class="no-stickers-msg">Belum ada sticker</div>';
                return;
            }

            stickers.forEach(s => {
                const img = document.createElement('img');
                img.className = 'sticker-thumb';
                img.src = s.path;
                img.alt = s.name;
                img.addEventListener('click', function() {
                    vibrate(10);
                    if (stickerPanel) stickerPanel.classList.add('hidden');
                    startStickerPlacement(s.path);
                });
                stickerGrid.appendChild(img);
            });
        } catch (err) {
            console.error('[Stickers] Error loading stickers:', err);
            if (stickerGrid) stickerGrid.innerHTML = '<div class="no-stickers-msg">Gagal memuat sticker</div>';
        }
    }

    // Chat Sticker Picker Handler (v2.5.0)
    const btnChatSticker = document.getElementById('btn-chat-sticker');
    const chatStickerPanel = document.getElementById('chat-sticker-panel');
    const btnCloseChatStickers = document.getElementById('btn-close-chat-stickers');
    const chatStickerGrid = document.getElementById('chat-sticker-grid');

    if (btnChatSticker) {
        btnChatSticker.addEventListener('click', function() {
            vibrate(10);
            if (!chatStickerPanel) return;
            const isHidden = chatStickerPanel.classList.contains('hidden');
            if (isHidden) {
                chatStickerPanel.classList.remove('hidden');
                loadChatStickerGrid();
            } else {
                chatStickerPanel.classList.add('hidden');
            }
        });
    }

    if (btnCloseChatStickers) {
        btnCloseChatStickers.addEventListener('click', function() {
            vibrate(10);
            if (chatStickerPanel) chatStickerPanel.classList.add('hidden');
        });
    }

    async function loadChatStickerGrid() {
        if (!chatStickerGrid) return;
        try {
            const res = await fetch('/api/stickers');
            const stickers = await res.json();
            chatStickerGrid.innerHTML = '';

            if (!stickers || stickers.length === 0) {
                chatStickerGrid.innerHTML = '<div class="no-stickers-msg">Belum ada sticker</div>';
                return;
            }

            stickers.forEach(s => {
                const img = document.createElement('img');
                img.className = 'chat-sticker-thumb';
                img.src = s.path;
                img.alt = s.name;
                img.addEventListener('click', function() {
                    vibrate(10);
                    if (chatStickerPanel) chatStickerPanel.classList.add('hidden');
                    const fileName = s.path.replace(/^\/Stickers\//, '');
                    window.AppSocket.emit('send_message', {
                        room_code: window.currentRoomCode,
                        text: '',
                        type: 'sticker',
                        sticker_path: fileName
                    });
                });
                chatStickerGrid.appendChild(img);
            });
        } catch (err) {
            console.error('[ChatStickers] Error loading chat stickers:', err);
            if (chatStickerGrid) chatStickerGrid.innerHTML = '<div class="no-stickers-msg">Gagal memuat</div>';
        }
    }

    function startStickerPlacement(stickerPath) {
        if (!canvasContainer) return;
        CanvasManager.setStickerMode(true);

        const existing = document.getElementById('sticker-overlay');
        if (existing) existing.remove();

        const parentRect = canvasContainer.getBoundingClientRect();

        let aspectRatio = 1;
        const cachedImg = CanvasManager.getStickerCache().get(stickerPath);
        if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0 && cachedImg.naturalHeight > 0) {
            aspectRatio = cachedImg.naturalWidth / cachedImg.naturalHeight;
        }

        const overlay = document.createElement('div');
        overlay.id = 'sticker-overlay';
        overlay.className = 'sticker-overlay';

        let initW = parentRect.width * 0.15;
        let initH = initW / aspectRatio;
        let initLeft = (parentRect.width - initW) / 2;
        let initTop = (parentRect.height - initH) / 2;

        overlay.style.left = `${(initLeft / parentRect.width) * 100}%`;
        overlay.style.top = `${(initTop / parentRect.height) * 100}%`;
        overlay.style.width = `${(initW / parentRect.width) * 100}%`;
        overlay.style.height = `${(initH / parentRect.height) * 100}%`;

        const img = document.createElement('img');
        img.src = stickerPath;
        img.onload = function() {
            if (img.naturalWidth && img.naturalHeight) {
                aspectRatio = img.naturalWidth / img.naturalHeight;
                const pRect = canvasContainer.getBoundingClientRect();
                const currentOverlayRect = overlay.getBoundingClientRect();
                const curW = currentOverlayRect.width;
                const newH = curW / aspectRatio;
                overlay.style.height = `${(newH / pRect.height) * 100}%`;
            }
        };

        const btnCancel = document.createElement('button');
        btnCancel.className = 'sticker-overlay-btn sticker-btn-cancel';
        btnCancel.textContent = '✕';
        btnCancel.title = 'Batal';

        const btnOk = document.createElement('button');
        btnOk.className = 'sticker-overlay-btn sticker-btn-ok';
        btnOk.textContent = '✓';
        btnOk.title = 'Selesai';

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'sticker-resize-handle';

        overlay.appendChild(btnCancel);
        overlay.appendChild(btnOk);
        overlay.appendChild(img);
        overlay.appendChild(resizeHandle);
        canvasContainer.appendChild(overlay);

        let isDragging = false;
        let isResizing = false;
        let startX, startY, initialLeft, initialTop, initialWidth, initialHeight;

        overlay.addEventListener('pointerdown', function(e) {
            if (e.target === btnOk || e.target === btnCancel) return;
            e.preventDefault();
            if (e.target === resizeHandle) {
                isResizing = true;
                resizeHandle.setPointerCapture(e.pointerId);
            } else {
                isDragging = true;
                overlay.setPointerCapture(e.pointerId);
            }
            startX = e.clientX;
            startY = e.clientY;

            const rect = overlay.getBoundingClientRect();
            const pRect = canvasContainer.getBoundingClientRect();
            initialLeft = rect.left - pRect.left;
            initialTop = rect.top - pRect.top;
            initialWidth = rect.width;
            initialHeight = rect.height;
        });

        overlay.addEventListener('pointermove', function(e) {
            if (!isDragging && !isResizing) return;
            e.preventDefault();
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const pRect = canvasContainer.getBoundingClientRect();

            if (isDragging) {
                let newLeft = initialLeft + dx;
                let newTop = initialTop + dy;

                newLeft = Math.max(0, Math.min(pRect.width - overlay.offsetWidth, newLeft));
                newTop = Math.max(0, Math.min(pRect.height - overlay.offsetHeight, newTop));

                overlay.style.left = `${(newLeft / pRect.width) * 100}%`;
                overlay.style.top = `${(newTop / pRect.height) * 100}%`;
            } else if (isResizing) {
                let newW = initialWidth + dx;
                const minW = 30;
                const maxW = pRect.width - initialLeft;
                newW = Math.max(minW, Math.min(maxW, newW));

                const isTouch = e.pointerType === 'touch';
                if (!isTouch && e.shiftKey) {
                    // Free resize on desktop with Shift key
                    let newH = initialHeight + dy;
                    newH = Math.max(20, Math.min(pRect.height - initialTop, newH));
                    overlay.style.width = `${(newW / pRect.width) * 100}%`;
                    overlay.style.height = `${(newH / pRect.height) * 100}%`;
                } else {
                    // Proportional resize (mobile & default desktop)
                    let newH = newW / aspectRatio;
                    overlay.style.width = `${(newW / pRect.width) * 100}%`;
                    overlay.style.height = `${(newH / pRect.height) * 100}%`;
                }
            }
        });

        function lockSticker() {
            const parentRect = canvasContainer.getBoundingClientRect();
            const overlayRect = overlay.getBoundingClientRect();

            const normX = (overlayRect.left - parentRect.left) / parentRect.width;
            const normY = (overlayRect.top - parentRect.top) / parentRect.height;
            const normW = overlayRect.width / parentRect.width;
            const normH = overlayRect.height / parentRect.height;

            const stroke = {
                type: 'sticker',
                x: Math.max(0, normX),
                y: Math.max(0, normY),
                w: normW,
                h: normH,
                path: stickerPath,
                rotation: 0
            };

            CanvasManager.addRemoteStroke(stroke);
            if (window.AppSocket) {
                window.AppSocket.emit('draw_stroke', { stroke: stroke, room_code: window.currentRoomCode });
            }

            overlay.remove();
            CanvasManager.setStickerMode(false);
        }

        function cancelSticker() {
            overlay.remove();
            CanvasManager.setStickerMode(false);
        }

        const handlePointerUp = function(e) {
            if (isDragging) {
                isDragging = false;
                try { overlay.releasePointerCapture(e.pointerId); } catch (err) {}
            }
            if (isResizing) {
                isResizing = false;
                try { resizeHandle.releasePointerCapture(e.pointerId); } catch (err) {}
            }
        };

        overlay.addEventListener('pointerup', handlePointerUp);
        overlay.addEventListener('pointercancel', handlePointerUp);

        btnOk.addEventListener('click', function(e) {
            e.stopPropagation();
            vibrate(10);
            lockSticker();
        });

        btnCancel.addEventListener('click', function(e) {
            e.stopPropagation();
            vibrate(10);
            cancelSticker();
        });
    }

    const btnBrushSize = document.getElementById('btn-brush-size');
    const brushSliderPanel = document.getElementById('brush-slider-panel');
    const brushSizeSlider = document.getElementById('brush-size-slider');
    const brushSizeVal = document.getElementById('brush-size-val');

    if (btnBrushSize && brushSliderPanel) {
        btnBrushSize.addEventListener('click', function(e) {
            e.stopPropagation();
            vibrate(10);
            brushSliderPanel.classList.toggle('hidden');
        });

        document.addEventListener('pointerdown', function(e) {
            if (!brushSliderPanel.classList.contains('hidden')) {
                if (!e.target.closest('#brush-slider-panel, #btn-brush-size')) {
                    brushSliderPanel.classList.add('hidden');
                }
            }
        });
    }

    if (brushSizeSlider) {
        brushSizeSlider.addEventListener('input', function() {
            const val = parseInt(this.value);
            if (brushSizeVal) brushSizeVal.textContent = val;
            CanvasManager.setLineWidth(val);
        });
    }

    btnEraser.addEventListener('click', function() {
        vibrate(10);
        const isEraserActive = (CanvasManager.getCurrentTool() === 'eraser');
        if (isEraserActive) {
            setActiveTool('brush');
            CanvasManager.setEraser(false);
        } else {
            setActiveTool('eraser');
            CanvasManager.setEraser(true);
        }
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

    if (window.VoiceChat && typeof window.VoiceChat.initSocketListeners === 'function') {
        window.VoiceChat.initSocketListeners();
    }

    window.AppSocket.on('sound_config_updated', function() {
        console.log('[Socket] sound_config_updated received, reloading SoundPlayer config');
        if (typeof SoundPlayer !== 'undefined' && SoundPlayer.reloadSoundConfig) {
            SoundPlayer.reloadSoundConfig();
        }
    });

    // Socket.IO Incoming Event Receivers
    window.AppSocket.on('connect', function() {
        window.currentSid = window.AppSocket.id;
        const roomCode = window.currentRoomCode || localStorage.getItem('mg_current_room');
        if (window.clientToken) {
            safeEmit('restore_session', {
                client_token: window.clientToken,
                room_code: roomCode
            });
        }
    });

    window.AppSocket.on('session_restored', function(data) {
        window.currentRoomCode = data.room_code;
        window.isHost = data.is_host;
        localStorage.setItem('mg_current_room', data.room_code);

        displayRoomCode.textContent = window.currentRoomCode;
        if (lobbyRoomCode) lobbyRoomCode.textContent = window.currentRoomCode;

        screenHome.classList.add('hidden');
        screenGame.classList.remove('hidden');
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
        } else if (data.reason === 'room_full') {
            showToast(data.message || 'Room sudah penuh (maksimal 8 pemain).');
        } else {
            showToast('Gagal bergabung ke room.');
        }
    });

    window.AppSocket.on('room_cancelled', function() {
        showToast('Room telah dibatalkan.');
        document.body.classList.remove('is-drawer');
        resetToHome();
    });

    window.AppSocket.on('left_room_success', function() {
        document.body.classList.remove('is-drawer');
        resetToHome();
    });

    window.AppSocket.on('room_joined', function(data) {
        window.currentRoomCode = data.room_code;
        window.isHost = data.is_host;
        localStorage.setItem('mg_current_room', data.room_code);

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
            li.innerHTML = `<span>${p.name} ${p.is_host ? '👑 (Host)' : ''} ${p.disconnected ? '⚡ (Terputus)' : ''}</span> <span>${p.score} pts</span>`;
            lobbyPlayerList.appendChild(li);
        });

        leaderboardList.innerHTML = '';
        data.players.forEach(p => {
            const div = document.createElement('div');
            let classes = 'leaderboard-item';
            if (p.sid === data.current_drawer) classes += ' drawer';
            if (p.has_guessed) classes += ' guessed';
            if (p.disconnected) classes += ' disconnected';
            div.className = classes;

            let icon = '';
            if (p.sid === data.current_drawer) icon = '✏️ ';
            if (p.has_guessed) icon = '✅ ';
            if (p.disconnected) icon += '⚡ ';

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
            document.body.classList.remove('is-drawer');
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
            document.body.classList.remove('is-drawer');
        } else if (data.state === 'PLAYING') {
            modalLobby.classList.add('hidden');
            modalWordSelect.classList.add('hidden');
            modalRoundEnded.classList.add('hidden');
            modalPodium.classList.add('hidden');
            countdownOverlay.classList.add('hidden');

            const isDrawer = (window.currentSid === data.current_drawer);
            CanvasManager.setDrawerMode(isDrawer);
            document.body.classList.toggle('is-drawer', isDrawer);

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
        if (wordSelectTimer) {
            clearInterval(wordSelectTimer);
            wordSelectTimer = null;
        }
        countdownOverlay.classList.add('hidden');
        const mySid = window.currentSid || (window.AppSocket ? window.AppSocket.id : null);
        const isDrawer = (mySid === data.drawer_sid);

        console.log('[drawer-mode]', isDrawer, data.drawer_sid);
        CanvasManager.setDrawerMode(isDrawer);
        document.body.classList.toggle('is-drawer', isDrawer);

        if (isDrawer) {
            if (drawingToolbar) drawingToolbar.classList.remove('hidden');
            turnStatusText.textContent = "Giliran kamu menggambar!";
        } else {
            if (drawingToolbar) drawingToolbar.classList.add('hidden');
            turnStatusText.textContent = "Tebak gambarnya:";
        }
    });

    window.AppSocket.on('reaction_assignments', function(data) {
        if (data && data.slots) {
            updateReactionButtons(data.slots);
        }
    });

    window.AppSocket.on('round_announce', function(data) {
        const roundAnnounceOverlay = document.getElementById('round-announce-overlay');
        const roundAnnounceText = document.getElementById('round-announce-text');
        if (roundAnnounceOverlay && roundAnnounceText) {
            roundAnnounceText.textContent = `Ronde ${data.round} dari ${data.total_rounds}`;
            roundAnnounceOverlay.classList.remove('hidden');
            setTimeout(() => {
                roundAnnounceOverlay.classList.add('hidden');
            }, 2000);
        }
    });

    window.AppSocket.on('next_drawer', function(data) {
        const nextDrawerBadge = document.getElementById('next-drawer-badge');
        if (nextDrawerBadge) {
            if (data.is_last) {
                nextDrawerBadge.textContent = 'Last round';
            } else if (data.name) {
                nextDrawerBadge.textContent = `Next: ${data.name}`;
            }
            nextDrawerBadge.classList.remove('hidden');
        }
    });

    const btnRerollWords = document.getElementById('btn-reroll-words');
    const rerollCountText = document.getElementById('reroll-count-text');

    let wordSelectTimer = null;

    window.AppSocket.on('word_select_timer_start', function(data) {
        if (wordSelectTimer) {
            clearInterval(wordSelectTimer);
            wordSelectTimer = null;
        }
        const mySid = window.currentSid || (window.AppSocket ? window.AppSocket.id : null);
        if (data.drawer_sid === mySid) return;

        function updateCountdown() {
            const elapsed = Date.now() / 1000 - data.started_at;
            const remaining = Math.max(0, Math.min(data.duration, Math.floor(data.duration - elapsed)));
            if (turnStatusText) {
                turnStatusText.textContent = `${data.drawer_name} sedang memilih kata: ${remaining}s...`;
            }
            if (remaining <= 0) {
                if (wordSelectTimer) {
                    clearInterval(wordSelectTimer);
                    wordSelectTimer = null;
                }
            }
        }

        updateCountdown();
        wordSelectTimer = setInterval(updateCountdown, 1000);
    });

    window.AppSocket.on('word_select_timer_cancel', function() {
        if (wordSelectTimer) {
            clearInterval(wordSelectTimer);
            wordSelectTimer = null;
        }
    });

    if (btnRerollWords) {
        btnRerollWords.addEventListener('click', function() {
            vibrate(10);
            if (window.currentRoomCode) {
                window.AppSocket.emit('reroll_words', { room_code: window.currentRoomCode });
            }
        });
    }

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

        const rerollCount = data.reroll_count || 0;
        if (rerollCountText) {
            rerollCountText.textContent = `Reroll: ${rerollCount}/2`;
        }
        if (btnRerollWords) {
            btnRerollWords.disabled = (rerollCount >= 2);
        }

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
        console.log('[SoundDebug] play_sound received:', payload);
        if (!payload || !payload.type) return;
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
        } else {
            console.warn('[socket] Unrecognized sound type:', type, 'attempting default SoundPlayer.play()');
            vibrate(20);
            SoundPlayer.play(type);
        }
    });

    window.AppSocket.on('chat_message', function(data) {
        const div = document.createElement('div');
        div.className = `chat-msg ${data.type}`;

        if (data.type === 'sticker') {
            const cleanPath = (data.sticker_path || '').replace(/^\/Stickers\//, '');
            div.className = 'chat-msg sticker';
            div.innerHTML = `<span class="chat-sender">${data.sender}:</span><img src="/Stickers/${cleanPath}" class="chat-sticker" alt="sticker">`;
        } else if (data.type === 'system') {
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
        document.body.classList.remove('is-drawer');

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
        document.body.classList.remove('is-drawer');

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
