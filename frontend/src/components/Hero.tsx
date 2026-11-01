import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CharHeadline } from './Motion'

// Full-screen windmill film modelled on the spykercars.com opening: black,
// edge to edge, an uppercase headline whose letters rise into place. The
// section is taller than the viewport and the film is pinned inside it, so the
// first stretch of scrolling shrinks the frame towards the centre (scale plus
// a small corner radius) while the footage itself drifts and zooms slightly —
// then the shrunken frame scrolls away and the white page takes over.
// Scroll writes go straight to the DOM; nothing re-renders while scrolling.
export function Hero({ eyebrow, lines, children, aside }: {
  eyebrow: string
  lines: string[]
  children?: ReactNode
  aside?: ReactNode
}) {
  const sectionRef = useRef<HTMLElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const mediaRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    video.src = '/windmill.mp4'
    video.play().catch(() => {})
  }, [])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const update = () => {
      const section = sectionRef.current
      if (!section) return
      const vh = window.innerHeight
      const travel = section.offsetHeight - vh
      const p = Math.min(1, Math.max(0, -section.getBoundingClientRect().top / travel))
      const e = 1 - Math.pow(1 - p, 2)
      const narrow = window.innerWidth < 768
      const scale = 1 - e * (narrow ? 0.14 : 0.3)
      if (frameRef.current) {
        frameRef.current.style.transform = `scale(${scale})`
        frameRef.current.style.borderRadius = `${e * 6 / scale}px`
      }
      if (mediaRef.current) mediaRef.current.style.transform = `translateY(${e * 4}%) scale(${1 + e * 0.12})`
      if (contentRef.current) {
        contentRef.current.style.opacity = String(Math.max(0, 1 - p * 1.8))
        contentRef.current.style.transform = `translateY(${-p * 80}px)`
      }
      // Off-screen film costs battery; pause it once the hero has gone.
      const video = videoRef.current
      if (video && video.src) {
        const gone = section.getBoundingClientRect().bottom < 0
        if (gone && !video.paused) video.pause()
        else if (!gone && video.paused) video.play().catch(() => {})
      }
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
  }, [])

  return (
    <section ref={sectionRef} className="relative h-[185svh] bg-surface-0">
      <div className="sticky top-0 h-svh overflow-hidden">
        <div
          ref={frameRef}
          className="theme-dark relative h-full w-full origin-center overflow-hidden bg-black text-white will-change-transform"
        >
          <div ref={mediaRef} className="absolute inset-x-0 -top-[10%] -bottom-[10%] will-change-transform">
            <video
              ref={videoRef}
              aria-hidden
              muted
              loop
              autoPlay
              playsInline
              preload="auto"
              onPlaying={() => setReady(true)}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 motion-reduce:hidden ${ready ? 'opacity-100' : 'opacity-0'}`}
            />
          </div>
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-black/50 to-transparent" />

          <div ref={contentRef} className="absolute inset-0 z-10 flex items-center justify-center px-6 will-change-transform">
            <div className="flex flex-col items-center gap-9 text-center">
              <div className="flex flex-col items-center gap-4">
                <p className="eyebrow animate-rise-in text-white" style={{ animationDelay: '200ms' }}>{eyebrow}</p>
                <CharHeadline
                  as="h1"
                  auto
                  delay={350}
                  lines={lines}
                  className="font-futura text-[40px] leading-[0.85] tracking-[2.24px] text-white sm:text-[56px] lg:text-[88px]"
                />
              </div>
              {children && <div className="animate-rise-in" style={{ animationDelay: '900ms' }}>{children}</div>}
            </div>
          </div>

          {aside && (
            <div className="absolute inset-x-0 bottom-0 z-10 animate-rise-in px-4 pb-6 sm:px-8 sm:pb-8" style={{ animationDelay: '1100ms' }}>
              {aside}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// Fixed header in the Spyker layout — menu-side label, mark dead centre,
// link on the right. mix-blend-difference keeps it white over the film and
// black over the white page without tracking which section is underneath.
export function SiteHeader() {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 text-white mix-blend-difference">
      <nav className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-5 sm:px-8">
        <a href="#data" className="eyebrow pointer-events-auto justify-self-start underline-link">Data</a>
        <a href="#top" aria-label="Back to top" className="pointer-events-auto block size-9">
          <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className="h-full w-full">
            <path d="M16 17V29M16 17l-1-12 2 0zM16 17l10 6-1 1.7zM16 17l-9 6.6-1-1.7z" fill="currentColor" />
            <circle cx="16" cy="17" r="1.8" fill="currentColor" />
          </svg>
        </a>
        <a href="#breakdown" className="eyebrow pointer-events-auto justify-self-end underline-link">Breakdown</a>
      </nav>
    </header>
  )
}
