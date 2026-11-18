import { useEffect, useState } from 'react'
import { addDays, ymd } from '@/lib/core'
import { DayView } from '@/components/DayView'
import { Screen } from '@/components/ui'

/** Today, refreshed each minute so the eating window line moves. The arrows
 *  step to other days; Today jumps back. */
export default function Today() {
  const [, tick] = useState(0)
  const [offset, setOffset] = useState(0)
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 60_000); return () => clearInterval(t) }, [])
  const day = addDays(ymd(new Date()), offset)
  return (
    <Screen>
      <DayView key={day} day={day} onShift={n => setOffset(o => n === 0 ? 0 : o + n)} />
    </Screen>
  )
}
