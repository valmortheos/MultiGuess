import unittest
import os
import json
from modules.sound_manifest import load_sound_config, SOUND_DIR
from modules.profanity import contains_profanity, reload_profanity_words

class TestFeaturesV220(unittest.TestCase):

    def test_sound_config_json_validity(self):
        config_path = os.path.join(os.path.dirname(__file__), 'data', 'sound_config.json')
        self.assertTrue(os.path.exists(config_path), "data/sound_config.json file must exist")
        with open(config_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        self.assertIn("categories", data)
        self.assertIn("version", data)

    def test_censored_words_json_validity(self):
        config_path = os.path.join(os.path.dirname(__file__), 'data', 'censored_words.json')
        self.assertTrue(os.path.exists(config_path), "data/censored_words.json file must exist")
        with open(config_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        self.assertIn("exact", data)
        self.assertIn("substring", data)

    def test_audio_files_exist_on_disk(self):
        config = load_sound_config()
        categories = config.get("categories", {})
        for cat, rel_paths in categories.items():
            for rel_path in rel_paths:
                full_path = os.path.join(SOUND_DIR, rel_path)
                self.assertTrue(
                    os.path.exists(full_path),
                    f"Referenced audio file does not exist on disk: {full_path}"
                )

    def test_fair_drawer_rotation(self):
        players = ['player_1', 'player_2', 'player_3', 'player_4', 'player_5']
        total_rounds = 3

        # Build fair order
        import random
        fair_order = []
        for _ in range(total_rounds):
            round_sids = list(players)
            random.shuffle(round_sids)
            fair_order.extend(round_sids)

        self.assertEqual(len(fair_order), 15, "5 players x 3 rounds should yield 15 slots")

        counts = {p: fair_order.count(p) for p in players}
        for p, count in counts.items():
            self.assertGreaterEqual(
                count, 3,
                f"Player {p} appeared {count} times, expected at least 3"
            )

    def test_profanity_exact_vs_substring(self):
        reload_profanity_words()

        # Exact matches
        is_bad, word = contains_profanity("babi")
        self.assertTrue(is_bad)
        self.assertEqual(word, "babi")

        is_bad, word = contains_profanity("anjing banget")
        self.assertTrue(is_bad)
        self.assertEqual(word, "anjing")

        # Substring matches
        is_bad, word = contains_profanity("anjengg")
        self.assertTrue(is_bad)
        self.assertEqual(word, "anjeng")

        is_bad, word = contains_profanity("kamu cok banget")
        self.assertTrue(is_bad)
        self.assertEqual(word, "cok")

        # Clean words
        is_bad, _ = contains_profanity("halo teman teman")
        self.assertFalse(is_bad)

if __name__ == '__main__':
    unittest.main()
