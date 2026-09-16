import re
import os
import json
import time
import unicodedata

# Profanity word set
PROFANITY_LIST = [
    # Bahasa Indonesia
    'anjing', 'anjir', 'anjay', 'asu', 'babi', 'bangsat', 'kampret',
    'monyet', 'tolol', 'goblok', 'bego', 'dungu', 'gila', 'kontol',
    'memek', 'ngentot', 'peli', 'jembut', 'pepek', 'pantek', 'peler',

    # Bahasa Sunda
    'aing', 'maneh', 'sia', 'kehed', 'belegug', 'modar', 'koplok',
    'bagong', 'pekok', 'jurig', 'sontoloyo',

    # Bahasa Jawa
    'jancuk', 'jancok', 'cuk', 'ndasmu', 'raimu', 'matamu', 'silit',
    'sundel', 'taek', 'entut', 'thuyul', 'jangkrik',

    # Bahasa Inggris
    'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'pussy', 'dick',
    'cock', 'motherfucker', 'bastard', 'wanker', 'bollocks', 'damn',
    'crap', 'whore', 'slut', 'nigger', 'chink', 'retard', 'moron',
    'idiot', 'dumbass', 'prick', 'twat'
]

# [v2.2.0-OLD] PROFANITY_SET = set(word.lower() for word in PROFANITY_LIST)

# [v2.2.0-NEW] Dynamic JSON loading with exact & substring categorization and fallback
EXACT_PROFANITY_SET = set()
SUBSTRING_PROFANITY_SET = set()

LEET_MAP = str.maketrans({
    '4': 'a',
    '@': 'a',
    '3': 'e',
    '1': 'i',
    '!': 'i',
    '0': 'o',
    '5': 's',
    '$': 's',
    '7': 't'
})

def reload_profanity_words():
    global EXACT_PROFANITY_SET, SUBSTRING_PROFANITY_SET
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'censored_words.json')
    loaded = False
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                exact_list = data.get('exact', [])
                sub_list = data.get('substring', [])
                EXACT_PROFANITY_SET = set(w.lower() for w in exact_list)
                SUBSTRING_PROFANITY_SET = set(w.lower() for w in sub_list)
                loaded = True
        except Exception as e:
            print(f"[Profanity] Error loading censored_words.json: {e}, falling back to default.")

    if not loaded:
        EXACT_PROFANITY_SET = set(word.lower() for word in PROFANITY_LIST)
        SUBSTRING_PROFANITY_SET = set()

# Initialize on module import
reload_profanity_words()

def collapse_repeats(s: str) -> str:
    res = []
    for char in s:
        if len(res) >= 1 and res[-1] == char:
            continue
        res.append(char)
    return "".join(res)

def normalize(text: str) -> str:
    if not text:
        return ""
    # 1. Unicode NFKD normalization
    text_norm = unicodedata.normalize('NFKD', text)
    # 2. Lowercase
    text_norm = text_norm.lower()
    # 3. Leetspeak mapping
    text_norm = text_norm.translate(LEET_MAP)
    # 4. Remove non-alphanumeric characters
    text_norm = re.sub(r'[^a-z0-9]', '', text_norm)
    # 5. Collapse repeated characters (e.g., anjiiiing -> anjing)
    text_norm = collapse_repeats(text_norm)
    return text_norm

# [v2.2.0-OLD] contains_profanity implementation using PROFANITY_SET
def contains_profanity(text: str) -> tuple[bool, str | None]:
    if not text:
        return False, None

    normalized_text = normalize(text)
    if not normalized_text:
        return False, None

    # 1. Exact match checking (tokenized raw text & normalized tokens)
    raw_lower = text.lower()
    words = re.findall(r'\b\w+\b', raw_lower)
    for w in words:
        w_norm = normalize(w)
        for bad_word in EXACT_PROFANITY_SET:
            if bad_word == w or normalize(bad_word) == w_norm:
                return True, bad_word

    # Exact match check on entire normalized text for short words or spaced words (e.g., "b a b i")
    for bad_word in EXACT_PROFANITY_SET:
        norm_bad = normalize(bad_word)
        if normalized_text == norm_bad:
            return True, bad_word
        # If long exact bad word (len > 3), also check token boundaries in normalized text
        if len(norm_bad) > 3 and norm_bad in normalized_text.split():
            return True, bad_word

    # 2. Substring match checking (checked within normalized text)
    for bad_word in SUBSTRING_PROFANITY_SET:
        norm_bad = normalize(bad_word)
        if norm_bad and norm_bad in normalized_text:
            return True, bad_word

    return False, None

def is_profane(text: str) -> bool:
    has_profanity, _ = contains_profanity(text)
    return has_profanity

def log_moderation(event_type: str, username: str, text: str, matched_word: str | None, room_code: str = None):
    try:
        cache_dir = os.path.join(os.getcwd(), 'cache', 'persistent')
        os.makedirs(cache_dir, exist_ok=True)
        log_file = os.path.join(cache_dir, 'moderation_log.json')

        log_entry = {
            'timestamp': time.time(),
            'event_type': event_type,
            'username': username,
            'text': text,
            'matched_word': matched_word,
            'room_code': room_code
        }

        logs = []
        if os.path.exists(log_file):
            try:
                with open(log_file, 'r', encoding='utf-8') as f:
                    logs = json.load(f)
            except Exception:
                logs = []

        logs.append(log_entry)

        temp_file = log_file + '.tmp'
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(logs, f, indent=2, ensure_ascii=False)
        os.replace(temp_file, log_file)
    except Exception as e:
        print(f"[Profanity] Failed to log moderation event: {e}")
