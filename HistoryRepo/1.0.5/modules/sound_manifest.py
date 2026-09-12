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
        # Check if files count or directory mtime roughly matches
        return cached
    return generate_sound_manifest()
