import os
import hashlib
import json
from pathlib import Path
from modules.cache import persistent_save, persistent_load

SOUND_DIR = Path(__file__).resolve().parent.parent / "Sound"

def calculate_file_hash(filepath):
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(8192):
            hasher.update(chunk)
    return hasher.hexdigest()

def generate_sound_manifest():
    if not SOUND_DIR.exists():
        return {
            "version": "empty",
            "files": [],
            "total_size": 0,
            "total_files": 0
        }

    files_list = []
    total_size = 0
    version_hasher = hashlib.sha256()

    for root, _, files in os.walk(str(SOUND_DIR)):
        for file in sorted(files):
            if file.startswith('.'):
                continue
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, str(SOUND_DIR)).replace('\\', '/')
            size = os.path.getsize(full_path)
            mtime = os.path.getmtime(full_path)
            file_hash = calculate_file_hash(full_path)

            total_size += size
            version_hasher.update(f"{rel_path}:{size}:{mtime}:{file_hash}".encode('utf-8'))

            files_list.append({
                "path": rel_path,
                "size": size,
                "hash": file_hash
            })

    manifest = {
        "version": version_hasher.hexdigest(),
        "files": files_list,
        "total_size": total_size,
        "total_files": len(files_list)
    }

    persistent_save("sound_manifest", manifest)
    return manifest

def get_sound_manifest():
    cached = persistent_load("sound_manifest")
    if cached:
        # Check if files count or directory mtime roughly matches
        return cached
    return generate_sound_manifest()

# [v2.2.0-NEW] Sound Config Loader from JSON
DEFAULT_SOUND_CONFIG = {
    "version": "1.0",
    "categories": {
        "Censored": [],
        "CorrectAnswer": [],
        "FailedRound": [],
        "Random": [],
        "TimeRemaining": [],
        "WinnerScore": [],
        "WrongAnswer": [],
        "YourTurn": [],
        "RoundAnnounce": []
    },
    "fallback_freq": {
        "Censored": 110, "CorrectAnswer": 880, "FailedRound": 165, "Random": 520,
        "TimeRemaining": 330, "WinnerScore": 1046, "WrongAnswer": 220, "YourTurn": 660
    }
}

def load_sound_config():
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'sound_config.json')
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[SoundManifest] Error loading sound_config.json: {e}")
    return DEFAULT_SOUND_CONFIG

def save_sound_config_atomic(config_data):
    config_path = Path(__file__).resolve().parent.parent / "data" / "sound_config.json"
    temp_path = config_path.with_suffix('.json.tmp')
    config_path.parent.mkdir(parents=True, exist_ok=True)
    with open(temp_path, 'w', encoding='utf-8') as f:
        json.dump(config_data, f, indent=2)
    os.replace(temp_path, config_path)

def backup_and_delete_sound_file(category, filename):
    import time
    import shutil
    file_path = SOUND_DIR / category / filename
    trash_dir = SOUND_DIR / ".trash"
    trash_dir.mkdir(parents=True, exist_ok=True)

    if not file_path.exists():
        return None

    timestamp = int(time.time())
    trash_path = trash_dir / f"{timestamp}_{filename}"
    shutil.move(str(file_path), str(trash_path))
    return trash_path

def restore_sound_file_from_trash(trash_path, category, filename):
    import shutil
    if not trash_path or not Path(trash_path).exists():
        return False
    target_path = SOUND_DIR / category / filename
    target_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(trash_path), str(target_path))
    return True

def cleanup_trash(max_age_days=7):
    import time
    trash_dir = SOUND_DIR / ".trash"
    if not trash_dir.exists():
        return
    now = time.time()
    max_age_sec = max_age_days * 86400
    for root, _, files in os.walk(str(trash_dir)):
        for f in files:
            full_p = os.path.join(root, f)
            try:
                if now - os.path.getmtime(full_p) > max_age_sec:
                    os.remove(full_p)
            except Exception as e:
                print(f"[SoundManifest] Error cleaning up trash file {f}: {e}")
