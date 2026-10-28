import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { GroupStats, SeriesPoint } from '../api/client'
import { compactMw, mw, signedMw } from '../format'
import { Card, Empty, Segmented } from './Card'

type Tab = 'horizon' | 'hour' | 'day' | 'histogram'

const axis = { tick: { fill: 'var(--text-muted)', fontSize: 12 }, tickLine: false }

function GroupTip({ active, payload, unit }: { active?: boolean; payload?: { payload: GroupStats }[]; unit: (g: GroupStats['group']) => string }) {
  if (!active || !payload?.length) return null
  const g = payload[0].payload
  return (
    <div className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-[12px] shadow-lg tabular">
      <div className="mb-1 font-semibold text-ink">{unit(g.group)}</div>
      <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-ink-2">
        <span>MAE</span><span className="text-right text-ink">{mw(g.mae)}</span>
        <span>Bias</span><span className="text-right">{signedMw(g.bias)}</span>
        <span>P10 … P90</span><span className="text-right">{signedMw(g.p10)} … {signedMw(g.p90)}</span>
        <span>Hours compared</span><span className="text-right">{g.n}</span>
      </div>
    </div>
  )
}

const LABEL: Record<Exclude<Tab, 'histogram'>, (g: GroupStats['group']) => string> = {
  horizon: (g) => `${g}–${Number(g) + 1} h ahead`,
  hour: (g) => `${String(g).padStart(2, '0')}:00 UK`,
  day: (g) => new Date(String(g)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
}

function GroupChart({ groups, tab }: { groups: GroupStats[]; tab: Exclude<Tab, 'histogram'> }) {
  if (!groups.length) return <Empty>Nothing to compare</Empty>
  const tickFmt = tab === 'day' ? (g: string) => String(Number(String(g).slice(8))) : tab === 'horizon' ? (g: number) => `${g}h` : (g: number) => String(g).padStart(2, '0')
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={groups} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="group" {...axis} axisLine={{ stroke: 'var(--border)' }} tickFormatter={tickFmt as (v: unknown) => string} interval="preserveStartEnd" />
        <YAxis {...axis} axisLine={false} width={44} tickFormatter={compactMw} />
        <Tooltip content={<GroupTip unit={LABEL[tab]} />} cursor={{ fill: 'var(--grid)' }} />
        <Bar dataKey="mae" name="MAE" fill="var(--series-forecast)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function Histogram({ points }: { points: SeriesPoint[] }) {
  const bins = useMemo(() => {
    const errs = points.map((p) => p.error).filter((e): e is number => e != null)
    if (!errs.length) return []
    const width = 500
    const lo = Math.floor(Math.min(...errs) / width) * width
    const hi = Math.ceil(Math.max(...errs) / width) * width
    const out = []
    for (let b = lo; b < hi; b += width) out.push({ from: b, mid: b + width / 2, count: 0 })
    for (const e of errs) out[Math.min(out.length - 1, Math.floor((e - lo) / width))].count++
    return out
  }, [points])
  if (!bins.length) return <Empty>Nothing to compare</Empty>
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={bins} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="mid" type="number" domain={['dataMin - 250', 'dataMax + 250']} {...axis}
          axisLine={{ stroke: 'var(--border)' }} tickFormatter={compactMw} />
        <YAxis {...axis} axisLine={false} width={44} allowDecimals={false} />
        <ReferenceLine x={0} stroke="var(--text-muted)" strokeDasharray="3 3" />
        <Tooltip cursor={{ fill: 'var(--grid)' }} content={({ active, payload }) => {
          if (!active || !payload?.length) return null
          const b = payload[0].payload as { from: number; count: number }
          return (
            <div className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-[12px] shadow-lg tabular text-ink-2">
              <div className="font-semibold text-ink">{signedMw(b.from)} to {signedMw(b.from + 500)}</div>
              {b.count} hours
            </div>
          )
        }} />
        <Bar dataKey="count" fill="var(--series-forecast)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

const NOTES: Record<Tab, string> = {
  horizon: 'Typical miss by how far ahead the forecast was made. Earlier forecasts usually miss by more.',
  hour: 'Typical miss by hour of the delivery day (UK time).',
  day: 'Typical miss per delivery day. Spikes usually mean a weather front arrived early or late.',
  histogram: 'How often each size of error happened. Right of zero: the forecast was too high, so less wind arrived than planned.',
}

export function Breakdown({ groups, points, tab, onTab, loading }: {
  groups: GroupStats[]
  points: SeriesPoint[]
  tab: Tab
  onTab: (t: Tab) => void
  loading: boolean
}) {
  return (
    <Card
      title="Where the errors come from"
      subtitle={NOTES[tab]}
      actions={
        <Segmented<Tab> label="Breakdown" value={tab} onChange={onTab} options={[
          { value: 'horizon', label: 'Hours ahead' },
          { value: 'hour', label: 'Hour of day' },
          { value: 'day', label: 'Day' },
          { value: 'histogram', label: 'Spread' },
        ]} />
      }
    >
      <div className={loading ? 'opacity-50 transition-opacity' : ''}>
        {tab === 'histogram' ? <Histogram points={points} /> : <GroupChart groups={groups} tab={tab} />}
      </div>
    </Card>
  )
}

export type { Tab as BreakdownTab }
export function useBreakdownTab() {
  return useState<Tab>('horizon')
}