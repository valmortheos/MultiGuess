import os
import hashlib
import json
from modules.cache import persistent_save, persistent_load

SOUND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'Sound')

def calculate_file_hash(filepath):
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(8192):
            hasher.update(chunk)
    return hasher.hexdigest()

def generate_sound_manifest():
    if not os.path.exists(SOUND_DIR):
        return {
            "version": "empty",
            "files": [],
            "total_size": 0,
            "total_files": 0
        }

    files_list = []
    total_size = 0
    version_hasher = hashlib.sha256()

    for root, _, files in os.walk(SOUND_DIR):
        for file in sorted(files):
            if file.startswith('.'):
                continue
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, SOUND_DIR).replace('\\', '/')
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
        # Cheap sanity check: if the number of files on disk no longer matches
        # what's cached, the cache is stale (files added/removed) — regenerate.
        try:
            disk_file_count = sum(
                1 for _root, _dirs, files in os.walk(SOUND_DIR)
                for f in files if not f.startswith('.')
            )
        except Exception:
            disk_file_count = None
        if disk_file_count is not None and disk_file_count == cached.get("total_files"):
            return cached
    return generate_sound_manifest()

# [v2.2.0-NEW] Sound Config Loader from JSON
DEFAULT_SOUND_CONFIG = {
    "version": "1.0",
    "categories": {
        "Censored": ["Censored/cn_boom.mp3"],
        "CorrectAnswer": ["CorrectAnswer/cr_wow.mp3"],
        "FailedRound": ["FailedRound/fl_sponge.mp3"],
        "Random": [
            "Random/rd_ack.mp3", "Random/rd_ahh.mp3", "Random/rd_laugh.mp3",
            "Random/rd_meow.mp3", "Random/rd_metalclang.mp3", "Random/rd_taco.mp3"
        ],
        "TimeRemaining": ["TimeRemaining/tm_sponge.mp3"],
        "WinnerScore": ["WinnerScore/ws_dubistgut.mp3"],
        "WrongAnswer": ["WrongAnswer/wg_fahh.mp3", "WrongAnswer/wg_jokowi.mp3"],
        "YourTurn": ["YourTurn/yt_amongus.mp3"]
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
