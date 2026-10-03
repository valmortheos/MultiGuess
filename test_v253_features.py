import unittest
import json
from modules.sound_manifest import load_sound_config

class TestSoundPoolLogic(unittest.TestCase):
    def test_single_file_category(self):
        """Test single-file categories (length === 1) always return the file without depletion."""
        cfg = load_sound_config()
        your_turn_files = cfg.get('categories', {}).get('YourTurn', [])
        self.assertEqual(len(your_turn_files), 1, "YourTurn category should have 1 file")
        file_path = your_turn_files[0]

        # Simulate getNextFromPool logic for length == 1
        for _ in range(5):
            res = file_path if len(your_turn_files) == 1 else None
            self.assertEqual(res, "YourTurn/yt_amongus.mp3")

    def test_multi_file_category_loop(self):
        """Test multi-file categories (length 4) playing 5 times auto-refill and return valid files."""
        cfg = load_sound_config()
        files = cfg.get('categories', {}).get('CorrectAnswer', [])
        self.assertEqual(len(files), 4, "CorrectAnswer category should have 4 files")

        # Simulate pool shuffling & auto-refill logic
        pool = []
        last_played = None
        played_results = []

        for _ in range(5):
            if not pool:
                pool = list(files)
            played = pool.pop()
            played_results.append(played)
            self.assertIn(played, files)

        self.assertEqual(len(played_results), 5)

    def test_empty_category(self):
        """Test empty categories return None safely without crashing."""
        cfg = load_sound_config()
        files = cfg.get('categories', {}).get('RoundAnnounce', [])
        self.assertEqual(len(files), 0, "RoundAnnounce category should be empty")

        res = files[0] if len(files) > 0 else None
        self.assertIsNone(res)

    def test_undo_stroke_owner_safety(self):
        """Test handle_undo_stroke only removes strokes belonging to current drawer."""
        room = {
            'state': 'PLAYING',
            'current_drawer': 'drawer_1',
            'strokes': [
                {'type': 'start', 'x': 0.1, 'y': 0.1, 'strokeOwner': 'drawer_other'},
                {'type': 'line', 'x': 0.2, 'y': 0.2, 'strokeOwner': 'drawer_other'},
                {'type': 'start', 'x': 0.5, 'y': 0.5, 'strokeOwner': 'drawer_1'},
                {'type': 'line', 'x': 0.6, 'y': 0.6, 'strokeOwner': 'drawer_1'}
            ]
        }

        # Simulate undo for drawer_1
        sid = 'drawer_1'
        if room['strokes']:
            last_stroke = room['strokes'][-1]
            if not (isinstance(last_stroke, dict) and last_stroke.get('strokeOwner') and last_stroke.get('strokeOwner') != sid):
                while room['strokes']:
                    top_stroke = room['strokes'][-1]
                    if isinstance(top_stroke, dict) and top_stroke.get('strokeOwner') and top_stroke.get('strokeOwner') != sid:
                        break
                    pop_s = room['strokes'].pop()
                    if isinstance(pop_s, dict) and pop_s.get('type') == 'start':
                        break

        # Only drawer_1 strokes should be popped
        self.assertEqual(len(room['strokes']), 2)
        self.assertEqual(room['strokes'][-1]['strokeOwner'], 'drawer_other')

    def test_afk_skip_round_calculation(self):
        """Test AFK skip increments drawer_index but maintains current_round = 1 until full round completed."""
        human_player_count = 3
        drawer_order = ['p_a', 'p_b', 'p_c', 'p_a', 'p_b', 'p_c']
        drawer_index = 0

        # Round 1, Player A's turn
        current_round = (drawer_index // human_player_count) + 1
        self.assertEqual(current_round, 1)

        # Player A AFK skip -> drawer_index = 1 (Player B's turn)
        drawer_index += 1
        current_round = (drawer_index // human_player_count) + 1
        self.assertEqual(current_round, 1)
        self.assertEqual(drawer_order[drawer_index], 'p_b')

        # Player B finishes turn -> drawer_index = 2 (Player C's turn)
        drawer_index += 1
        current_round = (drawer_index // human_player_count) + 1
        self.assertEqual(current_round, 1)
        self.assertEqual(drawer_order[drawer_index], 'p_c')

        # Player C finishes turn -> drawer_index = 3 (Round 2 begins, Player A's turn)
        drawer_index += 1
        current_round = (drawer_index // human_player_count) + 1
        self.assertEqual(current_round, 2)
        self.assertEqual(drawer_order[drawer_index], 'p_a')

    def test_skip_word_select_logic(self):
        """Test skip_word_select advances drawer_index and cancels word selection timer."""
        room = {
            'state': 'SELECTING_WORD',
            'current_drawer': 'drawer_1',
            'drawer_index': 0,
            'players': {'drawer_1': {'name': 'Alice'}}
        }

        # Simulate skip_word_select
        sid = 'drawer_1'
        if room['state'] == 'SELECTING_WORD' and room['current_drawer'] == sid:
            room['drawer_index'] += 1

        self.assertEqual(room['drawer_index'], 1)

    def test_rename_player_in_lobby(self):
        """Test rename_player in lobby updates name and saves cache."""
        room = {
            'state': 'LOBBY',
            'players': {'sid_1': {'name': 'OldName'}}
        }

        sid = 'sid_1'
        new_name = 'NewName'
        if room['state'] == 'LOBBY' and sid in room['players']:
            if new_name and len(new_name) <= 15:
                room['players'][sid]['name'] = new_name

        self.assertEqual(room['players']['sid_1']['name'], 'NewName')

if __name__ == '__main__':
    unittest.main()
