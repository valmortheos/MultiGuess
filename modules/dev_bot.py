import uuid
import time
import random
from modules.config import DEV_MODE

from modules.sound_manifest import load_sound_config

class DevBot:
    def __init__(self, socketio, room_code, bot_name="Bot-Dev"):
        self.socketio = socketio
        self.room_code = room_code
        self.bot_name = bot_name
        self.mg_user_id = str(uuid.uuid4())
        self.sid = f"BOT-{self.mg_user_id[:8]}"

        cfg = load_sound_config()
        random_pool = list(cfg.get('categories', {}).get('Random', []))
        if random_pool:
            all_sounds = list(random_pool)
            for i in range(len(all_sounds) - 1, 0, -1):
                j = random.randint(0, i)
                all_sounds[i], all_sounds[j] = all_sounds[j], all_sounds[i]
            self.random_sounds = all_sounds[:3]
        else:
            self.random_sounds = []

    def log(self, level, message):
        ts = int(time.time() * 1000)
        formatted = f"[Bot-{self.room_code}] {message}"
        print(formatted)
        if self.socketio:
            self.socketio.emit("dev_log", {
                "level": level,
                "message": formatted,
                "ts": ts
            }, to=self.room_code)

    def send_ack(self, event_type, payload):
        received_at = int(time.time() * 1000)
        self.log("info", f"ACK sent for {event_type}")
        if self.socketio:
            self.socketio.emit("bot_ack", {
                "type": event_type,
                "payload": payload,
                "received_at": received_at
            }, to=self.room_code)

    def on_play_sound(self, payload):
        sound_type = payload.get("type")
        self.log("info", f"Received play_sound: {sound_type}")
        self.send_ack(sound_type, payload)

    def on_round_started(self, payload):
        self.log("info", f"Round started: round={payload.get('round')}")

    def on_room_updated(self, payload):
        self.log("info", f"Room updated: state={payload.get('state')}")

    def on_chat_message(self, payload):
        self.log("info", f"Chat msg from {payload.get('sender')}: {payload.get('text')}")


# Global active bots store: room_code -> DevBot
active_dev_bots = {}

def get_active_bot(room_code):
    return active_dev_bots.get(room_code)

def spawn_bot(socketio, room_mgr, room_code):
    if not DEV_MODE:
        return False, "DEV_MODE is disabled"

    room = room_mgr.get_room(room_code)
    if not room:
        return False, f"Room {room_code} not found"

    if room_code in active_dev_bots:
        return False, f"Bot already exists in room {room_code}"

    bot = DevBot(socketio, room_code)
    active_dev_bots[room_code] = bot

    room['players'][bot.sid] = {
        'sid': bot.sid,
        'name': bot.bot_name,
        'score': 0,
        'has_guessed': False,
        'is_bot': True
    }

    room_mgr.save_cache()

    socketio.emit("dev_bot_joined", {
        "bot_name": bot.bot_name,
        "bot_user_id": bot.mg_user_id,
        "bot_sid": bot.sid
    }, to=room_code)

    socketio.emit("system_message", {
        "text": f"🤖 {bot.bot_name} (Bot Dev) bergabung ke room."
    }, to=room_code)

    bot.log("info", f"Joined room {room_code}")
    return True, bot

def remove_bot(socketio, room_mgr, room_code):
    bot = active_dev_bots.get(room_code)
    if not bot:
        return False, f"No bot found in room {room_code}"

    room = room_mgr.get_room(room_code)
    if room and bot.sid in room['players']:
        del room['players'][bot.sid]
        room_mgr.save_cache()

    del active_dev_bots[room_code]

    socketio.emit("dev_bot_left", {
        "bot_name": bot.bot_name,
        "bot_user_id": bot.mg_user_id,
        "bot_sid": bot.sid
    }, to=room_code)

    socketio.emit("system_message", {
        "text": f"🤖 {bot.bot_name} (Bot Dev) meninggalkan room."
    }, to=room_code)

    bot.log("info", f"Left room {room_code}")
    return True, "Bot removed"

def trigger_bot_reaction(socketio, room_mgr, room_code, slot):
    bot = active_dev_bots.get(room_code)
    if not bot:
        return False, f"No bot active in room {room_code}"

    room = room_mgr.get_room(room_code)
    if not room:
        return False, f"Room {room_code} not found"

    slot_idx = max(0, min(2, int(slot) - 1))
    sound_path = bot.random_sounds[slot_idx]

    payload = {
        'type': 'Random',
        'username': bot.bot_name,
        'userId': bot.mg_user_id,
        'soundPath': sound_path,
        'slot': slot,
        'sender_sid': bot.sid
    }

    socketio.emit('play_sound', payload, to=room_code)
    bot.on_play_sound(payload)
    return True, "Bot reaction triggered"
