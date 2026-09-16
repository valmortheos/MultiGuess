import os
import time
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room

from modules.config import APP_VERSION, DEV_MODE
from modules.network import find_free_port, get_lan_ip
from modules.words import pick_three_words
from modules.scoring import is_similar_guess, calculate_guesser_points, calculate_drawer_points
from modules.cache import init_cache, get_cache_summary, persistent_load, persistent_save
from modules.game_state import RoomManager, normalize_room_code
from modules.sound_manifest import get_sound_manifest, load_sound_config, SOUND_DIR

# [v2.2.0-NEW] Dynamic RANDOM_SOUND_POOL loaded from sound_config.json filtered by existing files on disk
def get_random_sound_pool():
    config = load_sound_config()
    pool = config.get("categories", {}).get("Random", [])
    valid_pool = [p for p in pool if os.path.exists(os.path.join(SOUND_DIR, p))]
    return valid_pool if valid_pool else [
        'Random/rd_ack.mp3',
        'Random/rd_ahh.mp3',
        'Random/rd_laugh.mp3'
    ]
from modules.profanity import contains_profanity, is_profane, log_moderation
from modules.dev_bot import (
    active_dev_bots, get_active_bot, spawn_bot, remove_bot, trigger_bot_reaction
)

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'multiguess-termux-secret-key-2025')
socketio = SocketIO(app, async_mode='threading', cors_allowed_origins='*')

@app.after_request
def add_no_cache_headers(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

room_mgr = RoomManager()

# User Reaction Cooldown Tracker: sid -> last_reaction_timestamp
reaction_cooldowns = {}

# User Chat Message Rate Limit Tracker: sid -> list of timestamps
chat_timestamps = {}

def broadcast_room_update(room_code):
    data = room_mgr.get_room_data(room_code)
    if data:
        socketio.emit('room_updated', data, to=room_code)

def emit_play_sound(room_code, payload, target_sid=None, target_sids=None):
    if target_sid:
        socketio.emit('play_sound', payload, to=target_sid)
    elif target_sids:
        for sid in target_sids:
            socketio.emit('play_sound', payload, to=sid)
    else:
        socketio.emit('play_sound', payload, to=room_code)

    bot = get_active_bot(room_code)
    if bot:
        bot.on_play_sound(payload)

def start_next_turn(room_code):
    room = room_mgr.get_room(room_code)
    if not room:
        return

    room['timer_running'] = False
    room['has_played_time_remaining'] = False

    human_players = [sid for sid, p in room['players'].items() if not p.get('is_bot')]
    if len(human_players) < 2:
        room['state'] = 'LOBBY'
        socketio.emit('system_message', {'text': 'Pemain manusia kurang dari 2. Permainan kembali ke lobby.'}, to=room_code)
        broadcast_room_update(room_code)
        room_mgr.save_cache()
        return

    # [v2.2.0-NEW] Fair drawer rotation guard and round calculation
    if room['drawer_index'] >= len(room['drawer_order']):
        room['state'] = 'GAME_OVER'
        leaderboard = room_mgr.get_room_data(room_code)['players']
        socketio.emit('game_over', {
            'leaderboard': leaderboard
        }, to=room_code)
        emit_play_sound(room_code, {'type': 'WinnerScore'})
        broadcast_room_update(room_code)
        room_mgr.save_cache()
        return

    active_humans = [sid for sid, p in room['players'].items() if not p.get('is_bot')]
    human_count = room.get('human_player_count') or len(active_humans) or 1
    room['current_round'] = (room['drawer_index'] // human_count) + 1

    if room['current_round'] > room['settings']['total_rounds']:
        room['state'] = 'GAME_OVER'
        leaderboard = room_mgr.get_room_data(room_code)['players']
        socketio.emit('game_over', {
            'leaderboard': leaderboard
        }, to=room_code)
        emit_play_sound(room_code, {'type': 'WinnerScore'})
        broadcast_room_update(room_code)
        room_mgr.save_cache()
        return

    drawer_sid = room['drawer_order'][room['drawer_index']]
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

    for sid in room['players']:
        room['players'][sid]['has_guessed'] = False

    room['word_options'] = pick_three_words()

    broadcast_room_update(room_code)
    socketio.emit('clear_canvas', to=room_code)
    room_mgr.save_cache()

    socketio.emit('choose_word_prompt', {
        'words': room['word_options'],
        'timeout': 15
    }, to=drawer_sid)

    socketio.start_background_task(target=word_select_timer_task, room_code=room_code, drawer_sid=drawer_sid)

def word_select_timer_task(room_code, drawer_sid):
    # TODO: Thread timer uses time.sleep(); acceptable for small scale LAN play.
    time.sleep(15)
    room = room_mgr.get_room(room_code)
    if room and room['state'] == 'SELECTING_WORD' and room['current_drawer'] == drawer_sid:
        chosen = room['word_options'][0]
        on_word_chosen(room_code, drawer_sid, chosen)

def on_word_chosen(room_code, drawer_sid, chosen_word):
    room = room_mgr.get_room(room_code)
    if not room or room['state'] != 'SELECTING_WORD' or room['current_drawer'] != drawer_sid:
        return

    room['current_word'] = chosen_word
    room['state'] = 'COUNTDOWN'

    broadcast_room_update(room_code)
    room_mgr.save_cache()

    socketio.emit('your_word', {'word': chosen_word}, to=drawer_sid)
    socketio.emit('system_message', {
        'text': f"Ronde {room['current_round']}: {room['players'][drawer_sid]['name']} sedang menggambar!"
    }, to=room_code)

    socketio.emit('countdown_start', {'duration': 3}, to=room_code)
    socketio.start_background_task(target=countdown_timer_task, room_code=room_code)

def countdown_timer_task(room_code):
    # TODO: Thread timer uses time.sleep(); acceptable for small scale LAN play.
    time.sleep(3)
    room = room_mgr.get_room(room_code)
    if not room or room['state'] != 'COUNTDOWN':
        return

    room['state'] = 'PLAYING'
    room['time_remaining'] = room['settings']['timer_duration']

    broadcast_room_update(room_code)

    socketio.emit('round_started', {
        'drawer_sid': room['current_drawer'],
        'word_length': len(room['current_word']),
        'round': room['current_round'],
        'time_left': room['time_remaining']
    }, to=room_code)

    emit_play_sound(room_code, {'type': 'YourTurn'}, target_sid=room['current_drawer'])

    room['timer_running'] = True
    socketio.start_background_task(target=turn_timer_task, room_code=room_code)

def turn_timer_task(room_code):
    room = room_mgr.get_room(room_code)
    if not room:
        return

    while room and room.get('timer_running') and room['state'] == 'PLAYING':
        # TODO: Thread timer uses time.sleep(); acceptable for small scale LAN play.
        time.sleep(1)
        room = room_mgr.get_room(room_code)
        if not room or not room.get('timer_running') or room['state'] != 'PLAYING':
            break

        room['time_remaining'] -= 1
        socketio.emit('timer_tick', {'time_remaining': room['time_remaining']}, to=room_code)

        if room['time_remaining'] <= 20 and not room.get('has_played_time_remaining', False):
            room['has_played_time_remaining'] = True
            emit_play_sound(room_code, {'type': 'TimeRemaining'})

        non_drawers = [sid for sid in room['players'] if sid != room['current_drawer']]
        all_guessed = len(non_drawers) > 0 and all(room['players'][sid]['has_guessed'] for sid in non_drawers)

        if room['time_remaining'] <= 0 or all_guessed:
            room['timer_running'] = False
            end_turn(room_code)
            break

def end_turn(room_code):
    room = room_mgr.get_room(room_code)
    if not room:
        return

    room['state'] = 'ROUND_ENDED'

    drawer_sid = room['current_drawer']
    if drawer_sid in room['players']:
        drawer_points = calculate_drawer_points(room['correct_guessers_count'])
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

    # FailedRound sound routing:
    # Drawer never hears FailedRound.
    # non_drawer_players who haven't guessed correctly hear FailedRound.
    non_drawers = [sid for sid in room['players'] if sid != drawer_sid]
    failed_guessers = [sid for sid in non_drawers if not room['players'][sid]['has_guessed']]

    if failed_guessers:
        emit_play_sound(room_code, {'type': 'FailedRound'}, target_sids=failed_guessers)

    broadcast_room_update(room_code)
    room_mgr.save_cache()

    socketio.start_background_task(target=delay_next_turn_task, room_code=room_code)

def delay_next_turn_task(room_code):
    # TODO: Thread timer uses time.sleep(); acceptable for small scale LAN play.
    time.sleep(5)
    room = room_mgr.get_room(room_code)
    if room and room['state'] == 'ROUND_ENDED':
        room['drawer_index'] += 1
        start_next_turn(room_code)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/debug')
def debug_page():
    return jsonify({
        'version': APP_VERSION,
        'dev_mode': DEV_MODE,
        'active_rooms': len(room_mgr.rooms),
        'cache_summary': get_cache_summary()
    })

@app.route('/Sound/<path:filename>')
def serve_sound(filename):
    return send_from_directory(SOUND_DIR, filename)

@app.route('/api/sound-manifest')
def sound_manifest():
    manifest = get_sound_manifest()
    return jsonify(manifest)

# [v2.2.0-NEW] GET /api/sound-config endpoint
@app.route('/api/sound-config')
def sound_config():
    config = load_sound_config()
    return jsonify(config)

# DEV MODE API ENDPOINTS
def check_dev_mode_and_host(room_code):
    if not DEV_MODE:
        return False, jsonify({'error': 'DEV_MODE is disabled'}), 403
    room = room_mgr.get_room(room_code)
    if not room:
        return False, jsonify({'error': f'Room {room_code} not found'}), 404

    req_json = request.get_json(silent=True) or {}
    req_sid = request.headers.get('X-Socket-ID') or request.args.get('sid') or req_json.get('sid')
    if not req_sid or room.get('host_sid') != req_sid:
        return False, jsonify({'error': 'Only host can perform dev actions'}), 403
    return True, room, None

@app.route('/api/dev/bot/join', methods=['POST'])
def dev_bot_join():
    data = request.get_json() or {}
    room_code = normalize_room_code(data.get('room_code'))
    ok, res, code = check_dev_mode_and_host(room_code)
    if not ok:
        return res, code

    success, result = spawn_bot(socketio, room_mgr, room_code)
    if not success:
        return jsonify({'error': str(result)}), 400

    broadcast_room_update(room_code)
    return jsonify({'message': f'Bot {result.bot_name} joined room', 'bot_sid': result.sid})

@app.route('/api/dev/bot/leave', methods=['POST'])
def dev_bot_leave():
    data = request.get_json() or {}
    room_code = normalize_room_code(data.get('room_code'))
    ok, res, code = check_dev_mode_and_host(room_code)
    if not ok:
        return res, code

    success, result = remove_bot(socketio, room_mgr, room_code)
    if not success:
        return jsonify({'error': str(result)}), 400

    broadcast_room_update(room_code)
    return jsonify({'message': 'Bot left room'})

@app.route('/api/dev/bot/trigger_sound', methods=['POST'])
def dev_bot_trigger_sound():
    data = request.get_json() or {}
    room_code = normalize_room_code(data.get('room_code'))
    sound_type = data.get('type', 'CorrectAnswer')
    ok, res, code = check_dev_mode_and_host(room_code)
    if not ok:
        return res, code

    payload = {'type': sound_type}
    emit_play_sound(room_code, payload)
    return jsonify({'message': f'Triggered sound {sound_type} broadcast'})

@app.route('/api/dev/bot/trigger_reaction', methods=['POST'])
def dev_bot_trigger_reaction():
    data = request.get_json() or {}
    room_code = normalize_room_code(data.get('room_code'))
    slot = data.get('slot', 1)
    ok, res, code = check_dev_mode_and_host(room_code)
    if not ok:
        return res, code

    success, msg = trigger_bot_reaction(socketio, room_mgr, room_code, slot)
    if not success:
        return jsonify({'error': msg}), 400
    return jsonify({'message': msg})

@app.route('/api/dev/bot/force_round_end', methods=['POST'])
def dev_bot_force_round_end():
    data = request.get_json() or {}
    room_code = normalize_room_code(data.get('room_code'))
    ok, res, code = check_dev_mode_and_host(room_code)
    if not ok:
        return res, code

    room = res
    if room['state'] in ['PLAYING', 'COUNTDOWN', 'SELECTING_WORD']:
        room['timer_running'] = False
        end_turn(room_code)
        return jsonify({'message': 'Forced round end successfully'})
    return jsonify({'error': f'Cannot end round in state {room["state"]}'}), 400

@app.route('/api/dev/bot/status', methods=['GET'])
def dev_bot_status():
    if not DEV_MODE:
        return jsonify({'error': 'DEV_MODE is disabled'}), 403
    room_code = normalize_room_code(request.args.get('room_code'))
    active = []
    if room_code:
        bot = get_active_bot(room_code)
        if bot:
            active.append({'room_code': room_code, 'bot_name': bot.bot_name, 'bot_sid': bot.sid})
    else:
        for r_code, bot in active_dev_bots.items():
            active.append({'room_code': r_code, 'bot_name': bot.bot_name, 'bot_sid': bot.sid})
    return jsonify({'active_bots': active})

# SocketIO Handlers
@socketio.on('connect')
def handle_connect():
    print(f'[connect] sid={request.sid}')
    return True

@socketio.on('create_room')
def handle_create_room(data):
    try:
        player_name = data.get('player_name', '').strip() or data.get('name', '').strip()
        print(f'[create_room] sid={request.sid} name={player_name!r}')
        if not player_name:
            emit('error_message', {'message': 'Nama pemain tidak boleh kosong.'})
            return

        has_profanity, matched = contains_profanity(player_name)
        if has_profanity:
            log_moderation('reject_player_name', player_name, player_name, matched)
            emit('error_message', {'message': 'Nama mengandung kata yang tidak diperbolehkan.'})
            return

        sid = request.sid
        room_code = room_mgr.create_room(sid, player_name)
        print(f'[create_room] success: {room_code}')

        join_room(room_code)
        emit('room_joined', {'room_code': room_code, 'is_host': True})
        broadcast_room_update(room_code)
    except Exception as e:
        import traceback
        traceback.print_exc()
        emit('error_message', {'message': f'Server error saat membuat room: {e}'})

@socketio.on('join_room')
def handle_join_room(data):
    try:
        player_name = data.get('player_name', '').strip() or data.get('name', '').strip()
        raw_code = data.get('room_code', '')
        room_code = normalize_room_code(raw_code)
        sid = request.sid
        print(f'[join_room] sid={sid} name={player_name} code={room_code}')

        if not player_name:
            emit('error_message', {'message': 'Nama pemain tidak boleh kosong.'})
            return

        has_profanity, matched = contains_profanity(player_name)
        if has_profanity:
            log_moderation('reject_player_name', player_name, player_name, matched, room_code)
            emit('error_message', {'message': 'Nama mengandung kata yang tidak diperbolehkan.'})
            return

        if not room_code:
            emit('join_error', {'reason': 'invalid_code', 'code': raw_code})
            return

        room = room_mgr.get_room(room_code)
        if not room:
            emit('join_error', {'reason': 'not_found', 'code': room_code})
            return

        if room['state'] != 'LOBBY':
            emit('join_error', {'reason': 'in_progress', 'code': room_code})
            return

        join_room(room_code)
        room['players'][sid] = {
            'sid': sid,
            'name': player_name,
            'score': 0,
            'has_guessed': False
        }

        room_mgr.save_cache()

        emit('room_joined', {'room_code': room_code, 'is_host': False})
        socketio.emit('system_message', {'text': f"{player_name} bergabung ke room."}, to=room_code)
        broadcast_room_update(room_code)
    except Exception as e:
        import traceback
        traceback.print_exc()
        emit('error_message', {'message': f'Server error saat join room: {e}'})

@socketio.on('canvas_ready')
def handle_canvas_ready(data):
    sid = request.sid
    room_code = normalize_room_code(data.get('room_code'))
    room = room_mgr.get_room(room_code)
    if room and room['strokes']:
        emit('strokes_rebuild', room['strokes'], to=sid)

@socketio.on('cancel_room')
def handle_cancel_room(data):
    sid = request.sid
    room_code = normalize_room_code(data.get('room_code'))
    room = room_mgr.get_room(room_code)

    if room and room['host_sid'] == sid and len(room['players']) <= 1:
        leave_room(room_code)
        del room_mgr.rooms[room_code]
        room_mgr.save_cache()
        emit('room_cancelled', {'room_code': room_code})

@socketio.on('update_settings')
def handle_update_settings(data):
    sid = request.sid
    room_code = normalize_room_code(data.get('room_code'))
    room = room_mgr.get_room(room_code)

    if not room or room['host_sid'] != sid or room['state'] != 'LOBBY':
        return

    timer_duration = int(data.get('timer_duration', 75))
    total_rounds = int(data.get('total_rounds', 3))

    if timer_duration in [60, 75, 90]:
        room['settings']['timer_duration'] = timer_duration
    if total_rounds in [3, 5, 7]:
        room['settings']['total_rounds'] = total_rounds

    broadcast_room_update(room_code)
    room_mgr.save_cache()

@socketio.on('start_game')
def handle_start_game(data):
    sid = request.sid
    room_code = normalize_room_code(data.get('room_code'))
    room = room_mgr.get_room(room_code)

    if not room or room['host_sid'] != sid:
        return

    human_players = [p_sid for p_sid, p in room['players'].items() if not p.get('is_bot')]
    if len(human_players) < 2:
        emit('error_message', {'message': 'Minimal 2 pemain manusia untuk memulai permainan.'})
        return

    # [v2.2.0-OLD] Simple shuffle of human players list
    # p_sids = [p_sid for p_sid, p in room['players'].items() if not p.get('is_bot')]
    # import random
    # random.shuffle(p_sids)
    # room['drawer_order'] = p_sids

    # [v2.2.0-NEW] Fair Drawer Rotation: total_rounds * len(human_players) slots, independently shuffled per round
    import random
    total_rounds = room['settings']['total_rounds']
    fair_order = []
    for _ in range(total_rounds):
        round_sids = list(human_players)
        random.shuffle(round_sids)
        fair_order.extend(round_sids)

    room['drawer_order'] = fair_order
    room['drawer_index'] = 0
    room['human_player_count'] = len(human_players)
    room['current_round'] = 1

    for p_sid in room['players']:
        room['players'][p_sid]['score'] = 0

    start_next_turn(room_code)

@socketio.on('select_word')
def handle_select_word(data):
    sid = request.sid
    room_code = normalize_room_code(data.get('room_code'))
    word = data.get('word')
    room = room_mgr.get_room(room_code)

    if room and room['state'] == 'SELECTING_WORD' and room['current_drawer'] == sid:
        if word in room['word_options']:
            on_word_chosen(room_code, sid, word)

@socketio.on('draw_stroke')
def handle_draw_stroke(data):
    sid = request.sid
    room_code = normalize_room_code(data.get('room_code'))
    stroke = data.get('stroke')
    room = room_mgr.get_room(room_code)

    if room and room['state'] == 'PLAYING' and room['current_drawer'] == sid:
        room['strokes'].append(stroke)
        socketio.emit('draw_stroke', stroke, to=room_code, include_self=False)

@socketio.on('clear_canvas')
def handle_clear_canvas(data):
    sid = request.sid
    room_code = normalize_room_code(data.get('room_code'))
    room = room_mgr.get_room(room_code)

    if room and room['state'] == 'PLAYING' and room['current_drawer'] == sid:
        room['strokes'] = []
        socketio.emit('clear_canvas', to=room_code)

@socketio.on('undo_stroke')
def handle_undo_stroke(data):
    sid = request.sid
    room_code = normalize_room_code(data.get('room_code'))
    room = room_mgr.get_room(room_code)

    if room and room['state'] == 'PLAYING' and room['current_drawer'] == sid:
        if room['strokes']:
            while room['strokes']:
                pop_s = room['strokes'].pop()
                if pop_s.get('type') == 'start':
                    break
        socketio.emit('strokes_rebuild', room['strokes'], to=room_code)

@socketio.on('send_message')
def handle_send_message(data):
    sid = request.sid
    room_code = normalize_room_code(data.get('room_code'))
    text = data.get('text', '').strip()
    room = room_mgr.get_room(room_code)

    if not room or not text:
        return

    player = room['players'].get(sid)
    if not player:
        return

    # Chat rate limit check: max 5 messages per 5 seconds per sid
    now = time.time()
    user_msgs = chat_timestamps.get(sid, [])
    user_msgs = [ts for ts in user_msgs if now - ts < 5.0]
    if len(user_msgs) >= 5:
        emit('error_message', {'message': 'Pesan terlalu cepat. Tunggu sebentar.'}, to=sid)
        return
    user_msgs.append(now)
    chat_timestamps[sid] = user_msgs

    # Profanity moderation check
    has_profanity, matched = contains_profanity(text)
    if has_profanity:
        log_moderation('censored_chat', player['name'], text, matched, room_code)
        display_text = "[pesan disensor]"
        socketio.emit('chat_message', {
            'sender': player['name'],
            'text': display_text,
            'type': 'censored'
        }, to=room_code)

        # Broadcast Censored sound & overlay event to room
        emit_play_sound(room_code, {
            'type': 'Censored',
            'username': player['name'],
            'sender_sid': sid,
            'extra': {'original_text': text}
        })
        return

    if room['state'] == 'PLAYING':
        if sid == room['current_drawer']:
            socketio.emit('chat_message', {
                'sender': player['name'],
                'text': text,
                'type': 'chat'
            }, to=room_code)
            return

        if player['has_guessed']:
            secret = room['current_word'].lower().strip()
            if secret in text.lower():
                display_text = "[pesan disensor]"
                socketio.emit('chat_message', {
                    'sender': player['name'],
                    'text': display_text,
                    'type': 'censored'
                }, to=room_code)
                emit_play_sound(room_code, {
                    'type': 'Censored',
                    'username': player['name'],
                    'sender_sid': sid,
                    'extra': {'original_text': text}
                })
            else:
                display_text = text
                socketio.emit('chat_message', {
                    'sender': player['name'],
                    'text': display_text,
                    'type': 'chat'
                }, to=room_code)
            return

        guess = text.lower().strip()
        secret = room['current_word'].lower().strip()

        if guess == secret:
            player['has_guessed'] = True
            room['correct_guessers_count'] += 1
            order = room['correct_guessers_count']

            points = calculate_guesser_points(room['time_remaining'], order)
            player['score'] += points
            room['turn_scores'][sid] = points

            socketio.emit('chat_message', {
                'sender': player['name'],
                'text': f"*** {player['name']} menebak dengan benar! (+{points} poin)",
                'type': 'correct'
            }, to=room_code)

            emit_play_sound(room_code, {'type': 'CorrectAnswer'}, target_sid=sid)

            broadcast_room_update(room_code)
            room_mgr.save_cache()
            return

        else:
            if is_similar_guess(guess, secret):
                emit('hampir_benar', {'message': 'Hampir benar!'}, to=sid)

            emit_play_sound(room_code, {'type': 'WrongAnswer'}, target_sid=sid)

            socketio.emit('chat_message', {
                'sender': player['name'],
                'text': text,
                'type': 'chat'
            }, to=room_code)
            return
    else:
        socketio.emit('chat_message', {
            'sender': player['name'],
            'text': text,
            'type': 'chat'
        }, to=room_code)

@socketio.on('trigger_reaction')
def handle_trigger_reaction(data):
    sid = request.sid
    room_code = normalize_room_code(data.get('room_code'))
    room = room_mgr.get_room(room_code)

    if not room or sid not in room['players']:
        return

    # Cooldown check: 3 seconds per user
    now = time.time()
    last = reaction_cooldowns.get(sid, 0)
    if now - last < 3.0:
        return
    reaction_cooldowns[sid] = now

    player = room['players'][sid]
    sound_path = data.get('soundPath')
    slot = data.get('slot', 1)
    user_id = data.get('userId')

    if not sound_path:
        return

    emit_play_sound(room_code, {
        'type': 'Random',
        'username': player['name'],
        'userId': user_id,
        'soundPath': sound_path,
        'slot': slot,
        'sender_sid': sid
    })

@socketio.on('play_again')
def handle_play_again(data):
    sid = request.sid
    room_code = normalize_room_code(data.get('room_code'))
    room = room_mgr.get_room(room_code)

    if not room or room['host_sid'] != sid:
        return

    room['state'] = 'LOBBY'
    room['current_round'] = 1
    room['drawer_index'] = 0
    room['current_drawer'] = None
    room['current_word'] = ''
    room['strokes'] = []
    room['timer_running'] = False
    room['has_played_time_remaining'] = False

    for p_sid in room['players']:
        room['players'][p_sid]['score'] = 0
        room['players'][p_sid]['has_guessed'] = False

    socketio.emit('clear_canvas', to=room_code)
    socketio.emit('system_message', {'text': 'Host telah mereset permainan ke lobby.'}, to=room_code)
    broadcast_room_update(room_code)
    room_mgr.save_cache()

@socketio.on('leave_room')
def handle_leave_room(data):
    sid = request.sid
    room_code = normalize_room_code(data.get('room_code'))
    room = room_mgr.get_room(room_code)

    if room and sid in room['players']:
        player_name = room['players'][sid]['name']
        del room['players'][sid]
        leave_room(room_code)

        socketio.emit('system_message', {'text': f"{player_name} meninggalkan room."}, to=room_code)

        if len(room['players']) == 0:
            del room_mgr.rooms[room_code]
        else:
            if room['host_sid'] == sid:
                room['host_sid'] = list(room['players'].keys())[0]
                new_host_name = room['players'][room['host_sid']]['name']
                socketio.emit('system_message', {'text': f"{new_host_name} sekarang adalah host room."}, to=room_code)

            if room['current_drawer'] == sid and room['state'] in ['PLAYING', 'SELECTING_WORD']:
                end_turn(room_code)
            else:
                broadcast_room_update(room_code)

        room_mgr.save_cache()
        emit('left_room_success', to=sid)

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    if sid in reaction_cooldowns:
        del reaction_cooldowns[sid]
    if sid in chat_timestamps:
        del chat_timestamps[sid]

    for room_code, room in list(room_mgr.rooms.items()):
        if sid in room['players']:
            player_name = room['players'][sid]['name']
            del room['players'][sid]

            socketio.emit('system_message', {'text': f"{player_name} terputus."}, to=room_code)

            if len(room['players']) == 0:
                del room_mgr.rooms[room_code]
            else:
                if room['host_sid'] == sid:
                    room['host_sid'] = list(room['players'].keys())[0]
                    new_host_name = room['players'][room['host_sid']]['name']
                    socketio.emit('system_message', {'text': f"{new_host_name} sekarang adalah host room."}, to=room_code)

                if room['current_drawer'] == sid and room['state'] in ['PLAYING', 'SELECTING_WORD']:
                    end_turn(room_code)
                else:
                    broadcast_room_update(room_code)

            room_mgr.save_cache()

if __name__ == '__main__':
    init_cache()
    stale_index = persistent_load("rooms_index")
    if stale_index:
        persistent_save("rooms_index", {})

    port = find_free_port()
    ip = get_lan_ip()

    print("============================================")
    print(f"  MultiGuess server v{APP_VERSION} (dev_mode={DEV_MODE})")
    print(f"  Local:   http://127.0.0.1:{port}")
    print(f"  Network: http://{ip}:{port}")
    print("  Share this URL with players on the same WiFi")
    print(f"  {get_cache_summary()}")
    print("============================================")

    socketio.run(app, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)
