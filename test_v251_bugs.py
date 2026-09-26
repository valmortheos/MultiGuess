import unittest
from app import app
from modules.config import APP_VERSION

class TestV251Bugs(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        app.config['TESTING'] = True

    def test_version_251(self):
        self.assertEqual(APP_VERSION, "2.5.1")

    def test_templates_button_classes(self):
        with open('templates/index.html', 'r', encoding='utf-8') as f:
            html = f.read()
        self.assertIn('id="btn-voice-toggle" class="btn-action-av"', html)
        self.assertIn('id="btn-video-toggle" class="btn-action-av"', html)
        self.assertNotIn('id="btn-voice-toggle" class="btn-reaction"', html)

    def test_sounding_template_search(self):
        with open('templates/sounding.html', 'r', encoding='utf-8') as f:
            html = f.read()
        self.assertIn('id="sounding-search"', html)
        self.assertIn('id="sounding-filter-cat"', html)
        self.assertIn('table-container', html)

if __name__ == '__main__':
    unittest.main()
