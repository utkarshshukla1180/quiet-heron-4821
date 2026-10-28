import { Card } from './components/Card'
import { SourceBadge as Badge } from './components/SourceBadge'

export default function App() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <Card title="Source badges" subtitle="Hover each one to see the explanation">
        <div className="flex flex-wrap gap-2">
          <Badge source="live" />
          <Badge source="cache" />
          <Badge source="snapshot" unavailable={['2026-01-05', '2026-01-06']} />
        </div>
      </Card>
    </div>
  )
}