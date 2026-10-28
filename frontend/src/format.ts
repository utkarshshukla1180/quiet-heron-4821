// Typed client for the FastAPI backend. Same origin by default; VITE_API_BASE overrides it.
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

export type Source = 'cache' | 'live' | 'snapshot'
export type Mode = 'cutoff' | 'horizon'
export type GroupBy = 'day' | 'hour' | 'horizon'

export interface Query {
  start: string
  end: string
  mode: Mode
  cutoffHour: number
  horizonH: number
}

export interface Stats {
  n: number
  mae: number | null
  rmse: number | null
  bias: number | null
  nmae_pct: number | null
  p10: number | null
  p50: number | null
  p90: number | null
}

export interface GroupStats extends Stats {
  group: string | number
}

export interface SeriesPoint {
  t: string
  actual: number | null
  forecast: number | null
  publish_time: string | null
  horizon_h: number | null
  error: number | null
}

export interface SeriesResponse {
  source: Source
  unavailable_days: string[]
  counts: Record<string, number>
  points: SeriesPoint[]
}

export interface MetricsResponse {
  source: Source
  unavailable_days: string[]
  group_by: string
  overall: Stats
  groups: GroupStats[]
}

export interface VintagesResponse {
  source: Source
  slot: string
  actual: number | null
  vintages: { publish_time: string; forecast: number; horizon_h: number }[]
}

export interface Health {
  status: string
  elexon_reachable: boolean
  warmup: string
  cached_days: Record<string, number>
  default_start: string
  default_end: string
}

async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
  const res = await fetch(`${BASE}${path}${qs.size ? `?${qs}` : ''}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const detail = typeof body.detail === 'string' ? body.detail : res.statusText
    throw new Error(`${res.status}: ${detail}`)
  }
  return res.json() as Promise<T>
}

const params = (q: Query) => ({
  start: q.start,
  end: q.end,
  mode: q.mode,
  cutoff_hour: q.cutoffHour,
  horizon_h: q.horizonH,
})

export const api = {
  health: () => get<Health>('/api/health'),
  series: (q: Query) => get<SeriesResponse>('/api/series', params(q)),
  metrics: (q: Query, groupBy?: GroupBy) =>
    get<MetricsResponse>('/api/metrics', { ...params(q), group_by: groupBy ?? 'none' }),
  vintages: (slot: string) => get<VintagesResponse>('/api/forecast-vintages', { slot }),
}