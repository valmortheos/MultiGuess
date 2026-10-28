import unittest
import time
import os
from app import app, socketio, room_mgr, record_chat_history
from modules.config import APP_VERSION

class TestV254Features(unittest.TestCase):
    def setUp(self):
        room_mgr.rooms.clear()

    def test_version_bump(self):
        self.assertEqual(APP_VERSION, "2.5.6")

    def test_stroke_deduplication_and_ack(self):
        client = socketio.test_client(app)
        client.emit('create_room', {'player_name': 'Artist', 'client_token': 'art_tok'})
        received = client.get_received()
        room_code = next(e for e in received if e['name'] == 'room_joined')['args'][0]['room_code']

        room = room_mgr.get_room(room_code)
        room['state'] = 'PLAYING'
        room['current_drawer'] = list(room['players'].keys())[0]

        stroke = {'strokeId': 'str_uuid_123', 'type': 'start', 'x': 0.5, 'y': 0.5}

        # First emit should return {'ok': True}
        ack1 = client.emit('draw_stroke', {'room_code': room_code, 'stroke': stroke}, callback=True)
        self.assertEqual(ack1, {'ok': True})
        self.assertIn('str_uuid_123', room['processed_stroke_ids'])
        self.assertEqual(len(room['strokes']), 1)

        # Duplicate emit should return {'ok': True, 'dedup': True} without re-appending
        ack2 = client.emit('draw_stroke', {'room_code': room_code, 'stroke': stroke}, callback=True)
        self.assertEqual(ack2, {'ok': True, 'dedup': True})
        self.assertEqual(len(room['strokes']), 1)

    def test_chat_history_seed(self):
        client1 = socketio.test_client(app)
        client1.emit('create_room', {'player_name': 'Alice', 'client_token': 'tok_alice'})
        received1 = client1.get_received()
        room_code = next(e for e in received1 if e['name'] == 'room_joined')['args'][0]['room_code']

        room = room_mgr.get_room(room_code)
        self.assertIn('chat_history', room)
        self.assertEqual(len(room['chat_history']), 0)

        # Alice sends 3 messages
        client1.emit('send_message', {'room_code': room_code, 'text': 'Pesan 1'})
        client1.emit('send_message', {'room_code': room_code, 'text': 'Pesan 2'})
        client1.emit('send_message', {'room_code': room_code, 'text': 'Pesan 3'})

        self.assertEqual(len(room['chat_history']), 3)
        self.assertEqual(room['chat_history'][0]['text'], 'Pesan 1')
        self.assertIsInstance(room['chat_history'][0]['timestamp'], int)

        # Bob joins mid-game
        client2 = socketio.test_client(app)
        client2.emit('join_room', {'player_name': 'Bob', 'room_code': room_code, 'client_token': 'tok_bob'})
        received2 = client2.get_received()

        chat_hist_ev = next((e for e in received2 if e['name'] == 'chat_history'), None)
        self.assertIsNotNone(chat_hist_ev)
        messages = chat_hist_ev['args'][0]['messages']
        self.assertEqual(len(messages), 3)
        self.assertEqual(messages[0]['text'], 'Pesan 1')

    def test_chat_history_cap(self):
        room = {'chat_history': []}
        for i in range(250):
            record_chat_history(room, {'sender': 'Tester', 'text': f'Msg {i}', 'type': 'chat'})

        self.assertEqual(len(room['chat_history']), 200)
        self.assertEqual(room['chat_history'][0]['text'], 'Msg 50')
        self.assertEqual(room['chat_history'][-1]['text'], 'Msg 249')

    def test_camera_mirror_css_classes(self):
        with open('static/voice.js', 'r', encoding='utf-8') as f:
            js_content = f.read()
        self.assertIn('video-box video-local', js_content)
        self.assertIn('video-box video-remote', js_content)

        with open('static/style.css', 'r', encoding='utf-8') as f:
            css_content = f.read()
        self.assertIn('.video-box.video-local video', css_content)
        self.assertIn('transform: scaleX(-1);', css_content)
        self.assertIn('.video-box.video-remote video', css_content)

if __name__ == '__main__':
    unittest.main()
