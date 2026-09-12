# MultiGuess - Real-time Multiplayer Draw & Guess Web App

MultiGuess adalah aplikasi web multiplayer real-time (game Tebak Gambar) yang dirancang khusus untuk berjalan dengan ringan di server lokal (Flask + Flask-SocketIO) di **Termux Android**. Pemain cukup menghubungkan HP mereka ke jaringan Wi-Fi LAN yang sama dan membuka URL aplikasi dari browser HP masing-masing.

Aplikasi ini dikembangkan dengan pendekatan **Mobile-First** dan memberikan **Native Android App Feel** (tanpa scroll/pull-to-refresh tidak sengaja, tanpa tap highlight, tanpa double-tap zoom, dan layout fixed full-viewport `100dvh`).

---

## 🚀 Fitur Utama

1. **Native App Feel**:
   - Layout fixed full-viewport (`100dvh`, `overflow: hidden`)
   - Canvas menggunakan Pointer Events (`setPointerCapture`) dengan gesture drawing halus
   - Cegah double-tap zoom, pull-to-refresh, dan selection tidak sengaja
   - Overlay otomatis jika HP dibuka dalam mode Landscape

2. **Sistem Room**:
   - Pembuatan room dengan kode 4 huruf kapital acak (misal: `KXQP`)
   - Pengaturan durasi timer (60/75/90 detik) dan jumlah ronde (3/5/7 ronde) khusus Host
   - Minimal 2 pemain untuk memulai permainan

3. **Gameplay Loop & Gambar**:
   - Bergiliran menjadi *drawer* setiap ronde
   - *Drawer* memilih 1 dari 3 kata acak (Bahasa Indonesia)
   - Toolbar menggambar lengkap: Pilihan warna, ketebalan kuas, Hapus (Eraser), Undo, dan Hapus Semua
   - Replay stroke canvas real-time dan sinkronisasi otomatis untuk late-joiner/reconnect

4. **Chat & Guess System**:
   - Sistem tebak kata terintegrasi dalam input chat
   - Deteksi tebakan privat **"Hampir benar!"** jika beda 1-2 huruf (Levenshtein distance ≤ 2)
   - Sensor otomatis pesan jika pemain yang sudah menebak benar mencoba membocorkan jawaban
   - Poin dinamis berdasarkan kecepatan tebakan (Maksimum 100 poin) + poin bonus untuk *drawer*

5. **Live Leaderboard & Podium**:
   - Papan skor live dengan status indikator giliran gambar (✏️) dan tebakan benar (✅)
   - Modal Podium akhir game (Juara 1, 2, 3) + tombol "Main Lagi" khusus Host

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
```

Setelah server berjalan, console akan menampilkan banner informasi port dan URL LAN:

```
============================================
  MultiGuess server is running!
  Local:   http://127.0.0.1:5231
  Network: http://192.168.1.42:5231
  Share this URL with players on the same WiFi
============================================
```

### 3. Cara Akses dari HP Lain
1. Pastikan semua HP terhubung ke **jaringan Wi-Fi / Hotspot yang sama**.
2. Salin atau ketik URL **Network** (contoh: `http://192.168.1.42:5231`) di browser HP masing-masing pemain (Chrome, Safari, Firefox, dll).
3. Pemain pertama klik **Buat Room Baru**, lalu bagikan kode room 4 huruf ke pemain lainnya untuk **Join Room**.

---

## 🛠️ Struktur File

```
multiguess/
├── app.py              # Server Flask + Socket.IO + Game Logic + Word Bank
├── templates/
│   └── index.html      # UI Single Page App
├── static/
│   ├── style.css       # Native App Styling (Mobile-first, CSS variables)
│   ├── app.js          # Socket.IO Event Handler + Game State Management
│   └── canvas.js       # Pointer Event Canvas Manager
├── requirements.txt    # Flask & Flask-SocketIO dependencies
└── README.md           # Panduan penggunaan
```

---

## 💡 Troubleshooting Termux

- **Tidak bisa diakses dari HP lain?**
  - Pastikan HP server dan HP pemain berada dalam satu Wi-Fi/Hotspot yang sama.
  - Jika menggunakan Mobile Hotspot HP Android server, gunakan IP LAN hotspot yang tertera pada banner console.
- **Port Error?**
  - Application secara otomatis mencari port kosong di rentang `5000-9000` melalui socket test, sehingga tidak akan mengalami error *Port in use*.
