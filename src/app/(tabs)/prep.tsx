// Meal prep: what to wash, cut, weigh and measure for the meals still to eat, added up across the day (or the next two or three), then the steps meal by meal.
import { useState } from 'react'
import { Pressable, ScrollView, Share, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { C } from '@/theme'
import { addDays, at, clock, ymd } from '@/lib/core'
import { dayMacros } from '@/lib/budget'
import { cooksText, cookText, prepList, type PrepCook, type PrepLine } from '@/lib/prep'
import { mealsOn, plan, targetsOn, useDb } from '@/lib/db'
import { Button, Card, Chip, Label, Muted, Screen, Tick } from '@/components/ui'

const short = (day: string) => at(day, '12:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
const g = (n: number) => `${n} g`
const card = (c: PrepCook) => ({ name: c.name, items: c.items, steps: c.steps, eats: c.batch?.eats, servings: c.batch?.servings })

export default function Prep() {
  useDb()
  const today = ymd(new Date())
  const [from, setFrom] = useState(0), [span, setSpan] = useState(1)
  const [done, setDone] = useState<Set<string>>(new Set())
  const days = Array.from({ length: span }, (_, i) => addDays(today, from + i))
  const byDay = days.map(d => ({ day: d, meals: mealsOn(d) }))
  const list = prepList(plan, byDay.flatMap(d => d.meals))
  const unsaved = byDay.flatMap(({ day, meals }) => {
    const cap = targetsOn(day).kcalMax
    if (!cap || !meals.some(m => m.state === 'planned' && m.items.length)) return []
    const off = dayMacros(meals).kcal - cap
    return Math.abs(off) > 3 ? [`${short(day)} is at ${cap + off} kcal, not ${cap}`] : []
  })
  const toggle = (k: string) => { Haptics.selectionAsync(); setDone(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n }) }
  const rows = (kind: string, xs: PrepLine[]) => xs.map(l => {
    const k = `${kind}:${l.name}`, on = done.has(k)
    return (
      <Pressable key={k} onPress={() => toggle(k)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={{ flexDirection: 'row', gap: 12, paddingVertical: 5 }}>
        <Tick state={on ? 'done' : 'open'} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: on ? C.text3 : C.text, fontSize: 16, textDecorationLine: on ? 'line-through' : 'none' }}>{l.name}</Text>
            <Text style={{ color: on ? C.text3 : C.text2, fontSize: 15, fontVariant: ['tabular-nums'] }}>{g(l.grams)}</Text>
          </View>
          <Text style={{ color: C.text3, fontSize: 12 }}>{l.uses.join(' · ')}</Text>
        </View>
      </Pressable>
    )
  })
  const text = () => [
    `Prep for ${short(days[0])}${span > 1 ? ` to ${short(days[days.length - 1])}` : ''}`,
    ...(list.cut.length ? ['', 'Wash and cut:', ...list.cut.map(l => `- ${l.name}, ${g(l.grams)}`)] : []),
    ...(list.weigh.length ? ['', 'Weigh out:', ...list.weigh.map(l => `- ${l.name}, ${g(l.grams)}`)] : []),
    ...(list.spice.length ? ['', 'Measure:', ...list.spice.map(l => `- ${l.name}, ${g(l.grams)}`)] : []),
  ].join('\n')

  return (
    <Screen>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}>
        <Text style={{ color: C.text, fontSize: 28, fontWeight: '700' }}>Prep</Text>
        <Card>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Chip title={from === 0 ? '✓ Today' : 'Today'} onPress={() => setFrom(0)} />
            <Chip title={from === 1 ? '✓ Tomorrow' : 'Tomorrow'} onPress={() => setFrom(1)} />
            {[1, 2, 3].map(n => <Chip key={n} title={n === span ? `✓ ${n} day${n > 1 ? 's' : ''}` : `${n} day${n > 1 ? 's' : ''}`} onPress={() => setSpan(n)} />)}
          </View>
          <Muted small>{short(days[0])}{span > 1 ? ` to ${short(days[days.length - 1])}` : ''}. {list.meals} meal{list.meals === 1 ? '' : 's'} still to eat, cooked at home. Eaten and skipped meals are left out.</Muted>
          {unsaved.length > 0 && <Muted small>Not saved yet: {unsaved.join('; ')}. Press Save my meals on Today first, because the amounts below change when you do.</Muted>}
          {list.noAmounts > 0 && <Muted small>{list.noAmounts} meal{list.noAmounts === 1 ? ' has' : 's have'} items with no amount, left out of the totals.</Muted>}
        </Card>
        {list.meals === 0 && <Card><Muted>No meals left to prepare for these days.</Muted></Card>}
        {list.cut.length > 0 && <Card><Label>Wash and cut</Label>{rows('cut', list.cut)}</Card>}
        {list.weigh.length > 0 && <Card><Label>Weigh out</Label>{rows('weigh', list.weigh)}</Card>}
        {list.spice.length > 0 && <Card><Label>Spices, fats and liquids to measure</Label>{rows('spice', list.spice)}</Card>}
        {list.cooks.length > 0 && (
          <Card>
            <Label>Cook, in time order</Label>
            {list.cooks.map(c => (
              <View key={`${c.day}${c.slot}`} style={{ gap: 3, paddingVertical: 4 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{span > 1 ? `${short(c.day)}, ` : ''}{clock(c.time)} · {c.batch ? c.name.replace(/\s*\([\d.]+ serving\)/, '') : c.name}</Text>
                {c.batch && (
                  <View style={{ backgroundColor: C.raised, borderRadius: 10, padding: 8, gap: 2 }}>
                    <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>Cook once for the {c.batch.eats.map(e => clock(e.time)).join(' and ')} meals</Text>
                    <Text style={{ color: C.text2, fontSize: 13 }}>Cook this much: {c.items.filter(i => i.grams).map(i => `${i.name} ${Math.round((i.grams ?? 0) * 10) / 10} g`).join(', ')}</Text>
                  </View>
                )}
                <View style={{ alignSelf: 'flex-start' }}><Button title="Share how to cook this" onPress={() => Share.share({ message: cookText(card(c)) })} /></View>
                {c.steps.map((s, i) => <Text key={i} style={{ color: C.text2, fontSize: 14, lineHeight: 20 }}>{c.steps.length > 1 ? `${i + 1}. ` : ''}{s}</Text>)}
              </View>
            ))}
          </Card>
        )}
        <Button title="Share all the recipes" disabled={!list.cooks.length} onPress={() => Share.share({ message: cooksText(`Cooking for ${short(days[0])}${span > 1 ? ` to ${short(days[days.length - 1])}` : ''}`, list.cooks.filter(c => c.steps.length || c.items.length).map(card)) })} />
        <Button title="Send the prep list" kind="primary" disabled={!list.meals} onPress={() => Share.share({ message: text() })} />
      </ScrollView>
    </Screen>
  )
}
