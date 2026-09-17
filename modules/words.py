import random
import os
import json

# Fallback word list if JSON is missing/corrupted
FALLBACK_WORD_BANK = [
    "kucing", "anjing", "gajah", "harimau", "kelinci", "burung", "ikan", "jerapah",
    "monyet", "ular", "kuda", "sapi", "kambing", "ayam", "bebek", "paus", "hiu",
    "buaya", "singa", "panda", "komodo", "flamingo", "penguin", "kupu-kupu", "lebah",
    "semut", "laba-laba", "katak", "kura-kura", "kepiting", "udang", "cumi-cumi",
    "meja", "kursi", "lemari", "pintu", "jendela", "lampu", "cermin", "jam dinding",
    "televisi", "kulkas", "kipas angin", "telepon", "komputer", "laptop", "sepatu",
    "sandal", "topi", "baju", "celana", "kacamata", "tas", "payung", "dompet",
    "sikat gigi", "handuk", "sabun", "piring", "sendok", "garpu", "gelas", "pisau",
    "wajan", "kompor", "botol", "buku", "pensil", "pulpen", "penghapus", "penggaris",
    "gunting", "gitar", "drum", "mobil", "sepeda", "motor", "pesawat", "kapal",
    "kereta api", "helikopter", "roket", "bus", "truk",
    "nasi goreng", "bakso", "mie ayam", "sate", "rendang", "gado-gado", "soto",
    "martabak", "pisang goreng", "es krim", "cokelat", "roti", "donat", "pizza",
    "burger", "kopi", "teh", "susu", "jus alpukat", "kelapa muda",
    "gunung", "pantai", "sungai", "laut", "hutan", "air terjun", "danau", "gua",
    "awan", "matahari", "bulan", "bintang", "pelangi", "hujan", "salju", "rumah",
    "sekolah", "rumah sakit", "pasar", "bandara", "stasiun", "taman", "candi", "istana",
    "dokter", "guru", "polisi", "tentara", "koki", "pilot", "nelayan", "petani",
    "pemadam kebakaran", "pelukis", "penyanyi", "memancing", "berenang", "membaca",
    "tidur", "menari", "berkemah", "memasak", "berlari"
]

def load_words():
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'words.json')
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict) and 'words' in data and len(data['words']) > 0:
                    return data['words']
        except Exception as e:
            print(f"[Words] Failed to load words.json: {e}")
    return list(FALLBACK_WORD_BANK)

WORD_BANK = load_words()

def get_pool_size():
    return len(load_words())

def pick_three_words(exclude=None):
    current_words = load_words()
    if exclude is None:
        exclude = set()
    else:
        exclude = set(exclude)

    available = [w for w in current_words if w not in exclude]

    if len(available) < 3:
        # Reset exclude as pool is depleted
        if isinstance(exclude, set):
            exclude.clear()
        available = list(current_words)

    return random.sample(available, 3)
