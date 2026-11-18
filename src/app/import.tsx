import { ScrollView, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { C } from '@/theme'
import { at, clock, SLOT_NAME, type Slot } from '@/lib/core'
import { amountLabel } from '@/lib/servings'
import { putMeal, setWeight } from '@/lib/db'
import { Button, Card, Label, Muted } from '@/components/ui'

type Entry = { day: string; weight?: number; meals: { slot: Slot; time: string; items: [string, number][] }[] }

/** Base64 (url-safe) JSON, as the link carries it. */
function decode(d: string): Entry[] | null {
  try {
    const b = d.replace(/-/g, '+').replace(/_/g, '/')
    const bin = globalThis.atob(b + '='.repeat((4 - (b.length % 4)) % 4))
    const json = decodeURIComponent(Array.from(bin, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''))
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : null
  } catch { return null }
}

/** Loads days of meals and weights from a link (typed up from notes), after a
 *  look. Each meal in the link replaces what is logged for that meal. */
export default function Import() {
  const { d } = useLocalSearchParams<{ d: string }>()
  const entries = d ? decode(d) : null
  if (!entries) return <View style={{ flex: 1, backgroundColor: C.bg, padding: 16 }}><Muted>This link could not be read.</Muted></View>

  const apply = () => {
    for (const e of entries) {
      if (e.weight) setWeight(e.day, e.weight)
      for (const m of e.meals) putMeal({ day: e.day, slot: m.slot, name: m.items.map(([n]) => n).join(', '), state: 'eaten', eatenAt: m.time, cook: true, note: null, origin: 'import',
        items: m.items.map(([name, grams]) => ({ name, grams, ml: null, at: null, p: null, kcal: null, source: null })) })
    }
    router.back()
  }
  const pretty = (day: string) => at(day, '12:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <Muted>Check these, then add them. Each meal here replaces what is logged for that meal.</Muted>
        {entries.map(e => (
          <Card key={e.day}>
            <Label>{pretty(e.day)}{e.weight ? ` · ${e.weight} kg` : ''}</Label>
            {e.meals.map(m => (
              <View key={m.slot} style={{ gap: 2 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{SLOT_NAME[m.slot]}, {clock(m.time)}</Text>
                <Text style={{ color: C.text2, fontSize: 14, lineHeight: 20 }}>{m.items.map(([n, g]) => `${n} ${amountLabel(n, g)}`).join(', ')}</Text>
              </View>
            ))}
          </Card>
        ))}
        <Button title="Add to my log" kind="primary" onPress={apply} />
        <Button title="Cancel" onPress={() => router.back()} />
      </ScrollView>
    </View>
  )
}
