import unittest
import os
import json

from modules.config import APP_VERSION
from modules.sound_manifest import load_sound_config
from modules.profanity import contains_profanity, reload_profanity_words
from modules.words import get_pool_size, pick_three_words

class TestMultiGuessFeatures(unittest.TestCase):

    def test_version_bump(self):
        self.assertEqual(APP_VERSION, "2.2.0")

    def test_sound_config_json(self):
        cfg = load_sound_config()
        self.assertIn("categories", cfg)
        self.assertIn("Random", cfg["categories"])
        self.assertIn("Random/rd_ack.mp3", cfg["categories"]["Random"])

    def test_censored_words_json(self):
        reload_profanity_words()
        has_bad, word = contains_profanity("halo babi")
        self.assertTrue(has_bad)
        self.assertEqual(word, "babi")

        # 4->a, 1->i -> babi
        has_bad_norm, word_norm = contains_profanity("b4b1")
        self.assertTrue(has_bad_norm)

    def test_words_pool_json(self):
        self.assertEqual(get_pool_size(), 176)
        words = pick_three_words()
        self.assertEqual(len(words), 3)

        # Test exclude logic
        used = set(words)
        next_words = pick_three_words(exclude=used)
        for w in next_words:
            self.assertNotIn(w, used)

    def test_auto_rolling_drawer_logic(self):
        # Simulation of 5 human players x 3 rounds = 15 slots
        import random
        human_players = [f"sid_{i}" for i in range(5)]
        total_rounds = 3

        drawer_order = []
        for _ in range(total_rounds):
            round_block = list(human_players)
            random.shuffle(round_block)
            drawer_order.extend(round_block)

        self.assertEqual(len(drawer_order), 15)
        for p in human_players:
            self.assertEqual(drawer_order.count(p), 3)

if __name__ == '__main__':
    unittest.main()
