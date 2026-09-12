import os
import json
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, "cache")
TEMPORAL_DIR = os.path.join(CACHE_DIR, "temporal")
PERSISTENT_DIR = os.path.join(CACHE_DIR, "persistent")

def init_cache():
    try:
        os.makedirs(TEMPORAL_DIR, exist_ok=True)
        os.makedirs(PERSISTENT_DIR, exist_ok=True)
        cleanup_old_temporal()
    except Exception as e:
        print(f"[WARN] Cache directory initialization error: {e}")

def temporal_save(key: str, data: dict):
    try:
        os.makedirs(TEMPORAL_DIR, exist_ok=True)
        filepath = os.path.join(TEMPORAL_DIR, f"{key}.json")
        tmppath = f"{filepath}.tmp"
        with open(tmppath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmppath, filepath)
    except Exception as e:
        print(f"[WARN] Failed temporal_save({key}): {e}")

def temporal_load(key: str) -> dict | None:
    try:
        filepath = os.path.join(TEMPORAL_DIR, f"{key}.json")
        if os.path.exists(filepath):
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        print(f"[WARN] Failed temporal_load({key}): {e}")
    return None

def persistent_save(key: str, data: dict):
    try:
        os.makedirs(PERSISTENT_DIR, exist_ok=True)
        filepath = os.path.join(PERSISTENT_DIR, f"{key}.json")
        tmppath = f"{filepath}.tmp"
        with open(tmppath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmppath, filepath)
    except Exception as e:
        print(f"[WARN] Failed persistent_save({key}): {e}")

def persistent_load(key: str) -> dict | None:
    try:
        filepath = os.path.join(PERSISTENT_DIR, f"{key}.json")
        if os.path.exists(filepath):
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        print(f"[WARN] Failed persistent_load({key}): {e}")
    return None

def cleanup_old_temporal(max_age_seconds: int = 3600):
    try:
        if not os.path.exists(TEMPORAL_DIR):
            return
        now = time.time()
        for filename in os.listdir(TEMPORAL_DIR):
            filepath = os.path.join(TEMPORAL_DIR, filename)
            if os.path.isfile(filepath):
                if now - os.path.getmtime(filepath) > max_age_seconds:
                    os.remove(filepath)
    except Exception as e:
        print(f"[WARN] Error during temporal cache cleanup: {e}")

def get_cache_summary():
    temp_count = 0
    pers_count = 0
    try:
        if os.path.exists(TEMPORAL_DIR):
            temp_count = len([f for f in os.listdir(TEMPORAL_DIR) if f.endswith('.json')])
        if os.path.exists(PERSISTENT_DIR):
            pers_count = len([f for f in os.listdir(PERSISTENT_DIR) if f.endswith('.json')])
    except Exception:
        pass
    return f"Cache dir: {CACHE_DIR} (temporal: {temp_count} files, persistent: {pers_count} files)"
