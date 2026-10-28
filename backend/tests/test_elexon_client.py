from datetime import date

import httpx
import pytest

from app import config
from app.elexon_client import ElexonClient, ElexonError, _chunks


def test_chunks_cover_range_without_gaps():
    chunks = _chunks(date(2026, 1, 1), date(2026, 1, 17), 7)
    assert chunks == [
        (date(2026, 1, 1), date(2026, 1, 7)),
        (date(2026, 1, 8), date(2026, 1, 14)),
        (date(2026, 1, 15), date(2026, 1, 17)),
    ]


async def test_fetch_actuals_parses_and_spans_chunks(elexon):
    client = ElexonClient()
    df = await client.fetch_actuals(date(2026, 1, 2), date(2026, 1, 10))
    await client.aclose()
    assert list(df.columns) == ["startTime", "generation"]
    assert len(df) == 9 * 48
    assert str(df["startTime"].dt.tz) == "UTC"
    assert df["startTime"].is_monotonic_increasing
    assert elexon.calls.call_count == 2  # 7-day chunks


async def test_fetch_forecasts_keeps_only_requested_publish_days(elexon):
    client = ElexonClient()
    df = await client.fetch_forecasts(date(2026, 1, 1), date(2026, 1, 1))
    await client.aclose()
    assert df["publishTime"].dt.date.unique().tolist() == [date(2026, 1, 1)]
    assert {"publishTime", "startTime", "generation"} == set(df.columns)


async def test_retries_then_succeeds(respx_mock):
    route = respx_mock.get(f"{config.ELEXON_BASE_URL}/datasets/FUELHH/stream")
    route.side_effect = [httpx.Response(503), httpx.Response(200, json=[
        {"startTime": "2026-01-02T00:00:00Z", "generation": 100, "fuelType": "WIND"}])]
    client = ElexonClient()
    df = await client.fetch_actuals(date(2026, 1, 2), date(2026, 1, 2))
    await client.aclose()
    assert len(df) == 1 and route.call_count == 2


async def test_gives_up_after_retries(elexon_down):
    client = ElexonClient()
    with pytest.raises(ElexonError):
        await client.fetch_actuals(date(2026, 1, 2), date(2026, 1, 2))
    await client.aclose()


async def test_backs_off_after_failure(elexon_down, monkeypatch):
    monkeypatch.setattr(config, "ELEXON_BACKOFF_S", 60)
    client = ElexonClient()
    with pytest.raises(ElexonError):
        await client.fetch_actuals(date(2026, 1, 2), date(2026, 1, 2))
    calls = elexon_down.calls.call_count
    with pytest.raises(ElexonError):
        await client.fetch_actuals(date(2026, 1, 2), date(2026, 1, 2))
    assert elexon_down.calls.call_count == calls  # no new network call while backing off
    await client.aclose()