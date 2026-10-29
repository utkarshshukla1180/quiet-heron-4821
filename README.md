# 🌬️ Wind Forecast Monitor

[![CI][ci]](https://github.com/utkarshshukla1180/quiet-heron-4821/actions/workflows/ci.yml)
![Python][python]
![FastAPI][fastapi]
![React][react]
![TypeScript][typescript]
![Docker][docker]

> ⚡ A small web app for a GB power trader. For January 2026 it answers one question:
> **what did the wind forecast say at the moment I had to buy, and how far off do such
> forecasts usually turn out?**

It compares Elexon's national wind forecast (`WINDFOR`) 🔵 with actual wind generation
(`FUELHH`, fuel type `WIND`) 🟠, and reports the error in a way that helps size a purchase
decision: typical miss, bias, and a P10 to P90 error band.

🔗 **Live demo:** _add your Heroku link here_

## 📸 Screenshots

![Dashboard: forecast accuracy and forecast vs actual chart][dashboard]

### 🕰️ How one hour of forecasts changed

Click any hour on the chart to see every forecast published for it. Here, 12 Jan 00:00:
the forecast rose from about 20.4 GW to 21.3 GW as delivery got closer, but only 13.95 GW
of wind arrived.

![Forecast vintages for 12 Jan 00:00][vintages]

### 📊 Where the errors come from

![Typical miss by hours ahead][breakdown]

## 💡 Key finding

At the day-ahead decision time (D-1 11:00), the forecast **ran high almost all month**:
wind came in **1,996 MW** away from it in a typical hour, with a bias of **+1,728 MW**.
In 1 hour out of 10 the shortfall was over **4.2 GW**, which is a sensible amount of
cover for a trader to plan for.

## 🚀 Quick start

🐳 **With Docker** (no local Python or Node needed), the production image serves the API and
the built site from one container:

```bash
docker build -t wind-forecast-monitor .
docker run --rm -p 8000:8000 wind-forecast-monitor
# open http://localhost:8000   (API docs at http://localhost:8000/docs)
```

🛠️ **Development setup**, with live reload, in two containers:

```bash
docker compose up --build
# open http://localhost:5173
```

💻 **Without Docker** (Python 3.12+, Node 20+), in two terminals:

```bash
# terminal 1: API on :8000
cd backend
python -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
uvicorn app.main:app --reload

# terminal 2: website on :5173 (proxies /api to :8000)
cd frontend
npm ci
npm run dev
```

## ⚙️ How it works

```
Browser (React) ──/api──▶ FastAPI ──▶ DataService ──▶ day cache (memory + Parquet)
                                          │                 │ miss
                                          │                 ▼
                                          │           Elexon BMRS API (live, async, retries)
                                          │                 │ failure
                                          └───────────────▶ bundled snapshot (Parquet)
```

- 📡 **Live data, cached.** The backend calls the Elexon API while running. Data is cached
  per day (actuals by settlement date, forecasts by publish date) in memory and as
  Parquet files. A request only fetches the days that are missing. Past days never
  change, so the cache never expires.
- 🔥 **Warm start.** On startup the app loads January 2026 in the background, so the first
  visitor does not wait on Elexon.
- 🛟 **Fallback.** If Elexon is down, the app serves the snapshot committed in
  `backend/data/snapshot/`, and the page shows an "Offline snapshot" badge. After a
  failure it stops calling Elexon for 60 seconds, so pages stay fast.
  Refresh it with `python -m scripts.make_snapshot` (run from `backend/`).

### 🎯 Which forecast is judged

A forecast is only useful for the decision it informs. Two modes:

- ⏰ **At decision time** (default). GB day-ahead auctions close around 11:00 UK time on
  the day before delivery (D-1). For each delivery hour the app takes the newest forecast
  published at or before D-1 11:00. The decision hour can be changed in the UI to see how
  much a later or earlier decision would change the error.
- ⏳ **Fixed hours ahead.** For each delivery hour, the newest forecast published at least
  _N_ hours before it (0 to 48 h). This shows how error grows with forecast horizon.

Forecasts more than 48 hours ahead are ignored. "January 2026" is read as decisions made
1 to 31 January, which means delivery days 2 January to 1 February.

### 📏 Error measures

Error = forecast − actual, in MW. A positive error means the forecast was too high, so
less wind arrived than planned.

| Measure                  | What it tells the trader                                                     |
| ------------------------ | ---------------------------------------------------------------------------- |
| MAE                      | Typical size of a miss                                                       |
| RMSE                     | Same, but big misses count more                                              |
| Bias (mean error)        | Whether forecasts lean high or low                                           |
| nMAE                     | MAE as a % of mean actual output                                             |
| P10 / P50 / P90 of error | A planning band: in 1 hour out of 10 the forecast was more than P90 too high |

MAPE is left out on purpose: wind output can fall near zero, which makes percentage
errors explode.

**Resolution.** `FUELHH` actuals are half-hourly and `WINDFOR` forecasts are hourly, so
metrics compare the on-the-hour slots where both exist. The chart still shows actuals
every 30 minutes.

### 📈 January 2026 results

Judged at the default decision time (D-1 11:00 UK), over 744 hourly comparisons:

| MAE      | RMSE     | Bias      | nMAE  | P10 to P90 of error |
| -------- | -------- | --------- | ----- | ------------------- |
| 1,996 MW | 2,499 MW | +1,728 MW | 17.7% | −503 to +4,184 MW   |

The forecast ran high almost all month: in a typical hour, about 1.7 GW less wind arrived
than the day-ahead forecast said, and in 1 hour in 10 the shortfall was over 4.2 GW.

## 🔌 API

Interactive docs at `/docs`.

| Endpoint                     | Params                                                      | Returns                                                        |
| ---------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| `GET /api/health`            | none                                                        | Status, whether Elexon is reachable, warm-up state             |
| `GET /api/series`            | `start`, `end`, `mode`, `cutoff_hour`, `horizon_h`          | Per slot: time, actual, forecast, publish time, horizon, error |
| `GET /api/metrics`           | same, plus `group_by` = `none` / `day` / `hour` / `horizon` | Error measures, overall and per group                          |
| `GET /api/forecast-vintages` | `slot`                                                      | Every forecast published for one hour                          |

Every data response says where the data came from: `cache`, `live` or `snapshot`.

## 🗂️ Repository layout

```
backend/
  app/
    main.py            FastAPI app and routes; serves the built frontend in production
    elexon_client.py   async Elexon calls, chunked, with retries and back-off
    data_service.py    per-day cache, live fetch of missing days, snapshot fallback
    analysis.py        forecast selection and metrics (pure pandas, no I/O)
    schemas.py         Pydantic response models
    config.py          settings from environment variables
  scripts/make_snapshot.py
  data/snapshot/       committed fallback data
  tests/               pytest; Elexon is mocked with respx
frontend/
  src/
    api/client.ts      typed API client
    components/        controls, KPI tiles, charts
    App.tsx
Dockerfile             production image (Node build stage + Python runtime)
docker-compose.yml     local dev: backend :8000 + Vite :5173
heroku.yml             Heroku container deploy
docs/                  screenshots used in this README
.github/workflows/ci.yml  runs tests, frontend build and Docker build on every push
```

## ✅ Tests

```bash
cd backend
python -m pytest -q
```

The tests never call Elexon. They cover the forecast selection rule (forecasts either
side of the cutoff, a forecast exactly at the cutoff, the UK summer-time shift), metric
values on hand-made data, the cache (live then cached, only missing days fetched, cache
surviving a restart), the snapshot fallback, retries and back-off, and the API endpoints.
GitHub Actions runs them, the frontend type-check build and the Docker build on every push.

## ☁️ Deploy to Heroku

The app ships as one Docker image, so the deploy uses the same container as local runs.

```bash
heroku create APP_NAME
heroku stack:set container -a APP_NAME
git push heroku main
heroku open -a APP_NAME
```

Heroku's disk is wiped on each restart; the cache simply rebuilds through the startup
warm-up. Settings can be changed with environment variables (see `backend/app/config.py`),
for example `heroku config:set ELEXON_TIMEOUT_S=30`.

[ci]: https://github.com/utkarshshukla1180/quiet-heron-4821/actions/workflows/ci.yml/badge.svg
[python]: https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white
[fastapi]: https://img.shields.io/badge/FastAPI-0.162-009688?logo=fastapi&logoColor=white
[react]: https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black
[typescript]: https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white
[docker]: https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white
[dashboard]: docs/dashboard.png
[breakdown]: docs/breakdown.png
