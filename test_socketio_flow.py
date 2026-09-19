import unittest
import time
from app import app, socketio, room_mgr

class TestSocketIOFlow(unittest.TestCase):
    def setUp(self):
        room_mgr.rooms.clear()

    def test_create_and_restore_session(self):
        client1 = socketio.test_client(app)
        self.assertTrue(client1.is_connected())

        # Create Room
        client1.emit('create_room', {'player_name': 'Alice', 'client_token': 'token_alice'})
        received = client1.get_received()
        joined_ev = next(e for e in received if e['name'] == 'room_joined')
        room_code = joined_ev['args'][0]['room_code']
        self.assertTrue(joined_ev['args'][0]['is_host'])

        room = room_mgr.get_room(room_code)
        sid1 = list(room['players'].keys())[0]

        # Simulate disconnect
        client1.disconnect()
        self.assertTrue(room['players'][sid1]['disconnected'])

        # Connect new client with same token and restore session
        client2 = socketio.test_client(app)
        client2.emit('restore_session', {'client_token': 'token_alice', 'room_code': room_code})

        received2 = client2.get_received()
        restored_ev = next((e for e in received2 if e['name'] == 'session_restored'), None)
        self.assertIsNotNone(restored_ev)
        self.assertEqual(restored_ev['args'][0]['room_code'], room_code)
        self.assertTrue(restored_ev['args'][0]['is_host'])

        # Verify SID remapping in room
        sid2 = list(room['players'].keys())[0]
        self.assertNotEqual(sid1, sid2)
        self.assertEqual(room['players'][sid2]['name'], 'Alice')
        self.assertFalse(room['players'][sid2]['disconnected'])
        self.assertEqual(room['host_sid'], sid2)

    def test_midgame_join_and_rejoin(self):
        client1 = socketio.test_client(app)
        client1.emit('create_room', {'player_name': 'Alice', 'client_token': 'token_alice'})
        room_code = client1.get_received()[0]['args'][0]['room_code']

        client2 = socketio.test_client(app)
        client2.emit('join_room', {'player_name': 'Bob', 'room_code': room_code, 'client_token': 'token_bob'})

        # Start game
        client1.emit('start_game', {'room_code': room_code})
        room = room_mgr.get_room(room_code)
        self.assertIn(room['state'], ['SELECTING_WORD', 'COUNTDOWN', 'PLAYING'])

        # Client 3 joins mid-game
        client3 = socketio.test_client(app)
        client3.emit('join_room', {'player_name': 'Charlie', 'room_code': room_code, 'client_token': 'token_charlie'})
        received3 = client3.get_received()
        joined_ev = next((e for e in received3 if e['name'] == 'room_joined'), None)
        self.assertIsNotNone(joined_ev)

        # Charlie should be in players with score 0 and has_guessed False
        charlie_player = next(p for p in room['players'].values() if p['name'] == 'Charlie')
        self.assertEqual(charlie_player['score'], 0)
        self.assertFalse(charlie_player['has_guessed'])

    def test_play_again_drawer_order_rebuild(self):
        client1 = socketio.test_client(app)
        client1.emit('create_room', {'player_name': 'Alice', 'client_token': 'token_alice'})
        room_code = client1.get_received()[0]['args'][0]['room_code']

        client2 = socketio.test_client(app)
        client2.emit('join_room', {'player_name': 'Bob', 'room_code': room_code, 'client_token': 'token_bob'})

        client1.emit('start_game', {'room_code': room_code})
        room = room_mgr.get_room(room_code)

        # Mid-game joiner
        client3 = socketio.test_client(app)
        client3.emit('join_room', {'player_name': 'Charlie', 'room_code': room_code, 'client_token': 'token_charlie'})

        # Host triggers play_again
        client1.emit('play_again', {'room_code': room_code})
        self.assertEqual(room['state'], 'LOBBY')
        self.assertEqual(room['human_player_count'], 3)
        # 3 rounds * 3 players = 9 slots in drawer_order
        self.assertEqual(len(room['drawer_order']), 9)

        # Verify Charlie is included 3 times in drawer_order
        charlie_sid = list(room['players'].keys())[2]
        self.assertEqual(room['drawer_order'].count(charlie_sid), 3)

    def test_max_players_guard(self):
        client1 = socketio.test_client(app)
        client1.emit('create_room', {'player_name': 'Player0', 'client_token': 'token_0'})
        room_code = client1.get_received()[0]['args'][0]['room_code']

        # Add 7 more players to reach MAX_PLAYERS = 8
        for i in range(1, 8):
            c = socketio.test_client(app)
            c.emit('join_room', {'player_name': f'Player{i}', 'room_code': room_code, 'client_token': f'token_{i}'})

        # Try to join 9th player
        c9 = socketio.test_client(app)
        c9.emit('join_room', {'player_name': 'Player9', 'room_code': room_code, 'client_token': 'token_9'})
        received9 = c9.get_received()
        err_ev = next((e for e in received9 if e['name'] == 'join_error'), None)
        self.assertIsNotNone(err_ev)
        self.assertEqual(err_ev['args'][0]['reason'], 'room_full')

if __name__ == '__main__':
    unittest.main()
