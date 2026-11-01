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

🔗 **Live demo:** https://quiet-heron-4821.vercel.app

🎥 **Video walkthrough:** _add your YouTube link here_

📐 **Design document:** [docs/HLD.md](docs/HLD.md)

## 📸 Screenshots

![Dashboard: forecast accuracy and forecast vs actual chart][dashboard]

### 🕰️ How one hour of forecasts changed

Click any hour on the chart to see every forecast published for it. Here, 12 Jan 00:00:
the forecast rose from about 20.4 GW to 21.3 GW as delivery got closer, but only 13.95 GW
of wind arrived. The dashed vertical line marks the cut-off (the decision time, or "N h
before" in fixed-hours mode); the newest point left of it is the forecast being judged.

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

💻 **Without Docker** (Python 3.12+, Node 22+), in two terminals:

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
- 🖥️ **Frontend.** React 19 + TypeScript, built with Vite. Data comes through a typed API
  client and TanStack React Query; charts are Recharts; styling is Tailwind CSS. The page
  opens with a full-screen windmill video that shrinks as you scroll, and sections fade in
  on scroll (switched off when the system asks for reduced motion).
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
  Overnight there is a gap in the forecast schedule (no run between about 22:30 and 02:30
  UTC), so for 00:00 to 02:00 even "0 h" uses a forecast 1.5 to 3.5 hours old.

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

Using the latest forecast before delivery (fixed hours ahead, 0 h) lowers the MAE to
1,680 MW, but the bias stays around +1.5 GW. A forecast made that close to delivery should
not be that far off because of weather alone, so part of the gap is likely curtailment
(wind farms told to reduce output because of grid limits). This is not verified.

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
  Dockerfile           dev image used by docker-compose (uvicorn --reload)
  requirements.txt     runtime packages; requirements-dev.txt adds pytest, respx
  app/
    main.py            FastAPI app and routes; serves the built frontend in production
    elexon_client.py   async Elexon calls, chunked, with retries and back-off
    data_service.py    per-day cache, live fetch of missing days, snapshot fallback
    analysis.py        forecast selection and metrics (pure pandas, no I/O)
    schemas.py         Pydantic response models
    config.py          settings from environment variables
  scripts/make_snapshot.py
  data/snapshot/       committed fallback data
  tests/               22 pytest tests; Elexon is mocked with respx
frontend/
  Dockerfile           dev image used by docker-compose (Vite dev server)
  public/windmill.mp4  hero video
  src/
    api/client.ts      typed API client
    App.tsx            page layout, current query, data requests
    format.ts          number and date formatting
    components/
      Hero.tsx, Motion.tsx, ScrollStatement.tsx   opening video and scroll effects
      Controls.tsx     dates, mode, decision hour / horizon slider
      KpiTiles.tsx     the five error measures and summary sentence
      ForecastChart.tsx  actual vs forecast, gap shaded; click an hour for its history
      VintagesPanel.tsx  every forecast for one hour, with the cut-off line
      Breakdown.tsx    error by hours ahead, hour of day, day, and a histogram
      SourceBadge.tsx  cached / live / offline snapshot
      Card.tsx         shared card, tabs and empty state
Dockerfile             production image (Node build stage + Python runtime)
docker-compose.yml     local dev: backend :8000 + Vite :5173
vercel.json            Vercel deploy: builds the root Dockerfile as one container
heroku.yml             alternative Heroku container deploy
docs/HLD.md            high-level design
docs/*.png             screenshots used in this README
.github/workflows/ci.yml  runs tests, frontend build and Docker build on every push
```

## ✅ Tests

```bash
cd backend
python -m pytest -q
```

There are 22 tests, and none of them call Elexon. They cover the forecast selection rule (forecasts either
side of the cutoff, a forecast exactly at the cutoff, the UK summer-time shift), metric
values on hand-made data, the cache (live then cached, only missing days fetched, cache
surviving a restart), the snapshot fallback, retries and back-off, and the API endpoints.
GitHub Actions runs them, the frontend type-check build and the Docker build on every push.

## ☁️ Deployment (Vercel)

The live app runs on Vercel's container runtime, using the same Docker image as local runs.
`vercel.json` tells Vercel to build the root `Dockerfile` as one service and send every
request to it:

1. Import the GitHub repo in Vercel (root directory `./`, no framework preset).
2. Add the environment variable `PORT=8000`, so Vercel sends traffic to the port uvicorn
   listens on.
3. Deploy. Every push to `main` redeploys automatically.

The cache lives inside the running container. When Vercel stops an idle container, the next
one reloads January through the startup warm-up (or the snapshot if Elexon is down).
Other settings can be changed with environment variables (see `backend/app/config.py`).

**Heroku** works with the same image: `heroku.yml` is included, so `heroku create`,
`heroku stack:set container` and `git push heroku main` deploy it.

## 🤖 Use of AI tools

I used Claude Code as a pair programmer to draft parts of the code, tests and docs, and to
help debug. I made the design decisions, and I reviewed, ran and tested all the code myself.

[ci]: https://github.com/utkarshshukla1180/quiet-heron-4821/actions/workflows/ci.yml/badge.svg
[python]: https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white
[fastapi]: https://img.shields.io/badge/FastAPI-0.162-009688?logo=fastapi&logoColor=white
[react]: https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black
[typescript]: https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white
[docker]: https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white
[dashboard]: docs/dashboard.png
[breakdown]: docs/breakdown.png
[vintages]: docs/vintages.png
