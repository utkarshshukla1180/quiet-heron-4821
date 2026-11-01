# Wind Forecast Monitor: High-Level Design

## 1. Purpose

A day-ahead power buying team at a UK utility has to decide by 11:00 on day D-1 how much power to buy for day D. Wind output is uncertain, so the decision depends on the national wind forecast available at that moment.

This app answers two questions for January 2026:

1. What did the wind forecast say at the time the buying decision had to be made?
2. How far off were those forecasts compared with what was actually generated?

It does not forecast wind itself and does not recommend a purchase volume. Demand data is out of scope, so the app reports the wind forecast and its error, and the buying decision stays with the trader.

## 2. Scope

| In scope                                                                  | Out of scope               |
| ------------------------------------------------------------------------- | -------------------------- |
| GB national wind generation, actual and forecast                          | Solar, demand, prices      |
| Elexon BMRS datasets FUELHH (fuel type WIND) and WINDFOR                  | Any other data source      |
| Delivery days 2 Jan to 1 Feb 2026 (decisions made 1 to 31 Jan) by default | Building a better forecast |
| Error statistics and charts                                               | Purchase recommendations   |

The date range can be changed in the UI, up to 45 days at a time.

## 3. System overview

```
 Browser (React SPA)
     |  GET /api/series, /api/metrics, /api/forecast-vintages
     v
 FastAPI (backend/app/main.py)
     |
     v
 DataService (data_service.py) --- day cache: memory + Parquet files
     |                    \
     | missing days        \ Elexon fails
     v                      v
 ElexonClient            Snapshot Parquet files
 (elexon_client.py)      (backend/data/snapshot/)
     |
     v
 Elexon BMRS public API (no key)
```

Analysis (selecting forecasts and computing errors) is done in `analysis.py`, which has no I/O. The frontend only draws what the API returns.

## 4. Deployment

One Docker image holds both halves:

- **Stage 1** (node:22-alpine) builds the React app into static files.
- **Stage 2** (python:3.12-slim) installs the backend, copies the built files, and runs uvicorn as a non-root user on `$PORT` (default 8000).

FastAPI serves `/api/*` itself and returns the built React files for every other path, so the whole app is one container on one URL.

| Environment            | How it runs                                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production             | Vercel Container runtime. `vercel.json` defines one service built from the root `Dockerfile`; all paths go to it. Vercel env var `PORT=8000`. Public URL: https://quiet-heron-4821.vercel.app |
| Local, production-like | `docker build -t wind-forecast-monitor .` then `docker run -p 8000:8000 wind-forecast-monitor`                                                                                                |
| Local development      | `docker compose up`: backend with auto-reload on 8000, Vite dev server on 5173 that proxies `/api` to the backend                                                                             |
| Local without Docker   | `uvicorn app.main:app --reload` in `backend/`, `npm run dev` in `frontend/`                                                                                                                   |

`heroku.yml` is kept so the same image can also be deployed to Heroku.

## 5. Data sources

Both come from `https://data.elexon.co.uk/bmrs/api/v1`. No API key is needed.

**FUELHH, actual generation** (`/datasets/FUELHH/stream?settlementDateFrom=&settlementDateTo=&fuelType=WIND`)

| Field used   | Meaning                             |
| ------------ | ----------------------------------- |
| `startTime`  | Start of the 30-minute period (UTC) |
| `generation` | Wind generation in that period, MW  |

There are 48 rows per day. Example: `startTime 2026-01-12T00:00Z, generation 13954`.

**WINDFOR, wind forecast** (`/datasets/WINDFOR/stream?publishDateTimeFrom=&publishDateTimeTo=`)

| Field used    | Meaning                                   |
| ------------- | ----------------------------------------- |
| `publishTime` | When the forecast run was published (UTC) |
| `startTime`   | The hour being forecast (UTC)             |
| `generation`  | Forecast wind generation, MW              |

Each run forecasts every hour for roughly the next two days, so one delivery hour is forecast many times by successive runs. In January 2026 runs were published at about 02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30 and 22:30 UTC. Example: `publishTime 2026-01-11T09:30Z, startTime 2026-01-12T00:00Z, generation 20707`.

## 6. Backend components

| Module                     | Responsibility                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.py`                | All settings, read from environment variables with defaults: Elexon URL, timeout, retries, concurrency, cache and snapshot folders, default dates, decision hour, max horizon (48 h), max range (45 days)                                                                                                                                                           |
| `elexon_client.py`         | Calls the two Elexon endpoints. Splits ranges into chunks (7 days for actuals, 3 days for forecasts), runs at most 4 requests at once, retries failures 3 times with back-off (0.5 s, 1 s), and after a final failure marks Elexon as down for 60 s so later requests fall back immediately. Converts responses to DataFrames with UTC times and removes duplicates |
| `data_service.py`          | The only place the rest of the app gets data from. Keeps a per-day cache for actuals and for forecasts, fetches only missing days, and falls back to the snapshot when Elexon fails. Reports where the data came from: `cache`, `live` or `snapshot`                                                                                                                |
| `analysis.py`              | Pure functions: pick one forecast per hour, join forecasts to actuals, compute error statistics, list all forecasts for one hour                                                                                                                                                                                                                                    |
| `schemas.py`               | Pydantic response models, which also define the OpenAPI docs at `/docs`                                                                                                                                                                                                                                                                                             |
| `main.py`                  | FastAPI app: routes, input validation, startup warm-up, and serving the built frontend                                                                                                                                                                                                                                                                              |
| `scripts/make_snapshot.py` | Downloads January 2026 from Elexon and writes the two snapshot Parquet files                                                                                                                                                                                                                                                                                        |

## 7. Core logic

### 7.1 Choosing which forecast to judge

For each delivery hour there are many forecasts. The app picks one, in one of two modes.

**At decision time** (default, decision hour 11:00):

1. Decision moment = the day before delivery, at the decision hour, UK local time. This is converted to UTC, so it stays correct across clock changes.
2. Drop forecasts published after that moment.
3. Drop forecasts more than 48 hours ahead of the hour.
4. Keep the forecast with the latest `publishTime`.

Example for 12 Jan 00:00. The decision moment is 11 Jan 11:00, and the latest run published before it is 09:30 on 11 Jan, which forecast 20,707 MW. The actual was 13,954 MW, so the error is +6,753 MW.

**Fixed hours ahead** (slider N, 0 to 48 h): keep the latest forecast published at least N hours before the delivery hour. This shows how accuracy depends on how far ahead the forecast was made.

### 7.2 Matching forecasts to actuals

Actuals are half-hourly and forecasts are hourly. The two are joined on `startTime`, so only on-the-hour periods have both values. For 2 Jan to 1 Feb that gives 744 comparable hours. The chart still shows every half-hourly actual.

### 7.3 Error statistics

Error = forecast − actual (MW). A positive error means the forecast was too high, so less wind arrived than planned.

| Measure       | Definition                            | Why it is shown                                                        |
| ------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| MAE           | Mean of absolute errors               | Typical size of a miss                                                 |
| RMSE          | Square root of mean squared error     | Weights large misses more                                              |
| Bias          | Mean of signed errors                 | Whether forecasts lean high or low                                     |
| nMAE          | MAE ÷ mean actual × 100               | Error relative to output size                                          |
| P10, P50, P90 | 10th, 50th, 90th percentile of errors | Planning band: in 1 hour in 10 the forecast was more than P90 too high |

MAPE is not used, because wind output can be close to zero and percentage errors then become meaningless.

The same statistics are computed per group for the breakdown chart: by hours ahead (rounded down), by UK hour of day, or by UK day.

## 8. Caching and failure handling

**Cache unit.** One file per day per dataset. Actuals are keyed by UK settlement date, forecasts by UTC publish date. Files are Parquet in `CACHE_DIR/actuals/` and `CACHE_DIR/forecasts/`, and are also held in memory.

**Request path:**

1. List the days needed. Forecasts are loaded from 2 days before the start date, because a forecast for day D can be published up to 2 days earlier.
2. Days already in memory or on disk are used directly.
3. Missing days are grouped into consecutive runs and fetched from Elexon in one call per run.
4. Fetched days are saved, except today and yesterday, which may still change.
5. If the fetch fails, rows for those days come from the snapshot and the response source is `snapshot`. Days missing from the snapshot too are listed in `unavailable_days`, and the UI shows them on the source badge.

**Cache lifetime.** Past days never change, so there is no expiry. A corrupt cache file is treated as a miss. If the disk is read-only, the memory cache still works.

**Startup warm-up.** On start, a background task loads the default January range, so the first visitor does not wait for Elexon. The server accepts requests while it runs.

**Concurrency.** Each cache (actuals and forecasts) has one async lock, so two simultaneous requests for missing days do not both fetch them.

## 9. API

All endpoints are GET and return JSON. Interactive docs are at `/docs`.

| Endpoint                 | Parameters                                                                                     | Returns                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/health`            | none                                                                                           | Status, whether Elexon answers, warm-up state, number of cached days                                                                    |
| `/api/series`            | `start`, `end`, `mode` (`cutoff` or `horizon`), `cutoff_hour` (0 to 23), `horizon_h` (0 to 48) | One point per half hour: time, actual, chosen forecast, its publish time and horizon, error. Plus counts of matched and unmatched slots |
| `/api/metrics`           | Same as series, plus `group_by` (`none`, `day`, `hour`, `horizon`)                             | Overall statistics and, if grouped, statistics per group                                                                                |
| `/api/forecast-vintages` | `slot` (one delivery hour)                                                                     | Every forecast ever published for that hour, and the actual value                                                                       |

Validation: `end` must not be before `start`, the range is at most 45 days, and `end` cannot be in the future. Invalid input returns 422 with a message.

Every data response includes `source` (`cache`, `live` or `snapshot`).

## 10. Frontend

React 19 with TypeScript, built with Vite. Server data is fetched and cached with TanStack React Query, charts are drawn with Recharts, and styling uses Tailwind CSS.

| File                           | Responsibility                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `api/client.ts`                | Typed functions for each endpoint and the response types                                                                               |
| `App.tsx`                      | Holds the current query (dates, mode, decision hour, horizon), runs the three data requests, lays out the page                         |
| `components/Controls.tsx`      | Date pickers, mode switch, decision-hour dropdown or horizon slider                                                                    |
| `components/KpiTiles.tsx`      | The five statistic tiles and the one-sentence summary above them                                                                       |
| `components/ForecastChart.tsx` | Actual (orange) vs chosen forecast (blue), with the gap shaded. Clicking an hour opens the vintages panel                              |
| `components/VintagesPanel.tsx` | All forecasts for one hour plotted by publish time, the actual as a horizontal line, and the decision moment as a vertical dashed line |
| `components/Breakdown.tsx`     | Error by hours ahead, hour of day or day, and a histogram of errors ("Spread")                                                         |
| `components/SourceBadge.tsx`   | Shows whether data is cached, live or from the offline snapshot                                                                        |
| `format.ts`                    | Number and date formatting                                                                                                             |

When a control changes, React Query requests the new combination. Results are cached per combination, so switching back is instant, and the previous data stays on screen while new data loads.

## 11. Configuration

| Variable             | Default                                      | Purpose                                |
| -------------------- | -------------------------------------------- | -------------------------------------- |
| `ELEXON_BASE_URL`    | Elexon BMRS v1 URL                           | API base URL                           |
| `ELEXON_TIMEOUT_S`   | 20                                           | Timeout per request                    |
| `ELEXON_RETRIES`     | 3                                            | Attempts per request                   |
| `ELEXON_CONCURRENCY` | 4                                            | Parallel requests to Elexon            |
| `ELEXON_BACKOFF_S`   | 60                                           | How long to skip Elexon after it fails |
| `CACHE_DIR`          | `backend/cache` (`/tmp/cache` if `VERCEL=1`) | Where cache files go                   |
| `SNAPSHOT_DIR`       | `backend/data/snapshot`                      | Snapshot files                         |
| `FRONTEND_DIST`      | `frontend/dist`                              | Built frontend to serve                |
| `WARMUP_ON_STARTUP`  | 1                                            | Load January on start                  |
| `PORT`               | 8000                                         | Port uvicorn listens on (Docker)       |

## 12. Testing and CI

There are 22 pytest tests in `backend/tests/`, and Elexon is never called. HTTP calls are mocked with respx, and a fake client is used for cache tests.

| File                        | Covers                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test_analysis.py` (8)      | Forecast selection either side of the cutoff and exactly at it, the UK clock change, horizon mode, the 48 h limit, joining, metric values on hand-made data |
| `test_elexon_client.py` (6) | Chunking, parsing, retries and back-off, marking Elexon down                                                                                                |
| `test_data_service.py` (5)  | Live then cached, only missing days fetched, cache survives restart, snapshot fallback, unavailable days                                                    |
| `test_api.py` (3)           | Endpoints return the expected shape, input validation                                                                                                       |

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request with three jobs: backend tests, frontend type-check and build, and Docker image build.

## 13. Design decisions

| Decision                                                    | Reason                                                                                              | Alternative considered                                           |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Judge the latest forecast available at D-1 11:00 by default | That is the forecast the trader actually acted on; judging later forecasts would overstate accuracy | Latest forecast before delivery (kept as Fixed hours ahead, 0 h) |
| Decision hour adjustable                                    | Teams may decide earlier or later than the auction close                                            | Fixed 11:00 only                                                 |
| Fetch live from Elexon, cache per day                       | Meets the brief's "use Elexon" requirement and keeps data current if the range changes              | Commit all data as files only                                    |
| Snapshot fallback                                           | The demo still works if Elexon is down or rate-limits                                               | Fail with an error                                               |
| Analysis as pure functions                                  | Easy to test with hand-made data and easy to review                                                 | Logic inside route handlers                                      |
| Compare on-the-hour slots only                              | Forecasts are hourly; averaging two half-hours would change the actual being judged                 | Average actuals to hourly                                        |
| One Docker image serving API and frontend                   | One URL, no CORS setup in production, same image locally and on Vercel                              | Separate frontend and backend deployments                        |

## 14. Known limitations

- The cache is local to each running container. On Vercel, a container that has been idle for about 5 minutes is stopped, and the next one refetches (the warm-up covers the default range).
- In the vintages panel, the decision-time line is computed in the browser assuming UK time equals UTC. That is true for January, but would be an hour off in summer.
- `/api/health` calls Elexon on every request.
- The snapshot only covers January 2026. Outside that range, an Elexon outage means no data.
- The app shows forecast error but does not turn it into a purchase volume, because demand data is out of scope.

## 15. What the January 2026 data shows

At the 11:00 D-1 decision time, over 744 hours:

| MAE      | RMSE     | Bias      | nMAE  | P10 to P90        |
| -------- | -------- | --------- | ----- | ----------------- |
| 1,996 MW | 2,499 MW | +1,728 MW | 17.7% | −503 to +4,184 MW |

- Forecasts were too high in most hours.
- Using the latest forecast before delivery (Fixed 0 h) lowers MAE to 1,680 MW, but the bias stays at about +1.5 GW. Weather error alone would be expected to shrink close to delivery, so part of the gap is likely curtailment (wind farms told to reduce output because of grid limits). This has not been verified.
- No forecast run is published between about 22:30 and 02:30 UTC, so for 00:00 to 02:00 the "latest" forecast is 1.5 to 3.5 hours old. At 00:00 and 01:00 it was slightly worse than the 11:00 D-1 forecast.
