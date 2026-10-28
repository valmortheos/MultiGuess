import unittest
from app import app, socketio, room_mgr
from modules.config import APP_VERSION, MAX_PLAYERS

class TestV255Features(unittest.TestCase):
    def setUp(self):
        room_mgr.rooms.clear()

    def test_version_bump(self):
        self.assertEqual(APP_VERSION, "2.5.6")

    def test_mid_game_join_scenario(self):
        # Client 1 creates room
        c1 = socketio.test_client(app)
        c1.emit('create_room', {'player_name': 'PlayerA', 'client_token': 'tok_a'})
        room_code = c1.get_received()[0]['args'][0]['room_code']

        # Client 2 joins room
        c2 = socketio.test_client(app)
        c2.emit('join_room', {'player_name': 'PlayerB', 'room_code': room_code, 'client_token': 'tok_b'})

        # Start game
        c1.emit('start_game', {'room_code': room_code})
        room = room_mgr.get_room(room_code)
        drawer_sid = room['current_drawer']

        # Select word
        c1.emit('select_word', {'room_code': room_code, 'word': room['word_options'][0]})
        room['state'] = 'PLAYING'
        room['time_remaining'] = 60

        # Client 3 joins mid-game while state is PLAYING!
        c3 = socketio.test_client(app)
        c3.emit('join_room', {'player_name': 'PlayerC', 'room_code': room_code, 'client_token': 'tok_c'})
        received3 = c3.get_received()

        # Should receive room_joined success
        joined_ev = next((e for e in received3 if e['name'] == 'room_joined'), None)
        self.assertIsNotNone(joined_ev)

        # Should receive round_started & timer_tick
        round_ev = next((e for e in received3 if e['name'] == 'round_started'), None)
        self.assertIsNotNone(round_ev)
        self.assertEqual(round_ev['args'][0]['drawer_sid'], drawer_sid)

        # Room should have 3 players
        self.assertEqual(len(room['players']), 3)
        self.assertIn('PlayerC', [p['name'] for p in room['players'].values()])

    def test_active_players_max_players_guard(self):
        c1 = socketio.test_client(app)
        c1.emit('create_room', {'player_name': 'Host', 'client_token': 'host_tok'})
        room_code = c1.get_received()[0]['args'][0]['room_code']
        room = room_mgr.get_room(room_code)

        # Simulate 7 disconnected players and 1 active host
        for i in range(7):
            room['players'][f'disc_sid_{i}'] = {
                'sid': f'disc_sid_{i}',
                'name': f'DiscUser_{i}',
                'score': 0,
                'has_guessed': False,
                'disconnected': True
            }

        self.assertEqual(len(room['players']), 8)

        # Joining player should be allowed because active non-disconnected count is 1 < MAX_PLAYERS
        c_new = socketio.test_client(app)
        c_new.emit('join_room', {'player_name': 'NewActiveUser', 'room_code': room_code, 'client_token': 'new_tok'})
        received = c_new.get_received()
        joined_ev = next((e for e in received if e['name'] == 'room_joined'), None)
        self.assertIsNotNone(joined_ev)

    def test_lobby_chat_messaging(self):
        c1 = socketio.test_client(app)
        c1.emit('create_room', {'player_name': 'LobbyHost', 'client_token': 'lh_tok'})
        room_code = c1.get_received()[0]['args'][0]['room_code']

        c2 = socketio.test_client(app)
        c2.emit('join_room', {'player_name': 'LobbyGuest', 'room_code': room_code, 'client_token': 'lg_tok'})

        # Clear received events
        c1.get_received()
        c2.get_received()

        # Send chat in LOBBY state
        c2.emit('send_message', {'room_code': room_code, 'text': 'Halo dari Lobby!'})

        c1_events = c1.get_received()
        msg_ev = next((e for e in c1_events if e['name'] == 'chat_message'), None)
        self.assertIsNotNone(msg_ev)
        self.assertEqual(msg_ev['args'][0]['text'], 'Halo dari Lobby!')

        # Verify chat entered room['chat_history']
        room = room_mgr.get_room(room_code)
        self.assertEqual(len(room['chat_history']), 1)
        self.assertEqual(room['chat_history'][0]['text'], 'Halo dari Lobby!')

if __name__ == '__main__':
    unittest.main()
