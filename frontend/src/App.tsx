import { useState } from 'react'
import type { Query } from './api/client'
import { Controls } from './components/Controls'

export default function App() {
  const [query, setQuery] = useState<Query>({
    start: '2026-01-02', end: '2026-02-01', mode: 'cutoff', cutoffHour: 11, horizonH: 4,
  })
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Controls query={query} onChange={setQuery} />
      <pre className="rounded-xl border border-line bg-surface-1 p-4 text-[13px] text-ink-2">
        {JSON.stringify(query, null, 2)}
      </pre>
    </div>
  )
}