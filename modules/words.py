import random
import statistics
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

def pick_three_words(exclude=None, stats=None):
    current_words = load_words()
    if exclude is None:
        exclude = set()
    else:
        exclude = set(exclude)

    available = [w for w in current_words if w not in exclude]

    if len(available) < 3:
        if isinstance(exclude, set):
            exclude.clear()
        available = list(current_words)

    words_used = stats.get('words_used', {}) if stats else {}
    words_picked_total = stats.get('words_picked_total', 0) if stats else 0

    if not stats or words_picked_total < 5 or not words_used:
        return random.sample(available, 3)

    used_counts = [words_used.get(w, 0) for w in available]
    med = statistics.median(used_counts) if used_counts else 0

    weights = [max(1, med - words_used.get(w, 0) + 1) for w in available]

    chosen = []
    pool_words = list(available)
    pool_weights = list(weights)

    for _ in range(3):
        if not pool_words:
            break
        selected = random.choices(pool_words, weights=pool_weights, k=1)[0]
        chosen.append(selected)
        idx = pool_words.index(selected)
        pool_words.pop(idx)
        pool_weights.pop(idx)

    return chosen
