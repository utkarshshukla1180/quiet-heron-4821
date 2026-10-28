// Display helpers. All times shown in UK time, which is what a GB trader works in.
const UK = 'Europe/London'

export const mw = (v: number | null | undefined, digits = 0) =>
  v == null ? '–' : `${v.toLocaleString('en-GB', { maximumFractionDigits: digits })} MW`

export const signedMw = (v: number | null | undefined) =>
  v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-GB', { maximumFractionDigits: 0 })} MW`

export const pct = (v: number | null | undefined) => (v == null ? '–' : `${v.toFixed(1)}%`)

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: UK, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { timeZone: UK, day: 'numeric', month: 'short' })

export const hours = (h: number | null | undefined) => (h == null ? '–' : `${h.toFixed(1)} h`)

export const compactMw = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : `${v}`)