import { createElement, type ComponentProps } from 'react'
import type { Mode, Query } from '../api/client'
import { Segmented } from './Card'

const MIN = '2026-01-02'
const MAX = '2026-02-01'
const pad = (n: number) => String(n).padStart(2, '0')

// A plain HTML input element.
const Field = (p: ComponentProps<'input'>) => createElement('input', p)

export function Controls({ query, onChange }: { query: Query; onChange: (q: Query) => void }) {
  const set = (patch: Partial<Query>) => onChange({ ...query, ...patch })
  const label = 'eyebrow flex flex-col gap-2 text-[11px] text-ink-3'
  const input =
    'h-9 rounded-[2px] border border-line bg-surface-1 px-2.5 font-sans text-[13px] normal-case tracking-normal text-ink tabular outline-none transition-colors focus:border-ink'

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4 border-y border-line py-4">
      <label className={label}>
        From
        <Field type="date" className={input} min={MIN} max={query.end} value={query.start}
          onChange={(e) => e.target.value && set({ start: e.target.value })} />
      </label>
      <label className={label}>
        To
        <Field type="date" className={input} min={query.start} max={MAX} value={query.end}
          onChange={(e) => e.target.value && set({ end: e.target.value })} />
      </label>

      <div className={label}>
        Which forecast to judge
        <Segmented<Mode>
          label="Forecast selection"
          value={query.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: 'cutoff', label: 'At decision time' },
            { value: 'horizon', label: 'Fixed hours ahead' },
          ]}
        />
      </div>

      {query.mode === 'cutoff' ? (
        <label className={label}>
          Decision time (day before, UK)
          <select className={input} value={query.cutoffHour} onChange={(e) => set({ cutoffHour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{pad(h)}:00{h === 11 ? ' (auction)' : ''}</option>
            ))}
          </select>
        </label>
      ) : (
        <label className={`${label} min-w-56`}>
          <span>
            Forecast made at least <span className="text-ink">{query.horizonH} h</span> before delivery
          </span>
          <Field type="range" min={0} max={48} step={1} value={query.horizonH}
            onChange={(e) => set({ horizonH: Number(e.target.value) })} className="h-10 accent-(--accent)" />
        </label>
      )}
    </div>
  )
}