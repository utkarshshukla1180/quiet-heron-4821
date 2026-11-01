import type { ReactNode } from 'react'

// Spyker-style block: no box, just a hairline rule above, an uppercase
// Futura title and a quiet caption. Colours come from the theme tokens, so the
// same block works on the white page and inside a .theme-dark section.
export function Card({ title, subtitle, actions, children }: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="border-t border-line pt-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 className="font-futura text-[18px] leading-none tracking-[0.8px] text-ink sm:text-[19px]">{title}</h2>
          {subtitle && <div className="mt-2 text-[13px] leading-normal text-ink-2 sm:text-[14px]">{subtitle}</div>}
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
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-[2px] border border-line p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`eyebrow h-7 rounded-[2px] px-2.5 text-[11px] transition-colors duration-300 ${
            value === o.value ? 'bg-ink text-surface-0' : 'text-ink-2 hover:text-ink'
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
