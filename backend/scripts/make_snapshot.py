"""Refresh the bundled fallback snapshot from Elexon.

Run from backend/:  python -m scripts.make_snapshot
Writes data/snapshot/actuals.parquet and data/snapshot/forecasts.parquet for the
default January 2026 window. Run it on a machine that can reach data.elexon.co.uk.
"""

import asyncio
from datetime import timedelta

from app import config
from app.elexon_client import ElexonClient


async def main() -> None:
    client = ElexonClient()
    try:
        start, end = config.DEFAULT_START, config.DEFAULT_END
        actuals = await client.fetch_actuals(start, end)
        forecasts = await client.fetch_forecasts(start - timedelta(days=2), end)
    finally:
        await client.aclose()
    config.SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    actuals.to_parquet(config.SNAPSHOT_DIR / "actuals.parquet", index=False)
    forecasts.to_parquet(config.SNAPSHOT_DIR / "forecasts.parquet", index=False)
    print(f"actuals: {len(actuals)} rows, forecasts: {len(forecasts)} rows -> {config.SNAPSHOT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())