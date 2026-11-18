import { useState } from 'react'
import { ScrollView, Share, Text, View } from 'react-native'
import { C } from '@/theme'
import { addDays, at, medOn, ymd } from '@/lib/core'
import { dayTotals } from '@/lib/meals'
import { dosesOn, meds, mealsOn, medsOn, phaseOn, plan, symptomsOn, useDb, verdictOn, waterOn, weights } from '@/lib/db'
import { Button, Card, Chip, Label, Muted } from '@/components/ui'

const short = (day: string) => at(day, '12:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/** One week at a glance, ready to send to the coach. */
export default function Review() {
  useDb()
  const today = ymd(new Date())
  const [back, setBack] = useState(0)
  const end = addDays(today, -7 * back), start = addDays(end, -6)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter(d => d >= plan.start && d <= today)

  const w = weights().filter(x => x.day >= start && x.day <= end)
  let mealsLogged = 0, breaks = 0, taken = 0, due = 0, waterSum = 0, waterHit = 0, bloated = 0
  const proteinDays: number[] = []
  for (const d of days) {
    const meals = mealsOn(d)
    const t = dayTotals(meals)
    mealsLogged += t.mainsEaten
    breaks += meals.filter(m => m.state === 'eaten').flatMap(m => m.items).filter(i => { const l = verdictOn(d, i.name).level; return l === 'out' || l === 'notyet' }).length
    if (t.mainsEaten === 3 && !t.unknown) proteinDays.push(t.p)
    due += medsOn(d).reduce((n, m) => n + m.times.length, 0)
    taken += dosesOn(d).filter(x => x.status === 'taken').length
    const water = waterOn(d); waterSum += water; if (water >= plan.waterTargetMl) waterHit++
    if (symptomsOn(d)?.bloating === 1) bloated++
  }
  const avgP = proteinDays.length ? Math.round(proteinDays.reduce((a, b) => a + b, 0) / proteinDays.length) : null
  const n = days.length || 1

  const rows: [string, string][] = [
    ['Weight', w.length >= 2 ? `${w[0].kg.toFixed(1)} to ${w[w.length - 1].kg.toFixed(1)} kg (${(w[w.length - 1].kg - w[0].kg).toFixed(1)})` : w.length ? `${w[0].kg.toFixed(1)} kg, one weigh-in` : 'No weigh-ins'],
    ['Main meals eaten and logged', `${mealsLogged} of ${days.length * 3}`],
    ['Foods outside the rules', breaks ? `${breaks}` : 'None'],
    ['Average protein', avgP != null ? `${avgP} g a day (on days with every amount filled in)` : 'No fully logged days'],
    ['Supplements taken', `${taken} of ${due}`],
    ['Water', `${(waterSum / n / 1000).toFixed(1)} litres a day, target met ${waterHit} of ${days.length} days`],
    ['Days bloated', `${bloated}`],
  ]
  const text = [`Week of ${short(start)} to ${short(end)} (${phaseOn(end).name})`, '', ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n')

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip title={back === 0 ? '✓ This week' : 'This week'} onPress={() => setBack(0)} />
          <Chip title={back === 1 ? '✓ Last week' : 'Last week'} onPress={() => setBack(1)} />
        </View>
        <Card>
          <Label>{short(start)} to {short(end)} · {phaseOn(end).name}</Label>
          {!days.length && <Muted>No plan days in this week.</Muted>}
          {days.length > 0 && rows.map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 }}>
              <Text style={{ color: C.text2, fontSize: 15 }}>{k}</Text>
              <Text style={{ color: C.text, fontSize: 15, flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{v}</Text>
            </View>
          ))}
          <Muted small>Protein is estimated from the food list.</Muted>
        </Card>
        <Button title="Send this week" kind="primary" disabled={!days.length} onPress={() => Share.share({ message: text })} />
      </ScrollView>
    </View>
  )
}
