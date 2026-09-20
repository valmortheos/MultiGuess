import os

# [v1.0.5-OLD] APP_VERSION = "1.0.5"
# [v2.0.2-OLD] APP_VERSION = "2.0.2"
# [v2.0.3-OLD] APP_VERSION = "2.0.3"
# [v2.0.4-OLD] APP_VERSION = "2.0.4"
# [v2.0.5-OLD] APP_VERSION = "2.0.5"
# [v2.2.0-OLD] APP_VERSION = "2.2.0"
# [v2.2.1-OLD] APP_VERSION = "2.2.1"
# [v2.2.2-OLD] APP_VERSION = "2.2.2"
# [v2.2.3-OLD] APP_VERSION = "2.2.3"
APP_VERSION = "2.3.0"
DEV_MODE = os.getenv("MG_DEV_MODE", "1").lower() in ("1", "true", "yes")
CACHE_DIR_NAME = "cache"

DISCONNECT_GRACE_SECONDS = 300  # 5 minutes
MAX_PLAYERS = 8
