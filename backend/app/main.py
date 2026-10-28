"""FastAPI app: JSON API under /api, and the built React app on every other path."""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from typing import Literal

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import analysis, config
from .data_service import DataService
from .schemas import Health, MetricsResponse, SeriesResponse, VintagesResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

Mode = Literal["cutoff", "horizon"]
GroupBy = Literal["none", "day", "hour", "horizon"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.data = DataService()
    task = None
    if config.WARMUP_ON_STARTUP:
        # Runs in the background so the server starts accepting requests straight away.
        task = asyncio.create_task(app.state.data.warm_up())
    yield
    if task and not task.done():
        task.cancel()
    await app.state.data.client.aclose()


app = FastAPI(title="Wind Forecast Monitor", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


def _check_range(start: date, end: date) -> None:
    if end < start:
        raise HTTPException(422, "end must be on or after start")
    if (end - start).days + 1 > config.MAX_RANGE_DAYS:
        raise HTTPException(422, f"range is limited to {config.MAX_RANGE_DAYS} days")
    if end > datetime.now(timezone.utc).date():
        raise HTTPException(422, "end cannot be in the future")


async def _selected(start: date, end: date, mode: Mode, cutoff_hour: int, horizon_h: float):
    _check_range(start, end)
    win = await app.state.data.window(start, end)
    sel = analysis.select_forecast(win["forecasts"], mode=mode, cutoff_hour=cutoff_hour, horizon_h=horizon_h)
    joined, counts = analysis.join_actuals(sel, win["actuals"], start, end)
    return win, joined, counts


def _none_if_nan(v):
    return None if pd.isna(v) else v


@app.get("/api/health", response_model=Health)
async def health():
    data: DataService = app.state.data
    return Health(
        status="ok",
        elexon_reachable=await data.client.ping(),
        warmup=data.warmup_state,
        cached_days=data.cached_days(),
        default_start=config.DEFAULT_START.isoformat(),
        default_end=config.DEFAULT_END.isoformat(),
    )


@app.get("/api/series", response_model=SeriesResponse)
async def series(
    start: date = config.DEFAULT_START,
    end: date = config.DEFAULT_END,
    mode: Mode = "cutoff",
    cutoff_hour: int = Query(config.DEFAULT_CUTOFF_HOUR, ge=0, le=23),
    horizon_h: float = Query(4, ge=0, le=config.MAX_HORIZON_H),
):
    win, joined, counts = await _selected(start, end, mode, cutoff_hour, horizon_h)
    points = [
        {
            "t": r.startTime,
            "actual": _none_if_nan(r.actual),
            "forecast": _none_if_nan(r.forecast),
            "publish_time": _none_if_nan(r.publishTime),
            "horizon_h": _none_if_nan(r.horizon_h),
            "error": _none_if_nan(r.error),
        }
        for r in joined.itertuples()
    ]
    return {"source": win["source"], "unavailable_days": win["unavailable_days"], "counts": counts, "points": points}


@app.get("/api/metrics", response_model=MetricsResponse)
async def metrics(
    start: date = config.DEFAULT_START,
    end: date = config.DEFAULT_END,
    mode: Mode = "cutoff",
    cutoff_hour: int = Query(config.DEFAULT_CUTOFF_HOUR, ge=0, le=23),
    horizon_h: float = Query(4, ge=0, le=config.MAX_HORIZON_H),
    group_by: GroupBy = "none",
):
    win, joined, _ = await _selected(start, end, mode, cutoff_hour, horizon_h)
    return {
        "source": win["source"],
        "unavailable_days": win["unavailable_days"],
        "group_by": group_by,
        "overall": analysis.metrics(joined),
        "groups": [] if group_by == "none" else analysis.metrics(joined, group_by),
    }


@app.get("/api/forecast-vintages", response_model=VintagesResponse)
async def forecast_vintages(slot: datetime):
    ts = pd.Timestamp(slot)
    ts = ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")
    day = ts.tz_convert(config.UK_TZ).date()
    _check_range(day, day)
    win = await app.state.data.window(day, day)
    v = analysis.vintages(win["forecasts"], ts)
    act = win["actuals"]
    match = act.loc[act["startTime"] == ts, "generation"] if len(act) else []
    return {
        "source": win["source"],
        "slot": ts,
        "actual": float(match.iloc[0]) if len(match) else None,
        "vintages": [
            {"publish_time": r.publishTime, "forecast": r.generation, "horizon_h": r.horizon_h}
            for r in v.itertuples()
        ],
    }


# Serve the built frontend when it exists (production image). In dev, Vite serves it.
if config.FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        f = config.FRONTEND_DIST / path
        if path and f.is_file() and config.FRONTEND_DIST in f.resolve().parents:
            return FileResponse(f)
        return FileResponse(config.FRONTEND_DIST / "index.html")