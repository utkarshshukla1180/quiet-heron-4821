"""The one place the rest of the app asks for data.

Data is cached per day: actuals by UK settlement date, forecasts by UTC publish date.
For a requested range the service:
  1. serves days already in memory or on disk (Parquet in CACHE_DIR),
  2. fetches only the missing days from Elexon and saves the finished ones,
  3. falls back to the bundled snapshot if Elexon fails.
Past days never change, so cached days never expire.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from . import config
from .elexon_client import ACTUAL_COLUMNS, FORECAST_COLUMNS, ElexonClient, empty_frame

log = logging.getLogger(__name__)

# Order matters: the "worst" source across all days is what a response reports.
SOURCE_RANK = {"cache": 0, "live": 1, "snapshot": 2}


def _days(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def _runs(days: list[date]) -> list[tuple[date, date]]:
    """Group sorted days into contiguous (first, last) runs, so each run is one fetch."""
    runs: list[tuple[date, date]] = []
    for d in days:
        if runs and runs[-1][1] + timedelta(days=1) == d:
            runs[-1] = (runs[-1][0], d)
        else:
            runs.append((d, d))
    return runs


def settlement_day(df: pd.DataFrame) -> pd.Series:
    return df["startTime"].dt.tz_convert(config.UK_TZ).dt.date


def publish_day(df: pd.DataFrame) -> pd.Series:
    return df["publishTime"].dt.tz_convert("UTC").dt.date


class DayCache:
    def __init__(
        self,
        name: str,
        columns: list[str],
        day_of: Callable[[pd.DataFrame], pd.Series],
        fetch: Callable[[date, date], Awaitable[pd.DataFrame]],
        cache_dir: Path,
        snapshot_file: Path,
    ):
        self.name = name
        self.columns = columns
        self.day_of = day_of
        self.fetch = fetch
        self.dir = cache_dir / name
        self.snapshot_file = snapshot_file
        self.mem: dict[date, pd.DataFrame] = {}
        self._snapshot: pd.DataFrame | None = None
        self._lock = asyncio.Lock()

    def _path(self, d: date) -> Path:
        return self.dir / f"{d.isoformat()}.parquet"

    def _load_disk(self, d: date) -> bool:
        p = self._path(d)
        if not p.exists():
            return False
        try:
            self.mem[d] = pd.read_parquet(p)
            return True
        except Exception as exc:  # a corrupt file is just a cache miss
            log.warning("Ignoring unreadable cache file %s: %s", p, exc)
            return False

    def _store(self, d: date, df: pd.DataFrame) -> None:
        self.mem[d] = df
        try:
            self.dir.mkdir(parents=True, exist_ok=True)
            df.to_parquet(self._path(d), index=False)
        except OSError as exc:  # read-only disk: memory cache still works
            log.warning("Could not write cache file for %s: %s", d, exc)

    def snapshot(self) -> pd.DataFrame:
        if self._snapshot is None:
            if self.snapshot_file.exists():
                self._snapshot = pd.read_parquet(self.snapshot_file)
            else:
                log.warning("No snapshot at %s", self.snapshot_file)
                self._snapshot = empty_frame(self.columns)
        return self._snapshot

    async def get(self, start: date, end: date) -> tuple[pd.DataFrame, str, list[date]]:
        """Rows for days start..end, the source they came from, and days with no data at all."""
        async with self._lock:
            days = _days(start, end)
            missing = [d for d in days if d not in self.mem and not self._load_disk(d)]
            source = "cache"
            extra: list[pd.DataFrame] = []
            unavailable: list[date] = []
            if missing:
                try:
                    fetched = await asyncio.gather(*(self.fetch(a, b) for a, b in _runs(missing)))
                    source = "live"
                    frame = pd.concat(fetched, ignore_index=True) if fetched else empty_frame(self.columns)
                    by_day = dict(tuple(frame.groupby(self.day_of(frame)))) if len(frame) else {}
                    # Only days at least two days old are final; newer ones may still grow.
                    final_before = datetime.now(timezone.utc).date() - timedelta(days=1)
                    for d in missing:
                        part = by_day.get(d, empty_frame(self.columns)).reset_index(drop=True)
                        if d < final_before:
                            self._store(d, part)
                        else:
                            extra.append(part)
                except Exception as exc:
                    log.warning("%s: Elexon failed (%s), using snapshot", self.name, exc)
                    source = "snapshot"
                    snap = self.snapshot()
                    snap_days = self.day_of(snap) if len(snap) else pd.Series(dtype=object)
                    part = snap[snap_days.isin(missing)] if len(snap) else snap
                    extra.append(part)
                    have = set(snap_days[snap_days.isin(missing)]) if len(snap) else set()
                    unavailable = [d for d in missing if d not in have]

            frames = [self.mem[d] for d in days if d in self.mem] + extra
            frames = [f for f in frames if len(f)]
            df = pd.concat(frames, ignore_index=True) if frames else empty_frame(self.columns)
            return df, source, unavailable


def worst(*sources: str) -> str:
    return max(sources, key=SOURCE_RANK.__getitem__)


class DataService:
    def __init__(self, client: ElexonClient | None = None, cache_dir: Path | None = None,
                 snapshot_dir: Path | None = None):
        self.client = client or ElexonClient()
        cache_dir = cache_dir or config.CACHE_DIR
        snapshot_dir = snapshot_dir or config.SNAPSHOT_DIR
        self.actuals = DayCache("actuals", ACTUAL_COLUMNS, settlement_day, self.client.fetch_actuals,
                                cache_dir, snapshot_dir / "actuals.parquet")
        self.forecasts = DayCache("forecasts", FORECAST_COLUMNS, publish_day, self.client.fetch_forecasts,
                                  cache_dir, snapshot_dir / "forecasts.parquet")
        self.warmup_state = "idle"

    async def window(self, start: date, end: date) -> dict:
        """Actuals for delivery days start..end and every forecast that could apply to them.

        A forecast for day D can be published up to two days before it, so forecasts are
        loaded from start - 2 days.
        """
        (act, s1, miss1), (fc, s2, miss2) = await asyncio.gather(
            self.actuals.get(start, end),
            self.forecasts.get(start - timedelta(days=2), end),
        )
        return {
            "actuals": act,
            "forecasts": fc,
            "source": worst(s1, s2),
            "unavailable_days": sorted({d.isoformat() for d in miss1 + miss2}),
        }

    async def warm_up(self, start: date = config.DEFAULT_START, end: date = config.DEFAULT_END) -> None:
        self.warmup_state = "running"
        try:
            result = await self.window(start, end)
            self.warmup_state = f"done ({result['source']})"
            log.info("Warm-up finished from %s", result["source"])
        except Exception as exc:
            self.warmup_state = f"failed: {exc}"
            log.exception("Warm-up failed")

    def cached_days(self) -> dict:
        return {
            "actuals": len(self.actuals.mem),
            "forecasts": len(self.forecasts.mem),
        }