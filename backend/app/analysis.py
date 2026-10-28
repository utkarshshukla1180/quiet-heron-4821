"""Forecast selection and error metrics. Pure functions over DataFrames, no I/O.

All times are UTC Timestamps. "Delivery day" means the UK local date of a slot.
"""

from datetime import date, datetime, time

import numpy as np
import pandas as pd

from . import config


def _delivery_day(ts: pd.Series) -> pd.Series:
    return ts.dt.tz_convert(config.UK_TZ).dt.date


def cutoff_for(delivery_day: date, cutoff_hour: int) -> pd.Timestamp:
    """The decision time for a delivery day: the day before, at cutoff_hour UK time."""
    d1 = pd.Timestamp(delivery_day) - pd.Timedelta(days=1)
    local = datetime.combine(d1.date(), time(cutoff_hour), tzinfo=config.UK_TZ)
    return pd.Timestamp(local).tz_convert("UTC")


def select_forecast(
    forecasts: pd.DataFrame,
    mode: str = "cutoff",
    cutoff_hour: int = config.DEFAULT_CUTOFF_HOUR,
    horizon_h: float = 4,
) -> pd.DataFrame:
    """Pick one forecast per delivery slot.

    mode="cutoff":  the latest forecast published at or before D-1 at cutoff_hour (UK time).
                    This is what a trader buying in the day-ahead auction could have seen.
    mode="horizon": the latest forecast published at least horizon_h hours before the slot.

    Forecasts more than MAX_HORIZON_H hours ahead are ignored in both modes.
    Returns columns startTime, forecast, publishTime, horizon_h.
    """
    cols = ["startTime", "forecast", "publishTime", "horizon_h"]
    if forecasts.empty:
        return pd.DataFrame({c: pd.Series(dtype="float64") for c in cols})

    df = forecasts.copy()
    df["horizon_h"] = (df["startTime"] - df["publishTime"]).dt.total_seconds() / 3600
    df = df[(df["horizon_h"] >= 0) & (df["horizon_h"] <= config.MAX_HORIZON_H)]

    if mode == "cutoff":
        days = _delivery_day(df["startTime"])
        cutoffs = {d: cutoff_for(d, cutoff_hour) for d in days.unique()}
        df = df[df["publishTime"] <= days.map(cutoffs)]
    elif mode == "horizon":
        df = df[df["horizon_h"] >= horizon_h]
    else:
        raise ValueError(f"unknown mode {mode!r}")

    latest = (
        df.sort_values("publishTime")
        .groupby("startTime", as_index=False)
        .last()
        .rename(columns={"generation": "forecast"})
    )
    return latest[cols].reset_index(drop=True)


def join_actuals(selected: pd.DataFrame, actuals: pd.DataFrame, start: date, end: date) -> tuple[pd.DataFrame, dict]:
    """Every actual slot on delivery days start..end, with its selected forecast if there is one.

    Forecasts are hourly and actuals half-hourly, so only on-the-hour slots get a forecast.
    Returns the frame and counts of slots that could not be compared.
    """
    act = actuals.rename(columns={"generation": "actual"})
    act = act[_delivery_day(act["startTime"]).between(start, end)] if len(act) else act
    sel = selected
    if len(sel):
        sel = sel[_delivery_day(sel["startTime"]).between(start, end)]
    merged = act.merge(sel, on="startTime", how="outer").sort_values("startTime").reset_index(drop=True)
    merged["error"] = merged["forecast"] - merged["actual"]
    counts = {
        "actual_slots": int(merged["actual"].notna().sum()),
        "forecast_slots": int(merged["forecast"].notna().sum()),
        "matched_slots": int(merged["error"].notna().sum()),
        "forecast_without_actual": int((merged["forecast"].notna() & merged["actual"].isna()).sum()),
    }
    return merged, counts


def _stats(err: pd.Series, actual: pd.Series) -> dict:
    err = err.dropna()
    n = int(len(err))
    if n == 0:
        return {"n": 0, "mae": None, "rmse": None, "bias": None, "nmae_pct": None,
                "p10": None, "p50": None, "p90": None}
    mean_actual = float(actual.loc[err.index].mean())
    mae = float(err.abs().mean())
    return {
        "n": n,
        "mae": mae,
        "rmse": float(np.sqrt((err**2).mean())),
        "bias": float(err.mean()),
        "nmae_pct": 100 * mae / mean_actual if mean_actual else None,
        "p10": float(err.quantile(0.10)),
        "p50": float(err.quantile(0.50)),
        "p90": float(err.quantile(0.90)),
    }


def metrics(df: pd.DataFrame, group_by: str = "none") -> dict | list[dict]:
    """Error measures over matched slots, overall or per group (day, hour, horizon)."""
    m = df.dropna(subset=["error"])
    if group_by == "none":
        return _stats(m["error"], m["actual"])
    if m.empty:
        return []
    local = m["startTime"].dt.tz_convert(config.UK_TZ)
    keys = {
        "day": local.dt.date.astype(str),
        "hour": local.dt.hour,
        "horizon": np.floor(m["horizon_h"]).astype(int),
    }
    if group_by not in keys:
        raise ValueError(f"unknown group_by {group_by!r}")
    out = []
    for key, g in m.groupby(keys[group_by]):
        out.append({"group": key if isinstance(key, str) else int(key), **_stats(g["error"], g["actual"])})
    return out


def vintages(forecasts: pd.DataFrame, slot: pd.Timestamp) -> pd.DataFrame:
    """Every forecast ever published for one slot, oldest first."""
    v = forecasts[forecasts["startTime"] == slot].sort_values("publishTime").copy()
    v["horizon_h"] = (v["startTime"] - v["publishTime"]).dt.total_seconds() / 3600
    return v[v["horizon_h"] >= 0].reset_index(drop=True)