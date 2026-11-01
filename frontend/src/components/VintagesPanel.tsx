import { useQuery } from '@tanstack/react-query'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import { compactMw, dateTime, hours, mw, signedMw } from '../format'
import { Card, Empty } from './Card'

export function VintagesPanel({ slot, cutoffIso, cutoffLabel = 'Decision time', onClose }: {
  slot: string
  cutoffIso?: string
  cutoffLabel?: string
  onClose: () => void
}) {
  const q = useQuery({ queryKey: ['vintages', slot], queryFn: () => api.vintages(slot) })
  const rows = (q.data?.vintages ?? []).map((v) => ({ ...v, x: Date.parse(v.publish_time) }))
  const actual = q.data?.actual

  return (
    <Card
      title={`How the forecast for ${dateTime(slot)} changed`}
      subtitle={
        actual != null
          ? <>Each point is one published forecast for this hour. Actual output was <strong className="text-ink">{mw(actual)}</strong>.</>
          : 'Each point is one published forecast for this hour.'
      }
      actions={
        <button onClick={onClose} className="eyebrow h-9 rounded-[2px] border border-line px-4 text-ink transition-colors hover:bg-ink hover:text-surface-0">
          Close
        </button>
      }
    >
      {q.isLoading ? <Empty>Loading…</Empty> : q.isError ? <Empty>{String(q.error)}</Empty> : !rows.length ? <Empty>No forecasts found</Empty> : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="x" type="number" scale="time" domain={['dataMin', 'dataMax']}
              tickFormatter={(v) => dateTime(new Date(v).toISOString())} tick={{ fill: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}
              axisLine={{ stroke: 'var(--border)' }} tickLine={false} minTickGap={40} />
            <YAxis tickFormatter={compactMw} width={44} tick={{ fill: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }} axisLine={false}
              tickLine={false} domain={['auto', 'auto']} />
            {actual != null && <ReferenceLine y={actual} stroke="var(--series-actual)" strokeDasharray="4 3"
              label={{ value: 'Actual', position: 'insideTopRight', fill: 'var(--text-secondary)', fontSize: 11 }} />}
            {cutoffIso && <ReferenceLine x={Date.parse(cutoffIso)} stroke="var(--text-muted)" strokeDasharray="3 3"
              label={{ value: cutoffLabel, position: 'insideTopLeft', fill: 'var(--text-secondary)', fontSize: 11 }} />}
            <Tooltip cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '3 3' }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const v = payload[0].payload as (typeof rows)[number]
              return (
                <div className="rounded-[2px] border border-line bg-surface-1 px-3 py-2.5 text-[12px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] tabular text-ink-2">
                  <div className="font-semibold text-ink">Published {dateTime(v.publish_time)}</div>
                  <div>Forecast {mw(v.forecast)} · {hours(v.horizon_h)} ahead</div>
                  {actual != null && <div>Error {signedMw(v.forecast - actual)}</div>}
                </div>
              )
            }} />
            <Line dataKey="forecast" stroke="var(--series-forecast)" strokeWidth={2} isAnimationActive={false}
              dot={{ r: 3, fill: 'var(--series-forecast)', strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface-1)' }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}