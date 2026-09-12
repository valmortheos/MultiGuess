import time
import random
import re
from .words import pick_three_words
from .scoring import calculate_guesser_points, calculate_drawer_points
from .cache import temporal_save, persistent_save

def normalize_room_code(code_str):
    if not code_str:
        return ""
    return re.sub(r'[^A-Z]', '', str(code_str).strip().upper())

def mask_word(word):
    masked = []
    for char in word:
        if char == ' ':
            masked.append(' ')
        else:
            masked.append('_')
    return ' '.join(masked)

class RoomManager:
    def __init__(self):
        self.rooms = {}

    def generate_room_code(self):
        import string
        while True:
            code = ''.join(random.choices(string.ascii_uppercase, k=4))
            if code not in self.rooms:
                return code

    def create_room(self, host_sid, player_name):
        room_code = self.generate_room_code()
        self.rooms[room_code] = {
            'code': room_code,
            'created_at': int(time.time()),
            'host_sid': host_sid,
            'players': {
                host_sid: {
                    'sid': host_sid,
                    'name': player_name,
                    'score': 0,
                    'has_guessed': False
                }
            },
            'settings': {
                'timer_duration': 75,
                'total_rounds': 3
            },
            'state': 'LOBBY',
            'current_round': 1,
            'drawer_order': [],
            'drawer_index': 0,
            'current_drawer': None,
            'current_word': '',
            'word_options': [],
            'strokes': [],
            'time_remaining': 0,
            'timer_running': False,
            'correct_guessers_count': 0,
            'turn_scores': {}
        }
        self.save_cache()
        return room_code

    def get_room(self, room_code):
        clean_code = normalize_room_code(room_code)
        return self.rooms.get(clean_code)

    def save_cache(self):
        index_data = {}
        for code, r in self.rooms.items():
            host_name = r['players'].get(r['host_sid'], {}).get('name', 'Unknown') if r.get('host_sid') else 'Unknown'
            index_data[code] = {
                'created_at': r.get('created_at', int(time.time())),
                'host': host_name,
                'player_count': len(r['players']),
                'status': r['state'].lower(),
                'round': r['current_round'],
                'current_word': r['current_word']
            }
        persistent_save("rooms_index", index_data)

    def get_room_data(self, room_code):
        room = self.get_room(room_code)
        if not room:
            return None

        players_data = []
        for sid, p in room['players'].items():
            players_data.append({
                'sid': sid,
                'name': p['name'],
                'score': p['score'],
                'is_host': (sid == room['host_sid']),
                'has_guessed': p['has_guessed']
            })
        players_data.sort(key=lambda x: x['score'], reverse=True)

        current_drawer_name = ""
        if room['current_drawer'] and room['current_drawer'] in room['players']:
            current_drawer_name = room['players'][room['current_drawer']]['name']

        return {
            'room_code': room['code'],
            'state': room['state'],
            'settings': room['settings'],
            'host_sid': room['host_sid'],
            'current_round': room['current_round'],
            'total_rounds': room['settings']['total_rounds'],
            'current_drawer': room['current_drawer'],
            'current_drawer_name': current_drawer_name,
            'masked_word': mask_word(room['current_word']) if room['current_word'] else '',
            'time_remaining': room['time_remaining'],
            'players': players_data
        }
