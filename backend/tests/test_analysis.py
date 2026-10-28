from datetime import date

import pandas as pd
import pytest

from app import analysis

T = pd.Timestamp


def fc(rows):
    df = pd.DataFrame(rows, columns=["publishTime", "startTime", "generation"])
    for c in ("publishTime", "startTime"):
        df[c] = pd.to_datetime(df[c], utc=True)
    return df


def test_cutoff_is_previous_day_uk_time():
    assert analysis.cutoff_for(date(2026, 1, 10), 11) == T("2026-01-09 11:00", tz="UTC")
    # In summer UK time is UTC+1, so 11:00 local is 10:00 UTC.
    assert analysis.cutoff_for(date(2026, 7, 10), 11) == T("2026-07-09 10:00", tz="UTC")


def test_cutoff_picks_latest_forecast_before_cutoff_only():
    slot = "2026-01-10T12:00Z"
    df = fc([
        ("2026-01-09T08:30Z", slot, 100),  # before cutoff
        ("2026-01-09T10:30Z", slot, 200),  # latest before cutoff -> chosen
        ("2026-01-09T11:30Z", slot, 300),  # after cutoff, a trader could not have seen it
    ])
    sel = analysis.select_forecast(df, mode="cutoff", cutoff_hour=11)
    assert sel["forecast"].tolist() == [200]
    assert sel["horizon_h"].iloc[0] == pytest.approx(25.5)


def test_forecast_published_exactly_at_cutoff_counts():
    df = fc([("2026-01-09T11:00Z", "2026-01-10T00:00Z", 50)])
    assert analysis.select_forecast(df, cutoff_hour=11)["forecast"].tolist() == [50]


def test_moving_the_cutoff_changes_the_choice():
    slot = "2026-01-10T12:00Z"
    df = fc([("2026-01-09T08:30Z", slot, 100), ("2026-01-09T10:30Z", slot, 200)])
    assert analysis.select_forecast(df, cutoff_hour=9)["forecast"].tolist() == [100]


def test_horizon_mode_and_max_horizon():
    slot = "2026-01-10T12:00Z"
    df = fc([
        ("2026-01-07T12:00Z", slot, 10),   # 72 h ahead, beyond 48 h, ignored
        ("2026-01-10T06:00Z", slot, 20),   # 6 h ahead
        ("2026-01-10T10:00Z", slot, 30),   # 2 h ahead
    ])
    assert analysis.select_forecast(df, mode="horizon", horizon_h=4)["forecast"].tolist() == [20]
    assert analysis.select_forecast(df, mode="horizon", horizon_h=1)["forecast"].tolist() == [30]
    assert analysis.select_forecast(df, mode="horizon", horizon_h=50).empty


def _actuals(rows):
    df = pd.DataFrame(rows, columns=["startTime", "generation"])
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    return df


def test_join_keeps_all_actual_slots_and_counts_gaps():
    sel = analysis.select_forecast(fc([
        ("2026-01-09T10:00Z", "2026-01-10T00:00Z", 110),
        ("2026-01-09T10:00Z", "2026-01-10T01:00Z", 90),
        ("2026-01-09T10:00Z", "2026-01-11T00:00Z", 90),  # outside the range
    ]))
    act = _actuals([("2026-01-10T00:00Z", 100), ("2026-01-10T00:30Z", 100)])
    joined, counts = analysis.join_actuals(sel, act, date(2026, 1, 10), date(2026, 1, 10))
    assert counts == {"actual_slots": 2, "forecast_slots": 2, "matched_slots": 1, "forecast_without_actual": 1}
    assert joined["error"].dropna().tolist() == [10]


def test_metrics_values():
    df = pd.DataFrame({
        "startTime": pd.to_datetime(["2026-01-10T00:00Z", "2026-01-10T01:00Z", "2026-01-11T00:00Z", "2026-01-11T01:00Z"], utc=True),
        "actual": [100.0, 100.0, 100.0, 100.0],
        "forecast": [110.0, 90.0, 130.0, 100.0],
        "horizon_h": [24.5, 25.5, 24.5, 25.5],
    })
    df["error"] = df["forecast"] - df["actual"]
    m = analysis.metrics(df)
    assert m["n"] == 4
    assert m["mae"] == pytest.approx(12.5)
    assert m["bias"] == pytest.approx(7.5)
    assert m["rmse"] == pytest.approx((1100 / 4) ** 0.5)
    assert m["nmae_pct"] == pytest.approx(12.5)
    assert m["p50"] == pytest.approx(5)
    by_day = analysis.metrics(df, "day")
    assert [g["group"] for g in by_day] == ["2026-01-10", "2026-01-11"]
    assert by_day[0]["bias"] == 0
    by_h = analysis.metrics(df, "horizon")
    assert [g["group"] for g in by_h] == [24, 25]


def test_metrics_empty():
    df = pd.DataFrame({"startTime": pd.Series(dtype="datetime64[ns, UTC]"), "actual": [], "forecast": [],
                       "horizon_h": [], "error": []})
    assert analysis.metrics(df)["n"] == 0
    assert analysis.metrics(df, "hour") == []