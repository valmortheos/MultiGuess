// App Global State & Socket Initialization
window.AppSocket = io();
window.currentRoomCode = null;
window.isHost = false;
window.currentSid = null;

document.addEventListener('DOMContentLoaded', function() {
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

    // Modals
    const modalLobby = document.getElementById('modal-lobby');
    const lobbyRoomCode = document.getElementById('lobby-room-code');
    const hostSettings = document.getElementById('host-settings');
    const settingTimer = document.getElementById('setting-timer');
    const settingRounds = document.getElementById('setting-rounds');
    const lobbyPlayerList = document.getElementById('lobby-player-list');
    const btnStartGame = document.getElementById('btn-start-game');
    const waitingHostMsg = document.getElementById('waiting-host-msg');

    const modalWordSelect = document.getElementById('modal-word-select');
    const wordCardsContainer = document.getElementById('word-cards-container');

    const modalRoundEnded = document.getElementById('modal-round-ended');
    const revealWordDisplay = document.getElementById('reveal-word-display');
    const roundSummaryList = document.getElementById('round-summary-list');

    const modalPodium = document.getElementById('modal-podium');
    const podiumContainer = document.getElementById('podium-container');
    const btnPlayAgain = document.getElementById('btn-play-again');
    const btnExitPodium = document.getElementById('btn-exit-podium');

    // Save Name in LocalStorage
    if (localStorage.getItem('multiguess_player_name')) {
        inputPlayerName.value = localStorage.getItem('multiguess_player_name');
    }

    function savePlayerName() {
        const name = inputPlayerName.value.trim();
        if (name) {
            localStorage.setItem('multiguess_player_name', name);
        }
        return name;
    }

    // Event Handlers - Room Creation & Joining
    btnCreateRoom.addEventListener('click', function() {
        const name = savePlayerName();
        if (!name) {
            alert('Masukkan nama kamu terlebih dahulu!');
            return;
        }
        window.AppSocket.emit('create_room', { player_name: name });
    });

    btnJoinRoom.addEventListener('click', function() {
        const name = savePlayerName();
        const code = inputRoomCode.value.trim().toUpperCase();
        if (!name) {
            alert('Masukkan nama kamu terlebih dahulu!');
            return;
        }
        if (code.length !== 4) {
            alert('Kode room harus 4 huruf!');
            return;
        }
        window.AppSocket.emit('join_room', { player_name: name, room_code: code });
    });

    btnLeave.addEventListener('click', function() {
        if (confirm('Apakah kamu yakin ingin keluar dari room?')) {
            if (window.currentRoomCode) {
                window.AppSocket.emit('leave_room', { room_code: window.currentRoomCode });
            }
            location.reload();
        }
    });

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
        if (window.isHost && window.currentRoomCode) {
            window.AppSocket.emit('start_game', { room_code: window.currentRoomCode });
        }
    });

    // Toolbar Event Listeners
    colorBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            colorBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            CanvasManager.setColor(this.dataset.color);
        });
    });

    selectBrushSize.addEventListener('change', function() {
        CanvasManager.setLineWidth(parseInt(this.value));
    });

    btnEraser.addEventListener('click', function() {
        CanvasManager.setEraser(true);
    });

    btnUndo.addEventListener('click', function() {
        window.AppSocket.emit('undo_stroke', { room_code: window.currentRoomCode });
    });

    btnClear.addEventListener('click', function() {
        window.AppSocket.emit('clear_canvas', { room_code: window.currentRoomCode });
    });

    // Leaderboard Toggle
    leaderboardToggle.addEventListener('click', function() {
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
        if (window.isHost && window.currentRoomCode) {
            window.AppSocket.emit('play_again', { room_code: window.currentRoomCode });
            modalPodium.classList.add('hidden');
        }
    });

    btnExitPodium.addEventListener('click', function() {
        location.reload();
    });

    // Socket.IO Incoming Event Receivers
    window.AppSocket.on('connect', function() {
        window.currentSid = window.AppSocket.id;
    });

    window.AppSocket.on('error_message', function(data) {
        alert(data.message);
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
    });

    window.AppSocket.on('room_updated', function(data) {
        window.currentRoomCode = data.room_code;
        window.isHost = (window.currentSid === data.host_sid);

        displayRoundBadge.textContent = `Ronde ${data.current_round}/${data.total_rounds}`;
        playerCount.textContent = data.players.length;

        // Update Host Controls state
        if (window.isHost && data.state === 'LOBBY') {
            hostSettings.classList.remove('hidden');
            btnStartGame.classList.remove('hidden');
            waitingHostMsg.classList.add('hidden');
        } else if (!window.isHost && data.state === 'LOBBY') {
            hostSettings.classList.add('hidden');
            btnStartGame.classList.add('hidden');
            waitingHostMsg.classList.remove('hidden');
        }

        // Update Lobby Player List
        lobbyPlayerList.innerHTML = '';
        data.players.forEach(p => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${p.name} ${p.is_host ? '👑 (Host)' : ''}</span> <span>${p.score} pts</span>`;
            lobbyPlayerList.appendChild(li);
        });

        // Update Dynamic Leaderboard Bar
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

        // State Transitions
        if (data.state === 'LOBBY') {
            modalLobby.classList.remove('hidden');
            modalWordSelect.classList.add('hidden');
            modalRoundEnded.classList.add('hidden');
            modalPodium.classList.add('hidden');
            turnStatusText.textContent = "Menunggu host memulai...";
            wordMaskDisplay.textContent = "";
            drawingToolbar.classList.add('hidden');
            CanvasManager.setDrawerMode(false);
        } else if (data.state === 'SELECTING_WORD') {
            modalLobby.classList.add('hidden');
            modalRoundEnded.classList.add('hidden');
            modalPodium.classList.add('hidden');
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

            const isDrawer = (window.currentSid === data.current_drawer);
            CanvasManager.setDrawerMode(isDrawer);

            if (isDrawer) {
                drawingToolbar.classList.remove('hidden');
                turnStatusText.textContent = "Giliran kamu menggambar!";
            } else {
                drawingToolbar.classList.add('hidden');
                turnStatusText.textContent = `${data.current_drawer_name} sedang menggambar:`;
                wordMaskDisplay.textContent = data.masked_word;
            }
        }
    });

    window.AppSocket.on('choose_word_prompt', function(data) {
        wordCardsContainer.innerHTML = '';
        data.words.forEach(word => {
            const btn = document.createElement('button');
            btn.className = 'word-card';
            btn.textContent = word;
            btn.addEventListener('click', function() {
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

    window.AppSocket.on('chat_message', function(data) {
        const div = document.createElement('div');
        div.className = `chat-msg ${data.type}`;

        if (data.type === 'system') {
            div.textContent = data.text;
        } else if (data.type === 'correct') {
            div.textContent = data.text;
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
        toastHampirBenar.classList.remove('hidden');
        setTimeout(() => {
            toastHampirBenar.classList.add('hidden');
        }, 2000);
    });

    window.AppSocket.on('turn_ended', function(data) {
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
