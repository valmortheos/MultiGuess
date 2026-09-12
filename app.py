import random
import string
import socket
import math
import time
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room

app = Flask(__name__)
app.config['SECRET_KEY'] = 'multiguess-termux-secret-key-2025'
socketio = SocketIO(app, async_mode='threading', cors_allowed_origins='*')

# Word Bank (~150 Indonesian words across common categories)
WORD_BANK = [
    # Hewan (Animals)
    "kucing", "anjing", "gajah", "harimau", "kelinci", "burung", "ikan", "jerapah",
    "monyet", "ular", "kuda", "sapi", "kambing", "ayam", "bebek", "paus", "hiu",
    "buaya", "singa", "panda", "komodo", "flamingo", "penguin", "kupu-kupu", "lebah",
    "semut", "laba-laba", "katak", "kura-kura", "kepiting", "udang", "cumi-cumi",
    # Benda (Objects)
    "meja", "kursi", "lemari", "pintu", "jendela", "lampu", "cermin", "jam dinding",
    "televisi", "kulkas", "kipas angin", "telepon", "komputer", "laptop", "sepatu",
    "sandal", "topi", "baju", "celana", "kacamata", "tas", "payung", "dompet",
    "sikat gigi", "handuk", "sabun", "piring", "sendok", "garpu", "gelas", "pisau",
    "wajan", "kompor", "botol", "buku", "pensil", "pulpen", "penghapus", "penggaris",
    "gunting", "gitar", "drum", "mobil", "sepeda", "motor", "pesawat", "kapal",
    "kereta api", "helikopter", "roket", "bus", "truk",
    # Makanan & Minuman (Food & Drink)
    "nasi goreng", "bakso", "mie ayam", "sate", "rendang", "gado-gado", "soto",
    "martabak", "pisang goreng", "es krim", "cokelat", "roti", "donat", "pizza",
    "burger", "kopi", "teh", "susu", "jus alpukat", "kelapa muda",
    # Tempat & Alam (Places & Nature)
    "gunung", "pantai", "sungai", "laut", "hutan", "air terjun", "danau", "gua",
    "awan", "matahari", "bulan", "bintang", "pelangi", "hujan", "salju", "rumah",
    "sekolah", "rumah sakit", "pasar", "bandara", "stasiun", "taman", "candi", "istana",
    # Profesi & Aktivitas (Professions & Activities)
    "dokter", "guru", "polisi", "tentara", "koki", "pilot", "nelayan", "petani",
    "pemadam kebakaran", "pelukis", "penyanyi", "memancing", "berenang", "membaca",
    "tidur", "menari", "berkemah", "memasak", "berlari"
]

# Memory State
rooms = {}

def find_free_port(start=5000, end=9000):
    for p in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("0.0.0.0", p))
                return p
            except OSError:
                continue
    raise RuntimeError("No free port found")

def get_lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

def generate_room_code():
    while True:
        code = ''.join(random.choices(string.ascii_uppercase, k=4))
        if code not in rooms:
            return code

def levenshtein_distance(s1, s2):
    s1 = s1.lower().strip()
    s2 = s2.lower().strip()
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]

def mask_word(word):
    # Mask characters with underscore, keeping spaces
    masked = []
    for char in word:
        if char == ' ':
            masked.append(' ')
        else:
            masked.append('_')
    return ' '.join(masked)

def get_room_data(room_code):
    room = rooms.get(room_code)
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
    # Sort leaderboard by score descending
    players_data.sort(key=lambda x: x['score'], reverse=True)

    current_drawer_name = ""
    if room['current_drawer'] and room['current_drawer'] in room['players']:
        current_drawer_name = room['players'][room['current_drawer']]['name']

    return {
        'room_code': room_code,
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

def broadcast_room_update(room_code):
    data = get_room_data(room_code)
    if data:
        socketio.emit('room_updated', data, to=room_code)

def start_next_turn(room_code):
    room = rooms.get(room_code)
    if not room:
        return

    # Cancel previous timer if active
    room['timer_running'] = False

    if len(room['players']) < 2:
        room['state'] = 'LOBBY'
        socketio.emit('system_message', {'text': 'Pemain kurang dari 2. Permainan kembali ke lobby.'}, to=room_code)
        broadcast_room_update(room_code)
        return

    # Check turn / round progression
    if room['drawer_index'] >= len(room['drawer_order']):
        room['current_round'] += 1
        room['drawer_index'] = 0

    if room['current_round'] > room['settings']['total_rounds']:
        # Game Over
        room['state'] = 'GAME_OVER'
        leaderboard = get_room_data(room_code)['players']
        socketio.emit('game_over', {
            'leaderboard': leaderboard
        }, to=room_code)
        broadcast_room_update(room_code)
        return

    # Pick drawer
    drawer_sid = room['drawer_order'][room['drawer_index']]
    # If drawer left room, skip
    if drawer_sid not in room['players']:
        room['drawer_index'] += 1
        start_next_turn(room_code)
        return

    room['current_drawer'] = drawer_sid
    room['state'] = 'SELECTING_WORD'
    room['strokes'] = []
    room['current_word'] = ''
    room['correct_guessers_count'] = 0
    room['turn_scores'] = {}

    # Reset player guessed status
    for sid in room['players']:
        room['players'][sid]['has_guessed'] = False

    # Choose 3 random distinct words
    room['word_options'] = random.sample(WORD_BANK, 3)

    broadcast_room_update(room_code)
    socketio.emit('clear_canvas', to=room_code)

    # Send options to drawer
    socketio.emit('choose_word_prompt', {
        'words': room['word_options'],
        'timeout': 15
    }, to=drawer_sid)

    # Start 15s timer for word selection
    room['word_select_end'] = time.time() + 15
    socketio.start_background_task(target=word_select_timer_task, room_code=room_code, drawer_sid=drawer_sid)

def word_select_timer_task(room_code, drawer_sid):
    time.sleep(15)
    room = rooms.get(room_code)
    if room and room['state'] == 'SELECTING_WORD' and room['current_drawer'] == drawer_sid:
        # Auto pick first word if not selected
        chosen = room['word_options'][0]
        on_word_chosen(room_code, drawer_sid, chosen)

def on_word_chosen(room_code, drawer_sid, chosen_word):
    room = rooms.get(room_code)
    if not room or room['state'] != 'SELECTING_WORD' or room['current_drawer'] != drawer_sid:
        return

    room['current_word'] = chosen_word
    room['state'] = 'PLAYING'
    room['time_remaining'] = room['settings']['timer_duration']

    broadcast_room_update(room_code)

    # Emit drawer private word notification
    socketio.emit('your_word', {'word': chosen_word}, to=drawer_sid)
    socketio.emit('system_message', {
        'text': f"Ronde {room['current_round']}: {room['players'][drawer_sid]['name']} sedang menggambar!"
    }, to=room_code)

    # Start drawing turn timer
    room['timer_running'] = True
    socketio.start_background_task(target=turn_timer_task, room_code=room_code)

def turn_timer_task(room_code):
    room = rooms.get(room_code)
    if not room:
        return

    while room and room.get('timer_running') and room['state'] == 'PLAYING':
        time.sleep(1)
        room = rooms.get(room_code)
        if not room or not room.get('timer_running') or room['state'] != 'PLAYING':
            break

        room['time_remaining'] -= 1
        socketio.emit('timer_tick', {'time_remaining': room['time_remaining']}, to=room_code)

        # Check turn end condition
        non_drawers = [sid for sid in room['players'] if sid != room['current_drawer']]
        all_guessed = len(non_drawers) > 0 and all(room['players'][sid]['has_guessed'] for sid in non_drawers)

        if room['time_remaining'] <= 0 or all_guessed:
            room['timer_running'] = False
            end_turn(room_code)
            break

def end_turn(room_code):
    room = rooms.get(room_code)
    if not room:
        return

    room['state'] = 'ROUND_ENDED'

    # Calculate Drawer Score (+20 per correct guesser)
    drawer_sid = room['current_drawer']
    drawer_points = 0
    if drawer_sid in room['players']:
        drawer_points = 20 * room['correct_guessers_count']
        room['players'][drawer_sid]['score'] += drawer_points
        room['turn_scores'][drawer_sid] = drawer_points

    reveal_word = room['current_word']
    turn_summary = []
    for sid, p in room['players'].items():
        turn_summary.append({
            'name': p['name'],
            'points_gained': room['turn_scores'].get(sid, 0),
            'total_score': p['score']
        })

    turn_summary.sort(key=lambda x: x['total_score'], reverse=True)

    socketio.emit('turn_ended', {
        'word': reveal_word,
        'summary': turn_summary
    }, to=room_code)

    broadcast_room_update(room_code)

    # Prepare for next turn after 5 seconds overlay
    socketio.start_background_task(target=delay_next_turn_task, room_code=room_code)

def delay_next_turn_task(room_code):
    time.sleep(5)
    room = rooms.get(room_code)
    if room and room['state'] == 'ROUND_ENDED':
        room['drawer_index'] += 1
        start_next_turn(room_code)

@app.route('/')
def index():
    return render_template('index.html')

# SocketIO Event Handlers
@socketio.on('create_room')
def handle_create_room(data):
    player_name = data.get('player_name', '').strip()
    if not player_name:
        emit('error_message', {'message': 'Nama pemain tidak boleh kosong.'})
        return

    room_code = generate_room_code()
    sid = request.sid

    rooms[room_code] = {
        'code': room_code,
        'host_sid': sid,
        'players': {
            sid: {
                'sid': sid,
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

    join_room(room_code)
    emit('room_joined', {'room_code': room_code, 'is_host': True})
    broadcast_room_update(room_code)

@socketio.on('join_room')
def handle_join_room(data):
    player_name = data.get('player_name', '').strip()
    room_code = data.get('room_code', '').strip().upper()
    sid = request.sid

    if not player_name:
        emit('error_message', {'message': 'Nama pemain tidak boleh kosong.'})
        return

    room = rooms.get(room_code)
    if not room:
        emit('error_message', {'message': 'Kode room tidak ditemukan!'})
        return

    if room['state'] != 'LOBBY':
        emit('error_message', {'message': 'Permainan di room ini sedang berlangsung.'})
        return

    join_room(room_code)
    room['players'][sid] = {
        'sid': sid,
        'name': player_name,
        'score': 0,
        'has_guessed': False
    }

    emit('room_joined', {'room_code': room_code, 'is_host': False})
    socketio.emit('system_message', {'text': f"{player_name} bergabung ke room."}, to=room_code)
    broadcast_room_update(room_code)

@socketio.on('update_settings')
def handle_update_settings(data):
    sid = request.sid
    room_code = data.get('room_code')
    room = rooms.get(room_code)

    if not room or room['host_sid'] != sid or room['state'] != 'LOBBY':
        return

    timer_duration = int(data.get('timer_duration', 75))
    total_rounds = int(data.get('total_rounds', 3))

    if timer_duration in [60, 75, 90]:
        room['settings']['timer_duration'] = timer_duration
    if total_rounds in [3, 5, 7]:
        room['settings']['total_rounds'] = total_rounds

    broadcast_room_update(room_code)

@socketio.on('start_game')
def handle_start_game(data):
    sid = request.sid
    room_code = data.get('room_code')
    room = rooms.get(room_code)

    if not room or room['host_sid'] != sid:
        return

    if len(room['players']) < 2:
        emit('error_message', {'message': 'Minimal 2 pemain untuk memulai permainan.'})
        return

    # Shuffle player order for drawer rotation
    p_sids = list(room['players'].keys())
    random.shuffle(p_sids)
    room['drawer_order'] = p_sids
    room['drawer_index'] = 0
    room['current_round'] = 1

    # Reset scores
    for p_sid in room['players']:
        room['players'][p_sid]['score'] = 0

    start_next_turn(room_code)

@socketio.on('select_word')
def handle_select_word(data):
    sid = request.sid
    room_code = data.get('room_code')
    word = data.get('word')
    room = rooms.get(room_code)

    if room and room['state'] == 'SELECTING_WORD' and room['current_drawer'] == sid:
        if word in room['word_options']:
            on_word_chosen(room_code, sid, word)

@socketio.on('draw_stroke')
def handle_draw_stroke(data):
    sid = request.sid
    room_code = data.get('room_code')
    stroke = data.get('stroke')
    room = rooms.get(room_code)

    if room and room['state'] == 'PLAYING' and room['current_drawer'] == sid:
        room['strokes'].append(stroke)
        socketio.emit('draw_stroke', stroke, to=room_code, include_self=False)

@socketio.on('clear_canvas')
def handle_clear_canvas(data):
    sid = request.sid
    room_code = data.get('room_code')
    room = rooms.get(room_code)

    if room and room['state'] == 'PLAYING' and room['current_drawer'] == sid:
        room['strokes'] = []
        socketio.emit('clear_canvas', to=room_code)

@socketio.on('undo_stroke')
def handle_undo_stroke(data):
    sid = request.sid
    room_code = data.get('room_code')
    room = rooms.get(room_code)

    if room and room['state'] == 'PLAYING' and room['current_drawer'] == sid:
        # Undo back to previous 'start' type point
        if room['strokes']:
            while room['strokes']:
                pop_s = room['strokes'].pop()
                if pop_s.get('type') == 'start':
                    break
        socketio.emit('strokes_rebuild', room['strokes'], to=room_code)

@socketio.on('send_message')
def handle_send_message(data):
    sid = request.sid
    room_code = data.get('room_code')
    text = data.get('text', '').strip()
    room = rooms.get(room_code)

    if not room or not text:
        return

    player = room['players'].get(sid)
    if not player:
        return

    # Check game state
    if room['state'] == 'PLAYING':
        # Drawer cannot guess
        if sid == room['current_drawer']:
            socketio.emit('chat_message', {
                'sender': player['name'],
                'text': text,
                'type': 'chat'
            }, to=room_code)
            return

        # If player already guessed correctly
        if player['has_guessed']:
            # Censor if text contains secret word (case-insensitive)
            secret = room['current_word'].lower().strip()
            if secret in text.lower():
                display_text = "[pesan disensor]"
            else:
                display_text = text

            socketio.emit('chat_message', {
                'sender': player['name'],
                'text': display_text,
                'type': 'chat'
            }, to=room_code)
            return

        # Player attempting a guess
        guess = text.lower().strip()
        secret = room['current_word'].lower().strip()

        if guess == secret:
            # Correct Guess!
            player['has_guessed'] = True
            room['correct_guessers_count'] += 1
            order = room['correct_guessers_count']

            time_rem = max(0, room['time_remaining'])
            points = min(100, math.floor(50 + (time_rem * 0.6)))
            # Reduce points per rank order (20% reduction per position)
            points = math.floor(points * (0.8 ** (order - 1)))
            points = max(10, points)

            player['score'] += points
            room['turn_scores'][sid] = points

            socketio.emit('chat_message', {
                'sender': player['name'],
                'text': f"*** {player['name']} menebak dengan benar! (+{points} poin)",
                'type': 'correct'
            }, to=room_code)

            broadcast_room_update(room_code)
            return

        else:
            # Check Levenshtein distance for "Hampir benar!"
            dist = levenshtein_distance(guess, secret)
            if dist <= 2 and len(secret) >= 3:
                # Private toast only to this sender sid
                emit('hampir_benar', {'message': 'Hampir benar!'}, to=sid)

            # Broadcast wrong guess as regular chat
            socketio.emit('chat_message', {
                'sender': player['name'],
                'text': text,
                'type': 'chat'
            }, to=room_code)
            return
    else:
        # Lobby / Round Ended / Game Over chat
        socketio.emit('chat_message', {
            'sender': player['name'],
            'text': text,
            'type': 'chat'
        }, to=room_code)

@socketio.on('play_again')
def handle_play_again(data):
    sid = request.sid
    room_code = data.get('room_code')
    room = rooms.get(room_code)

    if not room or room['host_sid'] != sid:
        return

    # Reset game state to LOBBY
    room['state'] = 'LOBBY'
    room['current_round'] = 1
    room['drawer_index'] = 0
    room['current_drawer'] = None
    room['current_word'] = ''
    room['strokes'] = []
    room['timer_running'] = False

    for p_sid in room['players']:
        room['players'][p_sid]['score'] = 0
        room['players'][p_sid]['has_guessed'] = False

    socketio.emit('clear_canvas', to=room_code)
    socketio.emit('system_message', {'text': 'Host telah mereset permainan ke lobby.'}, to=room_code)
    broadcast_room_update(room_code)

@socketio.on('leave_room')
def handle_leave_room(data):
    sid = request.sid
    room_code = data.get('room_code')
    room = rooms.get(room_code)

    if room and sid in room['players']:
        player_name = room['players'][sid]['name']
        del room['players'][sid]
        leave_room(room_code)

        socketio.emit('system_message', {'text': f"{player_name} meninggalkan room."}, to=room_code)

        if len(room['players']) == 0:
            del rooms[room_code]
        else:
            # Transfer host if host left
            if room['host_sid'] == sid:
                room['host_sid'] = list(room['players'].keys())[0]

            # If current drawer left during playing/selecting
            if room['current_drawer'] == sid and room['state'] in ['PLAYING', 'SELECTING_WORD']:
                end_turn(room_code)
            else:
                broadcast_room_update(room_code)

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    for room_code, room in list(rooms.items()):
        if sid in room['players']:
            player_name = room['players'][sid]['name']
            del room['players'][sid]

            socketio.emit('system_message', {'text': f"{player_name} terputus."}, to=room_code)

            if len(room['players']) == 0:
                del rooms[room_code]
            else:
                if room['host_sid'] == sid:
                    room['host_sid'] = list(room['players'].keys())[0]

                if room['current_drawer'] == sid and room['state'] in ['PLAYING', 'SELECTING_WORD']:
                    end_turn(room_code)
                else:
                    broadcast_room_update(room_code)

if __name__ == '__main__':
    port = find_free_port()
    ip = get_lan_ip()

    print("============================================")
    print("  MultiGuess server is running!")
    print(f"  Local:   http://127.0.0.1:{port}")
    print(f"  Network: http://{ip}:{port}")
    print("  Share this URL with players on the same WiFi")
    print("============================================")

    socketio.run(app, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)
