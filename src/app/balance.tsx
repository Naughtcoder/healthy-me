// Balance the day by hand: pick the target, lock what must not change (vegetables, protein, fats, or any single
// ingredient), see every meal's calories before and after, then apply. Only the unlocked ingredients move.
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Switch, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { C } from '@/theme'
import { clock, ymd } from '@/lib/core'
import { SLOT_AT } from '@/lib/group'
import { balanceDay, flexSplit, isFixed, kindOf, mealKcal, type IngredientKind } from '@/lib/budget'
import { mealsOn, putMeal, targetsOn, useDb } from '@/lib/db'
import { nutrition, type Meal } from '@/lib/meals'
import { Button, Card, Label, Muted } from '@/components/ui'

const KINDS: [IngredientKind, string][] = [['veg', 'Vegetables'], ['protein', 'Other protein'], ['fat', 'Cooking fats']]
const when = (m: Meal) => (m.state === 'eaten' && m.eatenAt) || m.time || SLOT_AT[m.slot] || '12:00'

export default function Balance() {
  useDb()
  const params = useLocalSearchParams<{ day?: string }>()
  const day = params.day ?? ymd(new Date())
  const meals = mealsOn(day).filter(m => m.state !== 'skipped' && m.items.length > 0).sort((a, b) => when(a).localeCompare(when(b)))
  const cap = targetsOn(day).kcalMax
  const now = Math.round(meals.reduce((t, m) => t + mealKcal(m), 0))
  const [target, setTarget] = useState<number>(cap ?? (now || 850))
  // The morning fat, egg whites, whey and fibre drink are always fixed and never listed; only the dish ingredients can be locked.
  const names = [...new Set(meals.filter(m => m.state === 'planned').flatMap(m => m.items.filter(i => !isFixed(m, i)).map(i => i.name.trim().toLowerCase())))]
  const [locked, setLocked] = useState<Set<string>>(() => new Set())
  const split = flexSplit(meals, cap)
  const r = useMemo(() => balanceDay(meals, target, locked), [meals.map(m => `${m.slot}${m.state}${m.items.map(i => `${i.name}${i.grams}${i.ml}`).join()}`).join('|'), target, [...locked].join()])

  const toggle = (n: string) => { Haptics.selectionAsync(); setLocked(s => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x }) }
  const kindLocked = (k: IngredientKind) => { const of = names.filter(n => kindOf(n) === k); return of.length > 0 && of.every(n => locked.has(n)) }
  const toggleKind = (k: IngredientKind) => {
    Haptics.selectionAsync()
    const of = names.filter(n => kindOf(n) === k), all = of.every(n => locked.has(n))
    setLocked(s => { const x = new Set(s); of.forEach(n => all ? x.delete(n) : x.add(n)); return x })
  }
  const apply = () => { for (const m of r.meals) putMeal(m); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); router.back() }
  const diff = r.total - target
  const kcalOfName = (n: string) => Math.round(meals.filter(m => m.state === 'planned').flatMap(m => m.items).filter(i => i.name.trim().toLowerCase() === n).reduce((t, i) => t + (nutrition(i.name, i.grams, i.ml)?.kcal ?? 0), 0))
  const gramsOfName = (n: string) => Math.round(meals.filter(m => m.state === 'planned').flatMap(m => m.items).filter(i => i.name.trim().toLowerCase() === n).reduce((t, i) => t + (i.grams ?? i.ml ?? 0), 0))

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}>
      <Card>
        <Label>Target for the day</Label>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Step label="Less" onPress={() => { Haptics.selectionAsync(); setTarget(t => t - 10) }} sym="−" />
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: C.text, fontSize: 40, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{target}</Text>
            <Text style={{ color: C.text2, fontSize: 13 }}>kcal{cap ? ` · ceiling ${cap}` : ''}</Text>
          </View>
          <Step label="More" onPress={() => { Haptics.selectionAsync(); setTarget(t => t + 10) }} sym="+" />
        </View>
        <Muted small>Fixed meals (coffee fat, egg whites, whey, fibre drink) {split.fixed} kcal · dish meals {split.flex} kcal{split.room != null ? ` · room for dishes ${split.room}` : ''}</Muted>
        <Text style={{ color: r.reached ? C.positive : C.caution, fontSize: 14, textAlign: 'center' }}>
          {r.reached ? `Balanced: the day comes to ${r.total} kcal` : r.why === 'nothing' ? 'Everything is locked, so nothing can move. Unlock something.' : `Gets to ${r.total} kcal, ${Math.abs(diff)} ${diff > 0 ? 'over' : 'under'}. Amounts only move between 0.2x and 3x; unlock more.`}
        </Text>
      </Card>

      <View style={{ gap: 8 }}>
        <Label>Keep these as they are</Label>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {KINDS.map(([k, l]) => {
            const on = kindLocked(k)
            return (
              <Pressable key={k} onPress={() => toggleKind(k)} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={{ flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.accent : C.card }}>
                <Text style={{ color: on ? C.accentText : C.text, fontWeight: '600', fontSize: 15 }}>{on ? '🔒 ' : ''}{l}</Text>
              </Pressable>
            )
          })}
        </View>
        <Muted small>Locked ingredients keep their amounts; the rest scale together to reach the target. Lock vegetables to balance on ghee alone. The coffee fat, egg whites, whey and fibre drink never move.</Muted>
      </View>

      <View style={{ gap: 8 }}>
        <Label>Meals</Label>
        <View style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: C.card }}>
          {meals.map((m, i) => {
            const row = r.rows.find(x => x.slot === m.slot)!
            const changed = row.after !== row.before
            return (
              <View key={m.slot} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, opacity: m.state === 'eaten' ? 0.6 : 1 }}>
                <Text style={{ color: C.text2, fontSize: 14, width: 62, fontVariant: ['tabular-nums'] }}>{clock(when(m))}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{m.name || m.items.map(x => x.name).join(', ')}</Text>
                  {m.state === 'eaten' && <Text style={{ color: C.text3, fontSize: 12 }}>eaten, stays as it is</Text>}
                </View>
                <Text style={{ color: changed ? C.text3 : C.text, fontSize: 14, fontVariant: ['tabular-nums'], textDecorationLine: changed ? 'line-through' : 'none' }}>{row.before}</Text>
                {changed && <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{row.after}</Text>}
              </View>
            )
          })}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Label>Ingredients</Label>
        <View style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: C.card }}>
          {names.map((n, i) => (
            <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 16, textTransform: 'capitalize' }}>{n}</Text>
                <Text style={{ color: C.text3, fontSize: 12 }}>{gramsOfName(n)} g · {kcalOfName(n)} kcal today</Text>
              </View>
              <Switch value={locked.has(n)} onValueChange={() => toggle(n)} accessibilityLabel={`Keep ${n} fixed`} />
            </View>
          ))}
        </View>
        <Muted small>Switch on means kept fixed.</Muted>
      </View>

      <Button title={r.meals.length ? `Apply to ${r.meals.length} meal${r.meals.length === 1 ? '' : 's'}` : 'Nothing to change'} kind="primary" disabled={!r.meals.length} onPress={apply} />
    </ScrollView>
  )
}

function Step({ label, onPress, sym }: { label: string; onPress: () => void; sym: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.text, fontSize: 26 }}>{sym}</Text>
    </Pressable>
  )
}
