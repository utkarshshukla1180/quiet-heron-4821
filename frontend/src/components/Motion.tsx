import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode, type RefObject } from 'react'

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Calls `onProgress` every animation frame the page scrolls, with how far the
// element has travelled through the viewport: 0 when its top meets the bottom
// edge, 1 when its top reaches `endAt` (a fraction of the viewport height).
// Writes go straight to the DOM in the callback, so scrolling never re-renders.
function useScrollProgress(ref: RefObject<HTMLElement | null>, onProgress: (p: number) => void, endAt = 0.25) {
  const cb = useRef(onProgress)
  useEffect(() => { cb.current = onProgress })
  useEffect(() => {
    if (reduced()) { cb.current(1); return }
    let raf = 0
    const update = () => {
      const el = ref.current
      if (!el) return
      const vh = window.innerHeight
      const top = el.getBoundingClientRect().top
      cb.current(Math.min(1, Math.max(0, (vh - top) / (vh - vh * endAt))))
    }
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [ref, endAt])
}

// Adds .is-in the first time the element scrolls into view.
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduced()) { el.classList.add('is-in'); return }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.classList.add('is-in'); io.disconnect() }
    }, { rootMargin: '0px 0px -12% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return ref
}

export function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }: {
  children: ReactNode
  delay?: number
  className?: string
  as?: ElementType
}) {
  const ref = useInView<HTMLElement>()
  return <Tag ref={ref} className={`reveal ${className}`} style={{ '--d': `${delay}ms` } as CSSProperties}>{children}</Tag>
}

// Spyker-style headline: every line clips, every letter slides up into place.
// `auto` plays on mount (for the hero) instead of waiting to scroll into view.
export function CharHeadline({ lines, as: Tag = 'h2', className = '', auto = false, delay = 0 }: {
  lines: string[]
  as?: ElementType
  className?: string
  auto?: boolean
  delay?: number
}) {
  const ref = useInView<HTMLElement>()
  let n = 0
  return (
    <Tag ref={auto ? undefined : ref} aria-label={lines.join(' ')} className={`${auto ? 'char-auto' : ''} ${className}`}>
      {lines.map((line, i) => (
        <span key={i} aria-hidden className="char-line">
          {/* Letters are grouped per word so a narrow screen wraps between words, never inside one. */}
          {line.split(' ').map((word, w) => (
            <span key={w}>
              {w > 0 && ' '}
              <span className="inline-block whitespace-nowrap">
                {[...word].map((c, j) => (
                  <span key={j} className="char" style={{ animationDelay: `${delay + n++ * 22}ms` }}>{c}</span>
                ))}
              </span>
            </span>
          ))}
        </span>
      ))}
    </Tag>
  )
}

// A frame whose clip-path opens from `from`% inset to fully open as it
// scrolls up the page, the way Spyker unveils its media and dark sections.
export function ClipReveal({ children, from = 12, className = '', radius = 2 }: {
  children: ReactNode
  from?: number
  className?: string
  radius?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useScrollProgress(ref, (p) => {
    const el = ref.current
    if (!el) return
    const e = 1 - Math.pow(1 - p, 3)
    el.style.clipPath = `inset(${(from * (1 - e)).toFixed(2)}% round ${radius}px)`
  }, 0.2)
  return <div ref={ref} className={`will-change-[clip-path] ${className}`}>{children}</div>
}
