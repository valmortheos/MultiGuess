import unittest
import time
import app as app_module
from modules.config import DISCONNECT_GRACE_SECONDS, MAX_PLAYERS, APP_VERSION
from modules.game_state import RoomManager

class TestV223Features(unittest.TestCase):
    def setUp(self):
        self.rm = RoomManager()

    def test_version_config(self):
        self.assertEqual(APP_VERSION, "2.5.0")
        self.assertEqual(DISCONNECT_GRACE_SECONDS, 300)
        self.assertEqual(MAX_PLAYERS, 8)

    def test_room_initialization(self):
        code = self.rm.create_room("sid_1", "Alice", client_token="token_1")
        room = self.rm.get_room(code)
        self.assertIsNotNone(room)
        self.assertEqual(room['players']['sid_1']['client_token'], "token_1")
        self.assertFalse(room['players']['sid_1']['disconnected'])
        self.assertIsNone(room['players']['sid_1']['disconnected_at'])
        self.assertIsNone(room['waiting_for_drawer'])
        self.assertIsNone(room['paused_time_remaining'])
        self.assertFalse(room['timer_task_active'])

if __name__ == '__main__':
    unittest.main()
