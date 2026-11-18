import { useState } from 'react'
import { Pressable, ScrollView, Share, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { C } from '@/theme'
import { addDays, at, shoppingForItems, ymd, type PlanItem } from '@/lib/core'
import { haveSet, mealsOn, plan, setHave, useDb } from '@/lib/db'
import { Button, Card, Chip, Label, Muted, Tick } from '@/components/ui'

const short = (day: string) => at(day, '12:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

/** What to buy for the next few days of meals, with changed meals applied.
 *  Tick what is already at home; the ticks reset when the list moves on a day. */
export default function Shop() {
  useDb()
  const today = ymd(new Date())
  const [span, setSpan] = useState(3)
  const days = Array.from({ length: span }, (_, i) => addDays(today, i))
  // Planned meals cooked at home, with amounts. Meals with no amounts yet cannot be bought for.
  const planned = days.flatMap(d => mealsOn(d).filter(m => m.state === 'planned' && m.cook))
  const items: PlanItem[] = planned.flatMap(m => m.items.filter(i => i.grams).map(i => [i.name, i.grams!] as PlanItem))
  const missing = planned.filter(m => m.items.length === 0 || m.items.some(i => !i.grams)).length
  const list = shoppingForItems(plan, items)
  const have = haveSet(today)
  const toBuy = list.filter(i => !have.has(i.name))

  const share = () => Share.share({
    message: [`To buy for ${short(days[0])} to ${short(days[days.length - 1])}:`, ...toBuy.map(i => `- ${i.name}, ${i.amount}`)].join('\n'),
  })

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <Card>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[1, 3, 7].map(n => <Chip key={n} title={n === span ? `✓ ${n === 1 ? 'Today' : `${n} days`}` : n === 1 ? 'Today' : `${n} days`} onPress={() => setSpan(n)} />)}
          </View>
          <Muted small>{`${short(days[0])} to ${short(days[days.length - 1])}`}. Raw and dry weights, so buy a little over. Meals not cooked at home are left off.</Muted>
          {missing > 0 && <Muted small>{missing} planned meal{missing === 1 ? ' has' : 's have'} no amounts yet, so {missing === 1 ? 'it is' : 'they are'} not on this list.</Muted>}
        </Card>
        <Card>
          <Label>{toBuy.length} to buy · {list.length - toBuy.length} at home</Label>
          {list.map(i => {
            const on = have.has(i.name)
            return (
              <Pressable key={i.name} onPress={() => { Haptics.selectionAsync(); setHave(today, i.name, !on) }} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
                <Tick state={on ? 'done' : 'open'} />
                <Text style={{ flex: 1, color: on ? C.text3 : C.text, fontSize: 16, textDecorationLine: on ? 'line-through' : 'none' }}>{i.name}</Text>
                <Text style={{ color: on ? C.text3 : C.text2, fontSize: 15, fontVariant: ['tabular-nums'] }}>{i.amount}</Text>
              </Pressable>
            )
          })}
          <Muted small>Tick what is already at home.</Muted>
        </Card>
        <Button title="Send the list" kind="primary" disabled={!toBuy.length} onPress={share} />
      </ScrollView>
    </View>
  )
}
