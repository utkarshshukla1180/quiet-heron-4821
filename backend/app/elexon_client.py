"""Thin async client for the two Elexon BMRS datasets the app needs.

FUELHH  - actual half-hourly generation by fuel type (we keep WIND).
WINDFOR - wind generation forecasts, hourly, each with the time it was published.
"""

import asyncio
import logging
import time as clock
from datetime import date, datetime, time, timedelta, timezone

import httpx
import pandas as pd

from . import config

log = logging.getLogger(__name__)

ACTUAL_COLUMNS = ["startTime", "generation"]
FORECAST_COLUMNS = ["publishTime", "startTime", "generation"]


class ElexonError(RuntimeError):
    pass


def _chunks(start: date, end: date, days: int) -> list[tuple[date, date]]:
    """Split the inclusive range [start, end] into consecutive chunks of at most `days` days."""
    out = []
    cur = start
    while cur <= end:
        stop = min(cur + timedelta(days=days - 1), end)
        out.append((cur, stop))
        cur = stop + timedelta(days=1)
    return out


def _iso(d: date) -> str:
    return datetime.combine(d, time.min, tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class ElexonClient:
    def __init__(self, client: httpx.AsyncClient | None = None):
        self._client = client or httpx.AsyncClient(
            base_url=config.ELEXON_BASE_URL, timeout=config.ELEXON_TIMEOUT_S
        )
        self._sem = asyncio.Semaphore(config.ELEXON_CONCURRENCY)
        # After Elexon fails, skip live calls for a while so requests fall back fast.
        self._down_until = 0.0

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _get(self, path: str, params: dict) -> list[dict]:
        if clock.monotonic() < self._down_until:
            raise ElexonError("Elexon marked unavailable, retrying later")
        last_exc: Exception | None = None
        for attempt in range(config.ELEXON_RETRIES):
            try:
                async with self._sem:
                    resp = await self._client.get(path, params=params)
                if resp.status_code >= 500 or resp.status_code == 429:
                    raise ElexonError(f"Elexon {resp.status_code} for {path}")
                resp.raise_for_status()
                body = resp.json()
                # Stream endpoints return a bare list; others wrap it in {"data": [...]}.
                return body["data"] if isinstance(body, dict) else body
            except (httpx.HTTPError, ElexonError, ValueError) as exc:
                last_exc = exc
                log.warning("Elexon call failed (attempt %d): %s", attempt + 1, exc)
                if attempt + 1 < config.ELEXON_RETRIES:
                    await asyncio.sleep(0.5 * 2**attempt)
        self._down_until = clock.monotonic() + config.ELEXON_BACKOFF_S
        raise ElexonError(f"Elexon unavailable: {last_exc}")

    async def fetch_actuals(self, start: date, end: date) -> pd.DataFrame:
        """Wind actuals for settlement dates start..end inclusive."""

        async def one(a: date, b: date) -> list[dict]:
            return await self._get(
                "/datasets/FUELHH/stream",
                {
                    "settlementDateFrom": a.isoformat(),
                    "settlementDateTo": b.isoformat(),
                    "fuelType": "WIND",
                },
            )

        parts = await asyncio.gather(*(one(a, b) for a, b in _chunks(start, end, 7)))
        return _frame([r for p in parts for r in p], ACTUAL_COLUMNS)

    async def fetch_forecasts(self, start: date, end: date) -> pd.DataFrame:
        """Every wind forecast published on UTC days start..end inclusive."""

        async def one(a: date, b: date) -> list[dict]:
            return await self._get(
                "/datasets/WINDFOR/stream",
                {
                    "publishDateTimeFrom": _iso(a),
                    # The upper bound is inclusive; rows at the next midnight are dropped below.
                    "publishDateTimeTo": _iso(b + timedelta(days=1)),
                },
            )

        parts = await asyncio.gather(*(one(a, b) for a, b in _chunks(start, end, 3)))
        df = _frame([r for p in parts for r in p], FORECAST_COLUMNS)
        # Drop rows published exactly at the next midnight; they belong to the following day.
        next_midnight = pd.Timestamp(end + timedelta(days=1), tz="UTC")
        return df[df["publishTime"] < next_midnight].reset_index(drop=True)

    async def ping(self) -> bool:
        try:
            resp = await self._client.get(
                "/datasets/FUELHH/stream",
                params={"settlementDateFrom": "2026-01-02", "settlementDateTo": "2026-01-02", "fuelType": "WIND"},
                timeout=5,
            )
            return resp.status_code == 200
        except httpx.HTTPError:
            return False


def _frame(rows: list[dict], columns: list[str]) -> pd.DataFrame:
    if not rows:
        return empty_frame(columns)
    df = pd.DataFrame(rows)
    missing = set(columns) - set(df.columns)
    if missing:
        raise ElexonError(f"Elexon response missing fields {missing}")
    df = df[columns].copy()
    for col in columns:
        if col.endswith("Time"):
            df[col] = pd.to_datetime(df[col], utc=True)
    df["generation"] = pd.to_numeric(df["generation"], errors="coerce")
    df = df.dropna().drop_duplicates(subset=[c for c in columns if c != "generation"], keep="last")
    return df.sort_values(columns[:-1]).reset_index(drop=True)


def empty_frame(columns: list[str]) -> pd.DataFrame:
    data = {c: pd.Series(dtype="datetime64[ns, UTC]") for c in columns if c.endswith("Time")}
    data["generation"] = pd.Series(dtype="float64")
    return pd.DataFrame(data)[columns]