import random

WORD_BANK = [
    # Hewan (Animals)
    "kucing", "anjing", "gajah", "harimau", "kelinci", "burung", "ikan", "jerapah",
    "monyet", "ular", "kuda", "sapi", "kambing", "ayam", "bebek", "paus", "hiu",
    "buaya", "singa", "panda", "komodo", "flamingo", "penguin", "kupu-kupu", "lebah",
    "semut", "laba-laba", "katak", "kura-kura", "kepiting", "udang", "cumi-cumi",
    # Benda (Objects)
    "meja", "kursi", "lemari", "pintu", "jendela", "lampu", "cermin", "jam dinding",
    "televisi", "kulkas", "kipas angin", "telepon", "komputer", "laptop", "sepatu",
    "sandal", "topi", "baju", "celana", "kacamata", "tas", "payung", "dompet",
    "sikat gigi", "handuk", "sabun", "piring", "sendok", "garpu", "gelas", "pisau",
    "wajan", "kompor", "botol", "buku", "pensil", "pulpen", "penghapus", "penggaris",
    "gunting", "gitar", "drum", "mobil", "sepeda", "motor", "pesawat", "kapal",
    "kereta api", "helikopter", "roket", "bus", "truk",
    # Makanan & Minuman (Food & Drink)
    "nasi goreng", "bakso", "mie ayam", "sate", "rendang", "gado-gado", "soto",
    "martabak", "pisang goreng", "es krim", "cokelat", "roti", "donat", "pizza",
    "burger", "kopi", "teh", "susu", "jus alpukat", "kelapa muda",
    # Tempat & Alam (Places & Nature)
    "gunung", "pantai", "sungai", "laut", "hutan", "air terjun", "danau", "gua",
    "awan", "matahari", "bulan", "bintang", "pelangi", "hujan", "salju", "rumah",
    "sekolah", "rumah sakit", "pasar", "bandara", "stasiun", "taman", "candi", "istana",
    # Profesi & Aktivitas (Professions & Activities)
    "dokter", "guru", "polisi", "tentara", "koki", "pilot", "nelayan", "petani",
    "pemadam kebakaran", "pelukis", "penyanyi", "memancing", "berenang", "membaca",
    "tidur", "menari", "berkemah", "memasak", "berlari"
]

def pick_three_words():
    return random.sample(WORD_BANK, 3)
