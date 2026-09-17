import unittest
import time
import re
import socketio

class TestSocketFlow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        port = 5000
        try:
            with open("server_pw.log", "r") as f:
                log = f.read()
                match = re.search(r'Local:\s+http://127.0.0.1:(\d+)', log)
                if match:
                    port = int(match.group(1))
        except Exception:
            pass
        cls.server_url = f"http://127.0.0.1:{port}"

    def test_two_clients_flow(self):
        sio_a = socketio.Client()
        sio_b = socketio.Client()

        received_sounds_a = []
        received_sounds_b = []
        room_data = {}

        @sio_a.on('room_joined')
        def on_room_joined_a(data):
            room_data['code'] = data.get('room_code')

        @sio_a.on('play_sound')
        def on_sound_a(data):
            received_sounds_a.append(data)

        @sio_b.on('play_sound')
        def on_sound_b(data):
            received_sounds_b.append(data)

        sio_a.connect(self.server_url)
        sio_b.connect(self.server_url)

        # Client A creates room
        sio_a.emit('create_room', {'player_name': 'Alice'})
        time.sleep(1)

        room_code = room_data.get('code')
        self.assertIsNotNone(room_code)

        # Client B joins room
        sio_b.emit('join_room', {'player_name': 'Bob', 'room_code': room_code})
        time.sleep(1)

        # Trigger Random reaction from Client A
        sio_a.emit('trigger_reaction', {'room_code': room_code, 'soundPath': 'Random/rd_ack.mp3', 'slot': 1, 'userId': 'user-alice'})
        time.sleep(1)

        # Trigger Censored message from Client A
        sio_a.emit('send_message', {'room_code': room_code, 'text': 'babi'})
        time.sleep(1)

        sio_a.disconnect()
        sio_b.disconnect()

        # Assertions for Client A sounds
        types_a = [s.get('type') for s in received_sounds_a]
        types_b = [s.get('type') for s in received_sounds_b]

        self.assertIn('Random', types_a)
        self.assertIn('Random', types_b)

        self.assertIn('Censored', types_a)
        self.assertIn('Censored', types_b)

        # Payload validation for Censored event
        censored_ev_a = next(s for s in received_sounds_a if s.get('type') == 'Censored')
        self.assertEqual(censored_ev_a.get('username'), 'Alice')
        self.assertEqual(censored_ev_a.get('extra', {}).get('original_text'), 'babi')

if __name__ == '__main__':
    unittest.main()
