import { useState } from 'react'
import { Card, Empty, Segmented } from './components/Card'

export default function App() {
  const [mode, setMode] = useState<'cutoff' | 'horizon'>('cutoff')
  return (
    <div className="mx-auto max-w-3xl p-6">
      <Card
        title="Test card"
        subtitle="Card, Segmented and Empty together"
        actions={
          <Segmented
            label="Mode"
            value={mode}
            onChange={setMode}
            options={[{ value: 'cutoff', label: 'At decision time' }, { value: 'horizon', label: 'Hours ahead' }]}
          />
        }
      >
        <Empty>Selected: {mode}</Empty>
      </Card>
    </div>
  )
}