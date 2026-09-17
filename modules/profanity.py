import re
import os
import json
import time
import unicodedata

# [v2.2.0-NEW] Hardcoded minimal fallbacks
HARDCODED_EXACT = [
    'anjing', 'bangsat', 'babi', 'kampret', 'kontol', 'memek',
    'ngentot', 'pepek', 'tai', 'titit', 'jancok', 'asw', 'asu'
]
HARDCODED_SUBSTRING = ['anjeng', 'jancuk', 'cok', 'tll', 'bgsd']

LEET_MAP = str.maketrans({
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '7': 't',
    '@': 'a',
    '$': 's'
})

EXACT_WORDS = set()
SUBSTRING_WORDS = set()

def reload_profanity_words():
    global EXACT_WORDS, SUBSTRING_WORDS
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'censored_words.json')
    exact_list = list(HARDCODED_EXACT)
    sub_list = list(HARDCODED_SUBSTRING)

    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    exact_list = data.get('exact', exact_list)
                    sub_list = data.get('substring', sub_list)
        except Exception as e:
            print(f"[Profanity] Failed to load censored_words.json: {e}")

    EXACT_WORDS = set(w.lower() for w in exact_list)
    SUBSTRING_WORDS = set(w.lower() for w in sub_list)

# Initial load
reload_profanity_words()

def normalize(text: str) -> str:
    if not text:
        return ""
    # 1. Unicode NFKD normalization
    text_norm = unicodedata.normalize('NFKD', text)
    # 2. Lowercase
    text_norm = text_norm.lower()
    # 3. Leetspeak mapping
    text_norm = text_norm.translate(LEET_MAP)
    # 4. Remove non-alphanumeric except whitespace
    text_norm = re.sub(r'[^a-z0-9\s]', '', text_norm)
    # 5. Collapse spaces
    text_norm = re.sub(r'\s+', ' ', text_norm).strip()
    return text_norm

def contains_profanity(text: str) -> tuple[bool, str | None]:
    if not text:
        return False, None

    norm_text = normalize(text)
    if not norm_text:
        return False, None

    # Check exact word boundary match
    words = norm_text.split()
    for w in words:
        if w in EXACT_WORDS:
            return True, w

    # Check substring match
    norm_no_space = norm_text.replace(" ", "")
    for sub in SUBSTRING_WORDS:
        if sub in norm_text or sub in norm_no_space:
            return True, sub

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
