# MultiGuess v1.0.3 - Real-time Multiplayer Draw & Guess Web App

**Current version: 1.0.3**

MultiGuess adalah aplikasi web multiplayer real-time (game Tebak Gambar) yang dirancang khusus untuk berjalan dengan ringan di server lokal (Flask + Flask-SocketIO) di **Termux Android**. Pemain cukup menghubungkan HP mereka ke jaringan Wi-Fi LAN yang sama dan membuka URL aplikasi dari browser HP masing-masing.

Aplikasi ini dikembangkan dengan pendekatan **Mobile-First** dan memberikan **Native Android App Feel** (tanpa scroll/pull-to-refresh tidak sengaja, tanpa tap highlight, tanpa double-tap zoom, bottom sheet modal, haptic vibration API, dan layout fixed full-viewport `100dvh`).

---

## 🚀 Fitur & Peningkatan Utama (v1.0.3)

1. **Native App Feel & Haptic Feedback**:
   - Layout fixed full-viewport (`100dvh`, `overflow: hidden`, safe-area inset)
   - Bottom sheet modal, `:active` button feedback (scale 0.97)
   - `navigator.vibrate()` Haptic Feedback untuk tombol, tebakan benar, countdown, dan akhir game
   - Canvas menggunakan Pointer Events (`setPointerCapture`) dengan gesture drawing halus
   - Overlay otomatis jika HP dibuka dalam mode Landscape

2. **Inter-Round 3-2-1 Countdown**:
   - Countdown overlay visual 3-2-1 sebelum timer ronde dimulai
   - Vibrate haptic tiap pergantian angka countdown

3. **Sistem Room & Host Controls**:
   - Pembuatan room dengan kode 4 huruf kapital acak (misal: `KXQP`)
   - Normalization otomatis case & whitespace saat join room
   - Pengaturan durasi timer (60/75/90 detik) dan jumlah ronde (3/5/7 ronde) khusus Host
   - Tombol "← Kembali" saat host sendiri (membatalkan room) dan "← Keluar" saat ada pemain lain (host migration otomatis)

4. **Gameplay Loop & Gambar**:
   - Bergiliran menjadi *drawer* setiap ronde
   - *Drawer* memilih 1 dari 3 kata acak (Bahasa Indonesia)
   - Toolbar menggambar lengkap: Pilihan warna, ketebalan kuas, Hapus (Eraser), Undo, dan Hapus Semua
   - Canvas handshake (`canvas_ready`) dan stroke replay `requestAnimationFrame` untuk performa halus tanpa lag

5. **Chat & Guess System (Smart Similarity)**:
   - Sistem tebak kata terintegrasi dalam input chat
   - Smart similarity detection (`SequenceMatcher` ratio $\ge 0.7$ + Levenshtein distance $\le 2$) untuk peringatan privat **"Hampir benar!"**
   - Sensor otomatis pesan jika pemain yang sudah menebak benar mencoba membocorkan jawaban
   - Poin dinamis berdasarkan kecepatan tebakan (Maksimum 100 poin) + poin bonus untuk *drawer*

6. **Server Cache & Client IndexedDB**:
   - Server-side **Temporal Cache** (`cache/temporal/`) dan **Persistent Cache** (`cache/persistent/rooms_index.json`) dengan atomic replace
   - Client-side **IndexedDB Wrapper** (`multiguess_db`) menyimpan nama pemain dan preferensi haptic secara otomatis

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
  MultiGuess server v1.0.3
  Local:   http://127.0.0.1:5231
  Network: http://192.168.1.42:5231
  Share this URL with players on the same WiFi
  Cache dir: /path/to/cache (temporal: 0 files, persistent: 1 files)
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
│   ├── config.py             # App Constants & Version
│   ├── game_state.py         # RoomManager & Game State Logic
│   ├── words.py              # Word Bank (~150 Kata Indonesia)
│   ├── scoring.py            # Point System & Smart Similarity Matching
│   ├── cache.py              # Server Temporal & Persistent Cache
│   └── network.py            # Free Port & LAN IP Detection
├── templates/
│   └── index.html            # UI Single Page App (Bottom Sheet Modals)
├── static/
│   ├── style.css             # Native Mobile CSS (Active Scale, Safe Areas)
│   ├── app.js                # Socket.IO Event Handlers & View Switching
│   ├── canvas.js             # Canvas Manager (Pointer Events & DPR Scaling)
│   └── storage.js            # IndexedDB Wrapper & Haptic Vibration Helper
├── cache/                    # Server Auto-created Cache Folder
├── requirements.txt
└── README.md
```
