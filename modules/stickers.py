import os
from pathlib import Path

STICKER_DIR = Path(__file__).resolve().parent.parent / "Data" / "Stickers"

def list_stickers():
    if not STICKER_DIR.exists() or not STICKER_DIR.is_dir():
        return []

    stickers = []
    try:
        for file in sorted(os.listdir(STICKER_DIR)):
            if file.lower().endswith('.png'):
                name = os.path.splitext(file)[0]
                stickers.append({
                    'name': name,
                    'path': f"/Stickers/{file}"
                })
    except Exception as e:
        print(f"[Stickers] Error listing stickers: {e}")

    return stickers
