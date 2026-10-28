import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type Query } from './api/client'
import { Card, Empty } from './components/Card'
import { Controls } from './components/Controls'
import { Insight, KpiTiles } from './components/KpiTiles'

export default function App() {
  const [query, setQuery] = useState<Query>({
    start: '2026-01-02', end: '2026-02-01', mode: 'cutoff', cutoffHour: 11, horizonH: 4,
  })
  const overall = useQuery({ queryKey: ['metrics', query], queryFn: () => api.metrics(query) })
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <Controls query={query} onChange={setQuery} />
      <Card title="Forecast accuracy" subtitle={overall.data && <Insight stats={overall.data.overall} query={query} />}>
        {overall.error ? <Empty>{String(overall.error)}</Empty>
          : overall.data ? <KpiTiles stats={overall.data.overall} />
          : <Empty>Loading…</Empty>}
      </Card>
    </div>
  )
}