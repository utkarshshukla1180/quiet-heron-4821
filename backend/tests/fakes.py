"""Synthetic Elexon-shaped data, so tests and offline dev never need the real API."""

import math
from datetime import date, datetime, timedelta, timezone
from urllib.parse import parse_qs

import httpx


def _wind(t: datetime) -> float:
    h = (t - datetime(2026, 1, 1, tzinfo=timezone.utc)).total_seconds() / 3600
    return round(12000 + 6000 * math.sin(h / 30) + 1500 * math.sin(h / 5), 1)


def _iso(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def actual_rows(start: date, end: date) -> list[dict]:
    rows = []
    d = start
    while d <= end:
        t0 = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)  # winter: UK time == UTC
        for p in range(48):
            t = t0 + timedelta(minutes=30 * p)
            rows.append({"dataset": "FUELHH", "publishTime": _iso(t + timedelta(minutes=30)),
                         "startTime": _iso(t), "settlementDate": d.isoformat(),
                         "settlementPeriod": p + 1, "fuelType": "WIND", "generation": _wind(t)})
        d += timedelta(days=1)
    return rows


def forecast_rows(pub_from: datetime, pub_to: datetime, every_h: int = 3) -> list[dict]:
    """Forecasts published every `every_h` hours, each covering the next 48 hours hourly.

    Forecast = actual + 20 MW per hour of horizon (a bias that grows with horizon) + noise.
    """
    rows = []
    first = pub_from.replace(minute=30, second=0)
    if first < pub_from:
        first += timedelta(hours=1)
    pub = first
    while pub <= pub_to:
        if pub.hour % every_h == 2:  # 02:30, 05:30, ... like the real feed's rhythm
            start = pub.replace(minute=0) + timedelta(hours=1)
            for k in range(48):
                t = start + timedelta(hours=k)
                horizon = (t - pub).total_seconds() / 3600
                rows.append({"dataset": "WINDFOR", "publishTime": _iso(pub), "startTime": _iso(t),
                             "generation": round(_wind(t) + 20 * horizon + 900 * math.sin(k * 1.7 + pub.day))})
        pub += timedelta(hours=1)
    return rows


def _parse_dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def elexon_handler(request: httpx.Request) -> httpx.Response:
    """An httpx/respx side effect that answers like the two Elexon stream endpoints."""
    q = {k: v[0] for k, v in parse_qs(request.url.query.decode()).items()}
    if request.url.path.endswith("/FUELHH/stream"):
        rows = actual_rows(date.fromisoformat(q["settlementDateFrom"]), date.fromisoformat(q["settlementDateTo"]))
    else:
        rows = forecast_rows(_parse_dt(q["publishDateTimeFrom"]), _parse_dt(q["publishDateTimeTo"]))
    return httpx.Response(200, json=rows)