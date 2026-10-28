import type { ReactNode } from 'react'

export function Card({ title, subtitle, actions, children }: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-line bg-surface-1 p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-2">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface-0 p-0.5 text-[13px]">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 transition-colors ${
            value === o.value ? 'bg-surface-1 font-medium text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="grid h-full min-h-40 place-items-center text-[13px] text-ink-3">{children}</div>
}
