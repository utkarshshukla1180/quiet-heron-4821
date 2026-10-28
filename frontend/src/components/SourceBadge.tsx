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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${
        warn ? 'border-amber-500/40 text-amber-700 dark:text-amber-400' : 'border-line text-ink-2'
      }`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${warn ? 'bg-amber-500' : 'bg-emerald-500'}`} />
      {TEXT[source].label}
      {unavailable && unavailable.length > 0 && <span className="text-ink-3">· {unavailable.length} days missing</span>}
    </span>
  )
}