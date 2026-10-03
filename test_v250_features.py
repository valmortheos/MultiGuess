import unittest
import os
import json
import io
from pathlib import Path

import app as app_module
from app import app, socketio, room_mgr
from modules.sound_manifest import save_sound_config_atomic, backup_and_delete_sound_file, restore_sound_file_from_trash, SOUND_DIR
from modules.stickers import STICKER_DIR

class TestV250Features(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        app.config['TESTING'] = True

    def test_sticker_path_traversal_validation(self):
        # Create a dummy test sticker in STICKER_DIR
        test_sticker = STICKER_DIR / "test_sticker.png"
        STICKER_DIR.mkdir(parents=True, exist_ok=True)
        test_sticker.write_bytes(b"fake png data")

        # Create room via socket client
        sio_client = socketio.test_client(app)
        sio_client.emit('create_room', {'player_name': 'Tester'})
        received = sio_client.get_received()

        room_joined_ev = next(r for r in received if r['name'] == 'room_joined')
        room_code = room_joined_ev['args'][0]['room_code']

        # Valid sticker send
        sio_client.emit('send_message', {
            'room_code': room_code,
            'text': '',
            'type': 'sticker',
            'sticker_path': 'test_sticker.png'
        })
        received_valid = sio_client.get_received()
        chat_msg_ev = next((r for r in received_valid if r['name'] == 'chat_message'), None)
        self.assertIsNotNone(chat_msg_ev)
        self.assertEqual(chat_msg_ev['args'][0]['type'], 'sticker')
        self.assertEqual(chat_msg_ev['args'][0]['sticker_path'], 'test_sticker.png')

        # Invalid path traversal send
        sio_client.emit('send_message', {
            'room_code': room_code,
            'text': '',
            'type': 'sticker',
            'sticker_path': '../../etc/passwd.png'
        })
        received_invalid = sio_client.get_received()
        chat_msg_invalid = next((r for r in received_invalid if r['name'] == 'chat_message'), None)
        self.assertIsNone(chat_msg_invalid)

        # Cleanup
        if test_sticker.exists():
            test_sticker.unlink()

    def test_sounding_dev_mode_protection(self):
        # Save original DEV_MODE
        orig_dev = app_module.DEV_MODE
        try:
            app_module.DEV_MODE = False
            # When DEV_MODE is False, /sounding and /api/sounding/* must return 404
            res1 = self.client.get('/sounding')
            self.assertEqual(res1.status_code, 404)

            res2 = self.client.get('/api/sounding/list')
            self.assertEqual(res2.status_code, 404)

            res3 = self.client.post('/api/sounding/delete', json={'category': 'Random', 'filename': 'test.mp3'})
            self.assertEqual(res3.status_code, 404)
        finally:
            app_module.DEV_MODE = orig_dev

    def test_sounding_api_list_structure(self):
        orig_dev = app_module.DEV_MODE
        try:
            app_module.DEV_MODE = True
            res = self.client.get('/api/sounding/list')
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertIn('categories', data)
            self.assertIn('orphans', data)
            self.assertIsInstance(data['categories'], dict)
            self.assertIsInstance(data['orphans'], list)
        finally:
            app_module.DEV_MODE = orig_dev

    def test_sounding_upload_validations(self):
        orig_dev = app_module.DEV_MODE
        try:
            app_module.DEV_MODE = True

            # 1. Reject invalid magic bytes
            fake_file = (io.BytesIO(b'NOT AN MP3 FILE DATA'), 'invalid.mp3')
            res1 = self.client.post('/api/sounding/upload', data={
                'file': fake_file,
                'category': 'Random'
            }, content_type='multipart/form-data')
            self.assertEqual(res1.status_code, 400)
            self.assertIn('magic bytes mismatch', res1.get_json().get('message', ''))

            # 2. Reject size > 5MB
            huge_data = b'ID3' + b'\x00' * (5 * 1024 * 1024 + 100)
            fake_huge = (io.BytesIO(huge_data), 'huge.mp3')
            res2 = self.client.post('/api/sounding/upload', data={
                'file': fake_huge,
                'category': 'Random'
            }, content_type='multipart/form-data')
            self.assertEqual(res2.status_code, 400)
            self.assertIn('melebihi batas 5MB', res2.get_json().get('message', ''))

            # 3. Accept valid MP3 with ID3 magic bytes
            valid_mp3_data = b'ID3' + b'\x03\x00\x00\x00\x00\x00\x00' + b'dummy mp3 frame data'
            fake_valid = (io.BytesIO(valid_mp3_data), 'test_upload.mp3')
            res3 = self.client.post('/api/sounding/upload', data={
                'file': fake_valid,
                'category': 'Random'
            }, content_type='multipart/form-data')
            self.assertEqual(res3.status_code, 200)
            self.assertTrue(res3.get_json().get('success'))

            # Verify file was created in SOUND_DIR/Random/test_upload.mp3
            uploaded_path = SOUND_DIR / 'Random' / 'test_upload.mp3'
            self.assertTrue(uploaded_path.exists())

            # Cleanup uploaded test file
            if uploaded_path.exists():
                uploaded_path.unlink()

        finally:
            app_module.DEV_MODE = orig_dev

    def test_atomic_config_write_and_trash_backup(self):
        # Create a test sound file
        test_cat = "TestCat"
        test_file = "test_sound.mp3"
        file_path = SOUND_DIR / test_cat / test_file
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(b'ID3testdata')

        trash_path = backup_and_delete_sound_file(test_cat, test_file)
        self.assertIsNotNone(trash_path)
        self.assertFalse(file_path.exists())
        self.assertTrue(Path(trash_path).exists())

        # Test rollback
        restore_success = restore_sound_file_from_trash(trash_path, test_cat, test_file)
        self.assertTrue(restore_success)
        self.assertTrue(file_path.exists())

        # Final cleanup
        if file_path.exists():
            file_path.unlink()

if __name__ == '__main__':
    unittest.main()
