import sys
import argparse
import unittest
from modules.config import APP_VERSION
from modules.words import get_pool_size, pick_three_words
from modules.game_state import RoomManager
from modules.profanity import contains_profanity
from modules.sound_manifest import load_sound_config
from modules.network import get_lan_ip
from modules.scoring import is_similar_guess

def main():
    parser = argparse.ArgumentParser(description="MultiGuess Diagnostic Script")
    parser.add_argument("--no-server", action="store_true", help="Run diagnostics without starting HTTP server")
    args = parser.parse_args()

    report_lines = []
    report_lines.append("=== MULTIGUESS DIAGNOSTIC REPORT ===")
    report_lines.append(f"App Version: {APP_VERSION}")
    report_lines.append(f"LAN IP: {get_lan_ip()}")

    try:
        pool_size = get_pool_size()
        words_sample = pick_three_words()
        report_lines.append(f"Word Pool Size: {pool_size}")
        report_lines.append(f"Word Pick Sample: {words_sample}")
    except Exception as e:
        report_lines.append(f"Word Pool Check Error: {e}")

    try:
        rm = RoomManager()
        code = rm.create_room("diag_sid", "DiagPlayer")
        room = rm.get_room(code)
        report_lines.append(f"RoomManager Create Room OK: Code={code}, State={room['state']}")
    except Exception as e:
        report_lines.append(f"RoomManager Check Error: {e}")

    try:
        has_prof, match = contains_profanity("badwordtest")
        report_lines.append(f"Profanity Check OK: {has_prof} ({match})")
    except Exception as e:
        report_lines.append(f"Profanity Check Error: {e}")

    try:
        sound_cfg = load_sound_config()
        cats = list(sound_cfg.get("categories", {}).keys())
        report_lines.append(f"Sound Config OK: Categories={cats}")
    except Exception as e:
        report_lines.append(f"Sound Config Error: {e}")

    report_content = "\n".join(report_lines)
    print(report_content)

    with open("report.txt", "w") as f:
        f.write(report_content + "\n")

if __name__ == "__main__":
    main()
