from fastapi.testclient import TestClient

from app.main import app


def client(tmp_path, monkeypatch):
    from app import config
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(config, "SNAPSHOT_DIR", tmp_path / "snap")
    return TestClient(app)


def test_series_and_metrics(elexon, tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        r = c.get("/api/series", params={"start": "2026-01-05", "end": "2026-01-06"})
        assert r.status_code == 200
        body = r.json()
        assert body["source"] == "live"
        assert body["counts"]["actual_slots"] == 96
        assert body["counts"]["matched_slots"] == 48
        matched = [p for p in body["points"] if p["error"] is not None]
        # latest fake forecast before D-1 11:00 is the 08:30 one
        assert all(15.5 <= p["horizon_h"] <= 38.5 for p in matched)

        r = c.get("/api/metrics", params={"start": "2026-01-05", "end": "2026-01-06", "group_by": "hour"})
        m = r.json()
        assert m["source"] == "cache"
        assert m["overall"]["n"] == 48 and m["overall"]["bias"] > 0  # fake forecasts lean high
        assert len(m["groups"]) == 24


def test_vintages(elexon, tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        r = c.get("/api/forecast-vintages", params={"slot": "2026-01-05T12:00:00Z"})
        body = r.json()
        assert body["actual"] is not None
        hs = [v["horizon_h"] for v in body["vintages"]]
        assert hs == sorted(hs, reverse=True) and len(hs) > 5


def test_validation(elexon, tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        assert c.get("/api/series", params={"start": "2026-01-06", "end": "2026-01-05"}).status_code == 422
        assert c.get("/api/series", params={"cutoff_hour": 30}).status_code == 422
        assert c.get("/api/metrics", params={"group_by": "week"}).status_code == 422
        assert c.get("/api/series", params={"start": "2025-01-01", "end": "2026-01-05"}).status_code == 422