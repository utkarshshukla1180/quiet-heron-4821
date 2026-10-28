import type { Query, Stats } from '../api/client'
import { mw, pct, signedMw } from '../format'

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-0/50 p-3.5">
      <div className="text-[12px] font-medium text-ink-2">{label}</div>
      <div className="mt-1 text-[20px] lg:text-[22px] font-semibold tracking-tight text-ink tabular">{value}</div>
      <div className="mt-0.5 text-[12px] text-ink-3">{note}</div>
    </div>
  )
}

export function KpiTiles({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <Tile label="Typical miss (MAE)" value={mw(stats.mae)} note="mean absolute error" />
      <Tile label="Big-miss weighted (RMSE)" value={mw(stats.rmse)} note="punishes large errors" />
      <Tile label="Bias" value={signedMw(stats.bias)}
        note={stats.bias == null ? '' : stats.bias > 0 ? 'forecasts lean high' : 'forecasts lean low'} />
      <Tile label="Relative miss (nMAE)" value={pct(stats.nmae_pct)} note="MAE ÷ mean actual output" />
      <Tile label="80% of errors within"
        value={stats.p10 == null ? '–' : `${signedMw(stats.p10).replace(' MW', '')} to ${signedMw(stats.p90).replace(' MW', '')}`}
        note={`MW, P10 to P90 · median ${signedMw(stats.p50)}`} />
    </div>
  )
}

export function Insight({ stats, query }: { stats: Stats; query: Query }) {
  if (!stats.n || stats.mae == null || stats.p10 == null || stats.p90 == null) return null
  const when = query.mode === 'cutoff'
    ? `bought at ${String(query.cutoffHour).padStart(2, '0')}:00 the day before`
    : `made at least ${query.horizonH} h ahead`
  // error = forecast − actual, so P90 is how far too high the forecast runs in the worst 10% of hours
  const reserve = Math.max(0, stats.p90)
  return (
    <p className="text-[14px] leading-relaxed text-ink-2">
      Using the forecast you would have {when}, wind came in{' '}
      <strong className="font-semibold text-ink">{mw(stats.mae)}</strong> away from it on a typical hour.
      In 1 hour out of 10 the forecast was more than{' '}
      <strong className="font-semibold text-ink">{mw(reserve)}</strong> too high, which is a sensible amount of
      cover to plan for. Based on {stats.n.toLocaleString('en-GB')} hourly comparisons.
    </p>
  )
}