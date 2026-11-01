import { useEffect, useRef, useState } from 'react'

export type Token = { text: string; strong?: boolean }

// Reveals the report's headline finding word by word as it scrolls into view,
// the way casamomo.at brightens its mission statement on scroll. Progress is
// read from the element's own position, not a step counter, so it tracks the
// scroll exactly. Falls back to fully visible immediately for reduced motion,
// and starts fully visible so nothing depends on JS having run yet.
export function ScrollStatement({ tokens }: { tokens: Token[] }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [progress, setProgress] = useState(1)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setProgress(0)
    let raf = 0
    const update = () => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight
      const start = vh * 0.92
      const end = vh * 0.55
      setProgress(Math.min(1, Math.max(0, (start - rect.top) / (start - end))))
    }
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <p ref={ref} className="text-[15px] leading-relaxed sm:text-[17px]">
      {tokens.map((t, i) => {
        const w = Math.min(1, Math.max(0, progress * tokens.length - i))
        return (
          <span
            key={i}
            className={t.strong ? 'font-medium text-ink' : 'text-ink'}
            style={{ opacity: 0.18 + w * 0.82 }}
          >
            {t.text}{' '}
          </span>
        )
      })}
    </p>
  )
}
