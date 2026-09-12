import os

# [v1.0.5-OLD] APP_VERSION = "1.0.5"
# [v2.0.2-OLD] APP_VERSION = "2.0.2"
APP_VERSION = "2.0.3"
DEV_MODE = os.getenv("MG_DEV_MODE", "1").lower() in ("1", "true", "yes")
CACHE_DIR_NAME = "cache"
