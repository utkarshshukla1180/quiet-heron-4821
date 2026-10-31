import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type Query } from './api/client'
import { Breakdown, useBreakdownTab } from './components/Breakdown'
import { Card, Empty } from './components/Card'
import { Controls } from './components/Controls'
import { ForecastChart } from './components/ForecastChart'
import { Insight, KpiTiles } from './components/KpiTiles'
import { SourceBadge as Badge } from './components/SourceBadge'
import { VintagesPanel } from './components/VintagesPanel'

const DEFAULT: Query = { start: '2026-01-02', end: '2026-02-01', mode: 'cutoff', cutoffHour: 11, horizonH: 4 }

// Decision time for the delivery day of a slot: the day before at the cutoff hour, UK time.
// January is GMT, so UK time equals UTC for the default range.
function cutoffFor(slot: string, hour: number) {
  const d = new Date(slot)
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return new Date(day - 86_400_000 + hour * 3_600_000).toISOString()
}

export default function App() {
  const [query, setQuery] = useState<Query>(DEFAULT)
  const [slot, setSlot] = useState<string | null>(null)
  const [tab, setTab] = useBreakdownTab()

  const series = useQuery({ queryKey: ['series', query], queryFn: () => api.series(query), placeholderData: keepPreviousData })
  const overall = useQuery({ queryKey: ['metrics', query], queryFn: () => api.metrics(query), placeholderData: keepPreviousData })
  const groups = useQuery({
    queryKey: ['metrics', query, tab],
    queryFn: () => api.metrics(query, tab === 'histogram' ? 'horizon' : tab),
    placeholderData: keepPreviousData,
  })

  const error = series.error ?? overall.error
  const counts = series.data?.counts

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Wind Forecast Monitor</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-ink-2">
            GB wind generation: the forecast you could have acted on versus what actually happened, January 2026.
          </p>
        </div>
        <Badge source={series.data?.source} unavailable={series.data?.unavailable_days} />
      </header>

      <div className="space-y-4">
        <Controls query={query} onChange={(q) => { setQuery(q); setSlot(null) }} />

        {error && (
          <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 text-[14px] text-red-700 dark:text-red-300">
            Could not load data: {String((error as Error).message ?? error)}
          </div>
        )}

        <Card title="Forecast accuracy" subtitle={overall.data && <Insight stats={overall.data.overall} query={query} />}>
          {overall.data ? <KpiTiles stats={overall.data.overall} /> : <Empty>Loading…</Empty>}
        </Card>

        <Card
          title="Forecast vs actual wind generation"
          subtitle={
            counts
              ? `Megawatts. Actual every 30 minutes; forecasts are hourly, so ${counts.matched_slots.toLocaleString('en-GB')} hours can be compared. Hover for details, click to see how a forecast evolved.`
              : 'Loading…'
          }
        >
          <div className={series.isFetching ? 'opacity-60 transition-opacity' : ''}>
            {series.data ? <ForecastChart points={series.data.points} onPick={setSlot} /> : <Empty>Loading…</Empty>}
          </div>
        </Card>

        {slot && (
          <VintagesPanel slot={slot} onClose={() => setSlot(null)}
            cutoffIso={query.mode === 'cutoff'
              ? cutoffFor(slot, query.cutoffHour)
              : new Date(Date.parse(slot) - query.horizonH * 3_600_000).toISOString()}
            cutoffLabel={query.mode === 'cutoff' ? 'Decision time' : `${query.horizonH} h before`} />
        )}

        <Breakdown groups={groups.data?.groups ?? []} points={series.data?.points ?? []} tab={tab} onTab={setTab}
          loading={groups.isFetching} />

        <footer className="pt-2 text-[12px] text-ink-3">
          Data: Elexon BMRS, datasets FUELHH (actual, fuel type WIND) and WINDFOR (forecast). Error = forecast − actual.
          Forecasts more than 48 hours ahead are ignored.
        </footer>
      </div>
    </div>
  )
}