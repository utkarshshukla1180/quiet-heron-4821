import { useMemo, useRef } from 'react'
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SeriesPoint } from '../api/client'
import { compactMw, dateTime, dayLabel, hours, mw, signedMw } from '../format'
import { Empty } from './Card'

interface Row {
  x: number
  actual: number | null
  forecast: number | null
  band: [number, number] | null
  p: SeriesPoint
}

function TooltipBody({ active, payload, onActive }: {
  active?: boolean
  payload?: { payload: Row }[]
  onActive: (row: Row | null) => void
}) {
  onActive(active && payload?.length ? payload[0].payload : null)
  if (!active || !payload?.length) return null
  const { p } = payload[0].payload
  return (
    <div className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-[12px] shadow-lg tabular">
      <div className="mb-1 font-semibold text-ink">{dateTime(p.t)}</div>
      <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-ink-2">
        <span>Actual</span><span className="text-right text-ink">{mw(p.actual)}</span>
        {p.forecast != null && (
          <>
            <span>Forecast</span><span className="text-right text-ink">{mw(p.forecast)}</span>
            <span>Error</span><span className="text-right text-ink">{signedMw(p.error)}</span>
            <span>Published</span><span className="text-right">{p.publish_time ? dateTime(p.publish_time) : '–'}</span>
            <span>Hours ahead</span><span className="text-right">{hours(p.horizon_h)}</span>
          </>
        )}
      </div>
      {p.forecast != null && <div className="mt-1.5 text-ink-3">Click to see every forecast for this hour</div>}
    </div>
  )
}

export function ForecastChart({ points, onPick }: { points: SeriesPoint[]; onPick: (slot: string) => void }) {
  const rows = useMemo<Row[]>(
    () =>
      points.map((p) => ({
        x: Date.parse(p.t),
        actual: p.actual,
        forecast: p.forecast,
        band: p.actual != null && p.forecast != null
          ? [Math.min(p.actual, p.forecast), Math.max(p.actual, p.forecast)]
          : null,
        p,
      })),
    [points],
  )
  // The hovered row's index, recorded by the tooltip: the chart's own mouse events report a stale index.
  const hovered = useRef<number | null>(null)
  const indexOf = useMemo(() => new Map(rows.map((r, i) => [r.x, i])), [rows])
  const ticks = useMemo(() => {
    if (!rows.length) return []
    const days = new Set<number>()
    for (const r of rows) {
      const d = new Date(r.x)
      days.add(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    }
    const all = [...days]
    const step = Math.ceil(all.length / 10)
    return all.filter((_, i) => i % step === 0)
  }, [rows])

  if (!rows.length) return <Empty>No data for this range</Empty>

  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart
        data={rows}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        onMouseLeave={() => { hovered.current = null }}
        onClick={() => {
          const i = hovered.current
          if (i == null || !rows[i]) return
          // Half-hour slots have no forecast; snap to the nearest on-the-hour slot.
          const hit = rows[i].forecast != null ? rows[i] : rows[i - 1]?.forecast != null ? rows[i - 1] : rows[i + 1]
          if (hit?.forecast != null) onPick(hit.p.t)
        }}
        style={{ cursor: 'pointer' }}
      >
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="x" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={ticks}
          tickFormatter={(v) => dayLabel(new Date(v).toISOString())}
          tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
        <YAxis tickFormatter={compactMw} width={44} tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
          axisLine={false} tickLine={false} />
        <Tooltip content={<TooltipBody onActive={(r) => { hovered.current = r ? indexOf.get(r.x) ?? null : null }} />} cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '3 3' }} />
        <Legend verticalAlign="top" align="right" height={28} iconType="plainline"
          formatter={(v) => <span className="text-[12px] text-ink-2">{v}</span>} />
        <Area dataKey="band" name="Gap (error)" stroke="none" fill="var(--band)" connectNulls isAnimationActive={false}
          activeDot={false} legendType="square" />
        <Line dataKey="actual" name="Actual" stroke="var(--series-actual)" strokeWidth={1.75} dot={false}
          isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)' }} />
        <Line dataKey="forecast" name="Forecast at decision" stroke="var(--series-forecast)" strokeWidth={2} dot={false}
          connectNulls isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)' }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}