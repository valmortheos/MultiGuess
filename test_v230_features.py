import os
import json
import unittest
import time
from pathlib import Path

import app as app_module
from app import app, socketio, room_mgr
from modules.config import APP_VERSION
from modules.stats import load_stats, record_word_used, record_word_censored, STATS_FILE
from modules.words import pick_three_words, load_words
from modules.stickers import list_stickers, STICKER_DIR

class TestV230Features(unittest.TestCase):
    def setUp(self):
        room_mgr.rooms.clear()
        if os.path.exists(STATS_FILE):
            try:
                os.remove(STATS_FILE)
            except Exception:
                pass

    def test_version(self):
        self.assertEqual(APP_VERSION, "2.5.1")

    def test_stats_recording(self):
        record_word_used("kucing")
        record_word_used("kucing")
        record_word_censored("babi")

        st = load_stats()
        self.assertEqual(st['words_used'].get('kucing'), 2)
        self.assertEqual(st['words_censored'].get('babi'), 1)
        self.assertEqual(st['words_picked_total'], 2)

    def test_weighted_words_pick(self):
        all_words = load_words()
        # With < 5 total picks, should use random.sample without error
        picked = pick_three_words(exclude={"kucing"}, stats={"words_picked_total": 2, "words_used": {}})
        self.assertEqual(len(picked), 3)
        self.assertNotIn("kucing", picked)

        # With >= 5 total picks, test weighted calculation
        stats_mock = {
            "words_picked_total": 10,
            "words_used": {w: 50 for w in all_words[:10]} # heavy usage on first 10 words
        }
        picked_weighted = pick_three_words(exclude=set(), stats=stats_mock)
        self.assertEqual(len(picked_weighted), 3)

    def test_stickers_listing(self):
        # Empty listing
        stickers = list_stickers()
        self.assertIsInstance(stickers, list)

        # Create dummy PNG sticker
        dummy_path = STICKER_DIR / "test_dummy.png"
        with open(dummy_path, "wb") as f:
            f.write(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89")

        try:
            stickers = list_stickers()
            names = [s['name'] for s in stickers]
            self.assertIn("test_dummy", names)
        finally:
            if dummy_path.exists():
                dummy_path.unlink()

    def test_http_endpoints(self):
        client = app.test_client()

        # Test /api/stats
        res_api_stats = client.get('/api/stats')
        self.assertEqual(res_api_stats.status_code, 200)
        self.assertIn('words_used', res_api_stats.json)

        # Test /stats HTML page
        res_stats_page = client.get('/stats')
        self.assertEqual(res_stats_page.status_code, 200)
        self.assertIn('Statistik Kata MultiGuess', res_stats_page.get_data(as_text=True))

        # Test /api/stickers
        res_api_stickers = client.get('/api/stickers')
        self.assertEqual(res_api_stickers.status_code, 200)

    def test_reroll_words_socket(self):
        c1 = socketio.test_client(app)
        c1.emit('create_room', {'player_name': 'Alice', 'client_token': 'tok1'})
        room_code = c1.get_received()[0]['args'][0]['room_code']

        c2 = socketio.test_client(app)
        c2.emit('join_room', {'player_name': 'Bob', 'room_code': room_code, 'client_token': 'tok2'})

        c1.emit('start_game', {'room_code': room_code})
        room = room_mgr.get_room(room_code)
        drawer_sid = room['current_drawer']

        drawer_client = c1 if list(room['players'].keys())[0] == drawer_sid else c2
        _ = drawer_client.get_received() # Clear initial prompt event from start_game

        # Trigger reroll 1
        drawer_client.emit('reroll_words', {'room_code': room_code})
        events = drawer_client.get_received()
        prompt_ev = next(e for e in events if e['name'] == 'choose_word_prompt')
        self.assertEqual(prompt_ev['args'][0]['reroll_count'], 1)

        # Trigger reroll 2
        drawer_client.emit('reroll_words', {'room_code': room_code})
        events2 = drawer_client.get_received()
        prompt_ev2 = next(e for e in events2 if e['name'] == 'choose_word_prompt')
        self.assertEqual(prompt_ev2['args'][0]['reroll_count'], 2)

        # Trigger reroll 3 (should fail with max 2)
        drawer_client.emit('reroll_words', {'room_code': room_code})
        events3 = drawer_client.get_received()
        err_ev = next((e for e in events3 if e['name'] == 'error_message'), None)
        self.assertIsNotNone(err_ev)

if __name__ == '__main__':
    unittest.main()
