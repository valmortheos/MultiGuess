<!-- [v1.0.5-OLD] # MultiGuess v1.0.5 - Real-time Multiplayer Draw & Guess Web App -->
<!-- [v2.0.2-OLD] # MultiGuess v2.0.2 - Real-time Multiplayer Draw & Guess Web App -->
<!-- [v2.0.3-OLD] # MultiGuess v2.0.3 - Real-time Multiplayer Draw & Guess Web App -->
# MultiGuess v2.0.4 - Real-time Multiplayer Draw & Guess Web App

<!-- [v1.0.5-OLD] **Current version: 1.0.5** -->
<!-- [v2.0.2-OLD] **Current version: 2.0.2** -->
<!-- [v2.0.3-OLD] **Current version: 2.0.3** -->
**Current version: 2.0.4**

## 🤖 Untuk AI Agent
- Silakan lihat [AGENTS.md](AGENTS.md) untuk aturan pengubahan kode dan proteksi folder.
- Folder `/HistoryRepo` adalah **READ-ONLY** dan terproteksi. Dilarang memodifikasi, menghapus, atau mengubah file di dalam `/HistoryRepo`.

MultiGuess adalah aplikasi web multiplayer real-time (game Tebak Gambar) yang dirancang khusus untuk berjalan dengan ringan di server lokal (Flask + Flask-SocketIO) di **Termux Android**. Pemain cukup menghubungkan HP mereka ke jaringan Wi-Fi LAN yang sama dan membuka URL aplikasi dari browser HP masing-masing.

Aplikasi ini dikembangkan dengan pendekatan **Mobile-First** dan memberikan **Native Android App Feel** (tanpa scroll/pull-to-refresh tidak sengaja, tanpa tap highlight, tanpa double-tap zoom, bottom sheet modal, haptic vibration API, dan layout fixed full-viewport `100dvh`).

---

<!-- [v1.0.5-OLD] ## 🚀 Fitur & Peningkatan Utama (v1.0.5) -->
<!-- [v2.0.2-OLD] ## 🚀 Fitur & Peningkatan Utama (v2.0.2) -->
<!-- [v2.0.3-OLD] ## 🚀 Fitur & Peningkatan Utama (v2.0.3) -->
## 🚀 Fitur & Peningkatan Utama (v2.0.4)

0. **Development Mode & Bot Virtual (v2.0.3 Baru)**:
   - Host dapat membuka **Development Panel** ("🛠 Dev") di header room untuk menguji fitur sound, reaction, dan flow round secara otomatis tanpa butuh multiple HP fisik.
   - Endpoint REST `/api/dev/bot/*` dilindungi flag `DEV_MODE` (default active `1`) dan validasi host `X-Socket-ID`.
   - Di lingkungan production (seperti Cloudflare Tunnel/Public Access), set environment variable `MG_DEV_MODE=0` untuk menonaktifkan endpoint dev mode (mengembalikan status HTTP 403 Forbidden).

1. **Moderasi Kata Kasar & Censor Overlay (v2.0.2 Baru)**:
   - Filter profanity Bahasa Indonesia, Sunda, Jawa, dan Inggris dengan normalisasi anti-bypass (leetspeak, symbol stripping, repeat collapsing, word boundary).
   - Penolakan otomatis nama pemain yang mengandung kata kasar.
   - Sensor otomatis chat (`"[pesan disensor]"`), broadcast sound `Censored`, dan overlay melayang menampilkan teks asli pengirim di atas canvas.
   - Logging otomatis moderasi di `cache/persistent/moderation_log.json`.

2. **Sound Routing & Vibrate API Fix (v2.0.2 Baru)**:
   - Routing suara presisi per-event: Targeted (`CorrectAnswer`, `WrongAnswer`, `FailedRound`, `YourTurn`) & Broadcast (`WinnerScore`, `Censored`, `Random`, `TimeRemaining` ≤20s).
   - Synchronized Vibrate Feedback API di semua device client dengan setting haptic per-device yang disimpan di IndexedDB.

3. **Tombol Reaction & Overlay Melayang (v2.0.2 Baru)**:
   - 3 tombol reaction bulat minimalis berangka (1, 2, 3) tanpa emoji dengan 3 sound acak persisten per user.
   - Non-interactive floating overlay melayang di atas canvas saat sound `Random` atau `Censored` diputar.

4. **Native App Feel & Haptic Feedback**:
   - Layout fixed full-viewport (`100dvh`, `overflow: hidden`, safe-area inset)
   - Bottom sheet modal, `:active` button feedback (scale 0.97)
   - `navigator.vibrate()` Haptic Feedback untuk tombol, tebakan benar, countdown, dan akhir game
   - Canvas menggunakan Pointer Events (`setPointerCapture`) dengan gesture drawing halus
   - Overlay otomatis jika HP dibuka dalam mode Landscape

2. **Sound System Preloader & Playback (v1.0.5 Baru)**:
   - Client preloader full-screen dengan progress %, speed (MB/s), ETA, dan tombol skip
   - IndexedDB store (`multiguess_db` v2) menyimpan file mp3 lokal agar reload instan
   - Web Audio API (`AudioContext`) latency rendah dengan unlock saat interaksi pertama
   - Efek suara untuk Tebakan Benar, Tebakan Salah, Chat Censor, Ronde Gagal, Countdown <10s, Podium Pemenang, Giliran Menggambar, dan Random User Reactions (3 sound acak unik per user)
   - Setting toggle "Sound effects" di lobby modal

3. **Presisi Drawing & Synchronized Drawer Toolbar (v1.0.5 Fix)**:
   - Fixed 4:3 canvas aspect ratio di semua layar dengan koordinat ternormalisasi (0-1)
   - Toolbar gambar dan canvas drawer mode dipastikan selalu aktif untuk drawer di setiap pergantian ronde

4. **Inter-Round 3-2-1 Countdown**:
   - Countdown overlay visual 3-2-1 sebelum timer ronde dimulai
   - Vibrate haptic tiap pergantian angka countdown

5. **Sistem Room & Host Controls**:
   - Pembuatan room dengan kode 4 huruf kapital acak (misal: `KXQP`)
   - Normalization otomatis case & whitespace saat join room
   - Pengaturan durasi timer (60/75/90 detik) dan jumlah ronde (3/5/7 ronde) khusus Host
   - Tombol "← Kembali" saat host sendiri (membatalkan room) dan "← Keluar" saat ada pemain lain (host migration otomatis)

6. **Gameplay Loop & Gambar**:
   - Bergiliran menjadi *drawer* setiap ronde
   - *Drawer* memilih 1 dari 3 kata acak (Bahasa Indonesia)
   - Toolbar menggambar lengkap: Pilihan warna, ketebalan kuas, Hapus (Eraser), Undo, dan Hapus Semua
   - Canvas handshake (`canvas_ready`) dan stroke replay `requestAnimationFrame` untuk performa halus tanpa lag

7. **Chat & Guess System (Smart Similarity)**:
   - Sistem tebak kata terintegrasi dalam input chat
   - Smart similarity detection (`SequenceMatcher` ratio $\ge 0.7$ + Levenshtein distance $\le 2$) untuk peringatan privat **"Hampir benar!"**
   - Sensor otomatis pesan jika pemain yang sudah menebak benar mencoba membocorkan jawaban
   - Poin dinamis berdasarkan kecepatan tebakan (Maksimum 100 poin) + poin bonus untuk *drawer*

8. **Server Cache & Client IndexedDB**:
   - Server-side **Temporal Cache** (`cache/temporal/`) dan **Persistent Cache** (`cache/persistent/rooms_index.json`, `cache/persistent/sound_manifest.json`) dengan atomic replace
   - Client-side **IndexedDB Wrapper** (`multiguess_db` v2) menyimpan nama pemain, preferensi audio/haptic, dan sound mp3

---

## 📱 Cara Run di Termux Android

### 1. Prasyarat & Instalasi
Buka Termux di HP Android kamu, lalu jalankan perintah berikut:

```bash
# Update paket Termux dan install python jika belum ada
pkg update && pkg install python -y

# Clone / masuk ke folder project
cd multiguess

# Install dependencies (Flask & Flask-SocketIO)
pip install -r requirements.txt
```

### 2. Jalankan Aplikasi
Cukup jalankan perintah berikut (Zero-Config):

```bash
python app.py
# atau
python *.py
```

Setelah server berjalan, console akan menampilkan banner informasi port, URL LAN, dan status cache:

```
============================================
  MultiGuess server v2.0.4
  Local:   http://127.0.0.1:5231
  Network: http://192.168.1.42:5231
  Share this URL with players on the same WiFi
  Cache dir: /path/to/cache (temporal: 0 files, persistent: 2 files)
============================================
```

### 3. Cara Akses dari HP Lain
1. Pastikan semua HP terhubung ke **jaringan Wi-Fi / Hotspot yang sama**.
2. Salin atau ketik URL **Network** (contoh: `http://192.168.1.42:5231`) di browser HP masing-masing pemain (Chrome, Safari, Firefox, dll).
3. Pemain pertama klik **Buat Room Baru**, lalu bagikan kode room 4 huruf ke pemain lainnya untuk **Join Room**.

---

## 🛠️ Struktur File Modular

```
multiguess/
├── app.py                    # Main Entry Point (SATU-SATUNYA .py di root)
├── modules/                  # Python Modular Backend
│   ├── __init__.py
│   ├── config.py             # App Constants & Version (v1.0.5)
│   ├── game_state.py         # RoomManager & Game State Logic
│   ├── sound_manifest.py     # Sound Manifest & SHA256 Hash Indexing (v1.0.5)
│   ├── words.py              # Word Bank (~150 Kata Indonesia)
│   ├── scoring.py            # Point System & Smart Similarity Matching
│   ├── cache.py              # Server Temporal & Persistent Cache
│   └── network.py            # Free Port & LAN IP Detection
├── Sound/                    # MP3 Audio Effects Folder
├── templates/
│   └── index.html            # UI Single Page App (Bottom Sheet Modals + Sound Loader)
├── static/
│   ├── style.css             # Native Mobile CSS (Fixed 4:3 Aspect Ratio + Loader UI)
│   ├── app.js                # Socket.IO Event Handlers & View Switching (v1.0.5)
│   ├── canvas.js             # Canvas Manager (Normalized Coords 0-1 & Pointer Events)
│   ├── sound-loader.js       # Preloader & Progress Metrics (v1.0.5)
│   ├── sound-player.js       # Web Audio API Sound System (v1.0.5)
│   └── storage.js            # IndexedDB Wrapper v2 & User UUID Helper
├── cache/                    # Server Auto-created Cache Folder
├── requirements.txt
└── README.md
```
