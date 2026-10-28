"""Settings, read from environment variables with sensible defaults."""

import os
from datetime import date
from pathlib import Path
from zoneinfo import ZoneInfo

BACKEND_DIR = Path(__file__).resolve().parent.parent

ELEXON_BASE_URL = os.getenv("ELEXON_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1")
ELEXON_TIMEOUT_S = float(os.getenv("ELEXON_TIMEOUT_S", "20"))
ELEXON_RETRIES = int(os.getenv("ELEXON_RETRIES", "3"))
ELEXON_CONCURRENCY = int(os.getenv("ELEXON_CONCURRENCY", "4"))
ELEXON_BACKOFF_S = float(os.getenv("ELEXON_BACKOFF_S", "60"))

CACHE_DIR = Path(os.getenv("CACHE_DIR", BACKEND_DIR / "cache"))
SNAPSHOT_DIR = Path(os.getenv("SNAPSHOT_DIR", BACKEND_DIR / "data" / "snapshot"))
FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST", BACKEND_DIR.parent / "frontend" / "dist"))

# Warm-up on startup can be switched off (tests, offline dev).
WARMUP_ON_STARTUP = os.getenv("WARMUP_ON_STARTUP", "1") == "1"

UK_TZ = ZoneInfo("Europe/London")

# Decisions made 1-31 January 2026 cover delivery days 2 January to 1 February.
DEFAULT_START = date(2026, 1, 2)
DEFAULT_END = date(2026, 2, 1)
DEFAULT_CUTOFF_HOUR = 11

# WINDFOR forecasts reach about 48 hours ahead.
MAX_HORIZON_H = 48
MAX_RANGE_DAYS = 45