import type { Query, Stats } from '../api/client'
import { mw, pct, signedMw } from '../format'
import { ScrollStatement, type Token } from './ScrollStatement'

// A spec-sheet row, the way Spyker lists a car's figures: hairline dividers,
// a small uppercase label, the number set large in the display face.
function Tile({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'up' | 'down' }) {
  return (
    <div className="min-w-0 border-t border-line pt-3 md:border-t-0 md:border-l md:pl-4 md:first:border-l-0 md:first:pl-0">
      <div className="eyebrow text-[11px] text-ink-3">{label}</div>
      <div className="mt-2.5 flex items-baseline gap-1 font-display text-[21px] font-medium leading-none text-ink tabular lg:text-[24px]">
        {tone && <span aria-hidden className={`text-[0.55em] ${tone === 'up' ? 'text-(--series-actual)' : 'text-ink'}`}>{tone === 'up' ? '▲' : '▼'}</span>}
        {value}
      </div>
      <div className="mt-1.5 truncate text-[12px] leading-normal text-ink-3">{note}</div>
    </div>
  )
}

export function KpiTiles({ stats }: { stats: Stats }) {
  return (
    <div className="animate-stagger grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-5">
      <Tile label="Typical miss (MAE)" value={mw(stats.mae)} note="mean absolute error" />
      <Tile label="Big-miss weighted (RMSE)" value={mw(stats.rmse)} note="punishes large errors" />
      <Tile label="Bias" value={signedMw(stats.bias)} tone={stats.bias == null ? undefined : stats.bias > 0 ? 'up' : 'down'}
        note={stats.bias == null ? '' : stats.bias > 0 ? 'forecasts lean high' : 'forecasts lean low'} />
      <Tile label="Relative miss (nMAE)" value={pct(stats.nmae_pct)} note="MAE ÷ mean actual output" />
      <Tile label="80% of errors within"
        value={stats.p10 == null ? '–' : `${signedMw(stats.p10).replace(' MW', '')} to ${signedMw(stats.p90).replace(' MW', '')}`}
        note={`MW, P10 to P90 · median ${signedMw(stats.p50)}`} />
    </div>
  )
}

const words = (s: string, strong = false): Token[] => s.split(' ').map((text) => ({ text, strong }))

export function Insight({ stats, query }: { stats: Stats; query: Query }) {
  if (!stats.n || stats.mae == null || stats.p10 == null || stats.p90 == null) return null
  const when = query.mode === 'cutoff'
    ? `bought at ${String(query.cutoffHour).padStart(2, '0')}:00 the day before`
    : `made at least ${query.horizonH} h ahead`
  // error = forecast − actual, so P90 is how far too high the forecast runs in the worst 10% of hours
  const reserve = Math.max(0, stats.p90)
  const tokens: Token[] = [
    ...words(`Using the forecast you would have ${when}, wind came in`),
    ...words(mw(stats.mae), true),
    ...words('away from it on a typical hour. In 1 hour out of 10 the forecast was more than'),
    ...words(mw(reserve), true),
    ...words(`too high, which is a sensible amount of cover to plan for. Based on ${stats.n.toLocaleString('en-GB')} hourly comparisons.`),
  ]
  return <ScrollStatement tokens={tokens} />
}