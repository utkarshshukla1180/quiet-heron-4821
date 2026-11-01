import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type Query } from './api/client'
import { Breakdown, useBreakdownTab } from './components/Breakdown'
import { Card, Empty } from './components/Card'
import { Controls } from './components/Controls'
import { ForecastChart } from './components/ForecastChart'
import { Hero, SiteHeader } from './components/Hero'
import { Insight, KpiTiles } from './components/KpiTiles'
import { CharHeadline, ClipReveal, Reveal } from './components/Motion'
import { SourceBadge as Badge } from './components/SourceBadge'
import { VintagesPanel } from './components/VintagesPanel'

const DEFAULT: Query = { start: '2026-01-02', end: '2026-02-01', mode: 'cutoff', cutoffHour: 11, horizonH: 4 }

// Decision time for the delivery day of a slot: the day before at the cutoff hour, UK time.
// January is GMT, so UK time equals UTC for the default range.
function cutoffFor(slot: string, hour: number) {
  const d = new Date(slot)
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return new Date(day - 86_400_000 + hour * 3_600_000).toISOString()
}

export default function App() {
  const [query, setQuery] = useState<Query>(DEFAULT)
  const [slot, setSlot] = useState<string | null>(null)
  const [tab, setTab] = useBreakdownTab()

  const series = useQuery({ queryKey: ['series', query], queryFn: () => api.series(query), placeholderData: keepPreviousData })
  const overall = useQuery({ queryKey: ['metrics', query], queryFn: () => api.metrics(query), placeholderData: keepPreviousData })
  const groups = useQuery({
    queryKey: ['metrics', query, tab],
    queryFn: () => api.metrics(query, tab === 'histogram' ? 'horizon' : tab),
    placeholderData: keepPreviousData,
  })

  const error = series.error ?? overall.error
  const counts = series.data?.counts

  const container = 'mx-auto w-full max-w-[1440px] px-4 sm:px-8'
  const button = 'eyebrow inline-flex h-11 min-w-[220px] items-center justify-center rounded-[2px] px-8 transition-colors duration-300'

  return (
    <div id="top">
      <SiteHeader />

      <Hero
        eyebrow="GB National Wind · January 2026"
        lines={['Wind Forecast', 'Monitor']}
        aside={
          <div className="flex items-end justify-between gap-4">
            <span className="eyebrow hidden text-white/70 sm:inline">Elexon BMRS</span>
            <span aria-hidden className="mx-auto block h-12 w-px overflow-hidden bg-white/25 sm:mx-0">
              <span className="scroll-cue block h-full w-full bg-white" />
            </span>
            <span className="hidden sm:inline"><Badge source={series.data?.source} unavailable={series.data?.unavailable_days} /></span>
          </div>
        }
      >
        <ul className="flex flex-wrap justify-center gap-4 max-md:flex-col">
          <li><a href="#data" className={`${button} bg-white text-black hover:bg-white/85`}>Explore the data</a></li>
          <li><a href="#breakdown" className={`${button} border border-white/60 text-white hover:bg-white hover:text-black`}>Where it misses</a></li>
        </ul>
      </Hero>

      {/* Chapter one: the finding, brightening word by word as it scrolls in.
          Pulled up by the band the shrunken hero frame leaves empty below it. */}
      <section className={`${container} relative -mt-[7svh] pb-14 pt-16 sm:pb-20 md:-mt-[15svh] md:pt-20`}>
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-x-6">
          <div className="lg:col-span-4 lg:col-start-2">
            <Reveal as="p" className="eyebrow text-ink-3">The question</Reveal>
            <CharHeadline lines={['Forecast', 'vs reality']}
              className="mt-3 font-futura text-[32px] leading-[0.9] tracking-[1.5px] text-ink sm:text-[40px]" />
          </div>
          <div className="lg:col-span-6 lg:col-start-6">
            {overall.data
              ? <Insight stats={overall.data.overall} query={query} />
              : <Reveal as="p" className="text-[15px] leading-relaxed text-ink-3 sm:text-[17px]">GB wind generation: the forecast you could have acted on versus what actually happened.</Reveal>}
            <Reveal delay={150} as="p" className="mt-5 max-w-md text-[12px] leading-[1.6] tracking-[-0.12px] text-ink-3">
              Actual output from Elexon FUELHH, forecasts from WINDFOR. Error is forecast minus actual, so a positive
              number means less wind arrived than planned.
            </Reveal>
          </div>
        </div>
      </section>

      <main id="data" className={`${container} scroll-mt-20 space-y-12 pb-12 sm:space-y-14 sm:pb-14`}>
        <Reveal>
          <Controls query={query} onChange={(q) => { setQuery(q); setSlot(null) }} />
        </Reveal>

        {error && (
          <div role="alert" className="rounded-[2px] border border-red-400/40 bg-red-500/10 p-4 text-[14px] text-red-300">
            Could not load data: {String((error as Error).message ?? error)}
          </div>
        )}

        <Reveal>
          <Card title="Forecast accuracy" subtitle="Five ways of reading the same misses, from the typical hour to the worst one in ten.">
            {overall.data ? <KpiTiles stats={overall.data.overall} /> : <Empty>Loading…</Empty>}
          </Card>
        </Reveal>

        <Reveal>
          <Card
            title="Forecast vs actual generation"
            subtitle={
              counts
                ? `Megawatts. Actual every 30 minutes; forecasts are hourly, so ${counts.matched_slots.toLocaleString('en-GB')} hours can be compared. Hover for details, click to see how a forecast evolved.`
                : 'Loading…'
            }
          >
            <ClipReveal from={10}>
              <div className={series.isFetching ? 'opacity-60 transition-opacity' : ''}>
                {series.data ? <ForecastChart points={series.data.points} onPick={setSlot} /> : <Empty>Loading…</Empty>}
              </div>
            </ClipReveal>
          </Card>
        </Reveal>

        {slot && (
          <div className="animate-rise-in">
            <VintagesPanel slot={slot} onClose={() => setSlot(null)}
              cutoffIso={query.mode === 'cutoff'
                ? cutoffFor(slot, query.cutoffHour)
                : new Date(Date.parse(slot) - query.horizonH * 3_600_000).toISOString()}
              cutoffLabel={query.mode === 'cutoff' ? 'Decision time' : `${query.horizonH} h before`} />
          </div>
        )}
      </main>

      <section id="breakdown" className={`${container} scroll-mt-20 pb-16 sm:pb-20`}>
        <Reveal>
          <Breakdown groups={groups.data?.groups ?? []} points={series.data?.points ?? []} tab={tab} onTab={setTab}
            loading={groups.isFetching} />
        </Reveal>
      </section>

      <footer className={`${container} py-10`}>
        <div className="grid gap-6 text-[12px] leading-[1.4] tracking-[-0.12px] text-ink-3 lg:grid-cols-5">
          <a href="#top" className="underline-link w-fit text-ink">Back to top</a>
          <span className="lg:col-span-2">
            Data: Elexon BMRS, datasets FUELHH (actual, fuel type WIND) and WINDFOR (forecast). Error = forecast − actual.
            Forecasts more than 48 hours ahead are ignored.
          </span>
          <span>Window: 2 Jan – 1 Feb 2026, UK time</span>
          <span className="lg:text-right">© 2026 Wind Forecast Monitor</span>
        </div>
        <div aria-hidden className="mt-16 select-none font-futura text-[16vw] leading-[0.8] tracking-[0.02em] text-ink">
          Wind
        </div>
      </footer>
    </div>
  )
}