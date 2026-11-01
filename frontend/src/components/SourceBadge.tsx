import type { Source } from '../api/client'

const TEXT: { [K in Source]: { label: string; title: string } } = {
  cache: { label: 'Elexon · cached', title: 'Fetched from Elexon earlier and served from the cache' },
  live: { label: 'Elexon · live', title: 'Fetched from the Elexon API for this request' },
  snapshot: { label: 'Offline snapshot', title: 'Elexon was unreachable, so the bundled snapshot is shown' },
}

export function SourceBadge({ source, unavailable }: { source?: Source; unavailable?: string[] }) {
  if (!source) return null
  const warn = source === 'snapshot'
  return (
    <span
      title={TEXT[source].title}
      className={`eyebrow inline-flex items-center gap-2 ${warn ? 'text-amber-400' : 'text-ink-2'}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${warn ? 'bg-amber-400' : 'bg-emerald-400'}`} />
      {TEXT[source].label}
      {unavailable && unavailable.length > 0 && <span className="text-ink-3">· {unavailable.length} days missing</span>}
    </span>
  )
}