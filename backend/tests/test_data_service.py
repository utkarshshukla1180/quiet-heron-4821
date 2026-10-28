from datetime import date

import pandas as pd

from app.data_service import DataService, _runs
from app.elexon_client import ElexonClient
from tests.fakes import actual_rows


def test_runs_groups_contiguous_days():
    days = [date(2026, 1, d) for d in (2, 3, 4, 7, 9, 10)]
    assert _runs(days) == [(date(2026, 1, 2), date(2026, 1, 4)), (date(2026, 1, 7), date(2026, 1, 7)),
                           (date(2026, 1, 9), date(2026, 1, 10))]


async def test_first_call_is_live_then_cached(elexon, tmp_path):
    svc = DataService(ElexonClient(), cache_dir=tmp_path, snapshot_dir=tmp_path / "none")
    first = await svc.window(date(2026, 1, 5), date(2026, 1, 6))
    calls = elexon.calls.call_count
    second = await svc.window(date(2026, 1, 5), date(2026, 1, 6))
    assert first["source"] == "live" and second["source"] == "cache"
    assert elexon.calls.call_count == calls  # nothing refetched
    assert len(second["actuals"]) == 96
    assert (tmp_path / "actuals" / "2026-01-05.parquet").exists()


async def test_only_missing_days_are_fetched(elexon, tmp_path):
    svc = DataService(ElexonClient(), cache_dir=tmp_path, snapshot_dir=tmp_path / "none")
    await svc.window(date(2026, 1, 5), date(2026, 1, 6))
    before = elexon.calls.call_count
    await svc.actuals.get(date(2026, 1, 5), date(2026, 1, 8))
    (req,) = [c.request for c in list(elexon.calls)[before:]]
    assert req.url.params["settlementDateFrom"] == "2026-01-07"
    assert req.url.params["settlementDateTo"] == "2026-01-08"


async def test_disk_cache_survives_restart(elexon, tmp_path):
    await DataService(ElexonClient(), cache_dir=tmp_path, snapshot_dir=tmp_path).window(date(2026, 1, 5), date(2026, 1, 5))
    before = elexon.calls.call_count
    fresh = DataService(ElexonClient(), cache_dir=tmp_path, snapshot_dir=tmp_path)
    result = await fresh.window(date(2026, 1, 5), date(2026, 1, 5))
    assert result["source"] == "cache" and elexon.calls.call_count == before


async def test_falls_back_to_snapshot(elexon_down, tmp_path):
    snap = tmp_path / "snap"
    snap.mkdir()
    df = pd.DataFrame(actual_rows(date(2026, 1, 5), date(2026, 1, 5)))[["startTime", "generation"]]
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df.to_parquet(snap / "actuals.parquet", index=False)
    svc = DataService(ElexonClient(), cache_dir=tmp_path / "cache", snapshot_dir=snap)
    result = await svc.window(date(2026, 1, 5), date(2026, 1, 6))
    assert result["source"] == "snapshot"
    assert len(result["actuals"]) == 48
    assert "2026-01-06" in result["unavailable_days"]
    # snapshot data is not written into the cache, so a later live call can replace it
    assert not (tmp_path / "cache" / "actuals").exists()