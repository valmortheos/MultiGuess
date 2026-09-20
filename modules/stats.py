import os
import json
import time
import threading
from datetime import datetime

STATS_LOCK = threading.Lock()
STATS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'stats.json')

DEFAULT_STATS = {
    "version": "1.0",
    "words_used": {},
    "words_censored": {},
    "words_picked_total": 0,
    "last_updated": ""
}

def load_stats():
    with STATS_LOCK:
        if not os.path.exists(STATS_FILE):
            return dict(DEFAULT_STATS)
        try:
            with open(STATS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
        except Exception as e:
            print(f"[Stats] Failed to read stats.json: {e}")
        return dict(DEFAULT_STATS)

def save_stats(stats_data):
    with STATS_LOCK:
        try:
            os.makedirs(os.path.dirname(STATS_FILE), exist_ok=True)
            stats_data['last_updated'] = datetime.now().isoformat()
            tmp_file = STATS_FILE + ".tmp"
            with open(tmp_file, 'w', encoding='utf-8') as f:
                json.dump(stats_data, f, indent=2, ensure_ascii=False)
            os.replace(tmp_file, STATS_FILE)
        except Exception as e:
            print(f"[Stats] Failed to save stats.json: {e}")

def record_word_used(word):
    if not word:
        return
    stats = load_stats()
    word_key = str(word).lower().strip()
    words_used = stats.get('words_used', {})
    words_used[word_key] = words_used.get(word_key, 0) + 1
    stats['words_used'] = words_used
    stats['words_picked_total'] = stats.get('words_picked_total', 0) + 1
    save_stats(stats)

def record_word_censored(word):
    if not word:
        return
    stats = load_stats()
    word_key = str(word).lower().strip()
    words_censored = stats.get('words_censored', {})
    words_censored[word_key] = words_censored.get(word_key, 0) + 1
    stats['words_censored'] = words_censored
    save_stats(stats)
