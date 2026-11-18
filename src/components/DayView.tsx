// One day, top to bottom: weight and steps, three numbers, the food test (V2 on), the
// five meals, what is due (drinks and supplements), and the coach update.
import { useEffect, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { SymbolView } from 'expo-symbols'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import { C } from '@/theme'
import { addDays, at, boxRow, clock, fmtDuration, medOn, planDay, prepFor, SLOT_NAME, windowState, ymd, type Slot } from '@/lib/core'
import { dayRows, snackSlot } from '@/lib/builder'
import { dayTotals, type Meal } from '@/lib/meals'
import { dayMacros, fitDay, flexSplit, mealKcal } from '@/lib/budget'
import { mealRow, ruleBadge, weightCard } from '@/lib/bc'
import { addWater, deleteMeal, endPause, getMeta, isPaused, openPause, programmeDayOn, doneOn, dosesOn, meds, mealsOn, medsOn, phaseOn, plan, putMeal, setDone, setDose, setMealState, setSymptom, setTest, setWeight, symptomsOn, targetsOn, testsOn, undoWater, useDb, verdictOn, waterOn, weightOn, type TestResult } from '@/lib/db'
import { coachUpdate } from '@/lib/share'
import { healthConnected, useHealth } from '@/lib/health'
import { Bar, Button, Card, Chip, Field, Label, Muted, Tick } from './ui'

const pretty = (day: string) => at(day, '12:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
const MAINS: Slot[] = ['breakfast', 'lunch', 'dinner']
/** Weight and steps share a row at equal widths; the weigh-in field takes the whole row. */
const HALF = { flexGrow: 1, flexBasis: '40%' } as const

/** One day. `onShift` adds the arrows to step a day back or forward (Today tab). */
export function DayView({ day, onShift }: { day: string; onShift?: (n: number) => void }) {
  useDb()
  const now = new Date()
  const isToday = day === ymd(now)
  const ph = phaseOn(day)
  const p = planDay(plan, day)
  const meals = mealsOn(day)
  const T = targetsOn(day)
  const t = dayTotals(meals)
  const water = waterOn(day)
  const paused = isPaused(day)
  // A dish swiped away stays recoverable for a few seconds.
  const [removed, setRemoved] = useState<Meal | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current) }, [])
  const removeDish = (m: Meal) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    deleteMeal(m.day, m.slot)
    setRemoved(m)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setRemoved(null), 8000)
  }
  const undoRemove = () => {
    if (!removed) return
    Haptics.selectionAsync()
    putMeal({ ...removed, id: undefined })
    setRemoved(null)
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}>
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {onShift && <Arrow name="chevron.left" label="Previous day" onPress={() => onShift(-1)} />}
          <Text style={{ flex: 1, color: C.text, fontSize: 28, fontWeight: '700' }}>{pretty(day)}</Text>
          {onShift && !isToday && <Pressable onPress={() => onShift(0)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back to today"
            style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.raised }}>
            <Text style={{ color: C.text, fontWeight: '600', fontSize: 14 }}>Today</Text>
          </Pressable>}
          {onShift && <Arrow name="chevron.right" label="Next day" onPress={() => onShift(1)} />}
        </View>
        <Muted>{[programmeDayOn(day) ? `Day ${programmeDayOn(day)}` : null, `${ph.id === 'CE' ? '' : `${ph.id} `}${ph.name}`, isToday && !paused ? windowLine(now) : null].filter(Boolean).join(' · ')}</Muted>
      </View>

      {paused && (
        <Card style={{ backgroundColor: C.raised }}>
          <Label>Paused{openPause() ? ` since ${pretty(openPause()!.start)}` : ''}</Label>
          <Muted small>The diet rules, targets and food tests are off, and the programme days stop counting. Log what you eat if you like. Supplements and the weigh-in carry on.</Muted>
          {isToday && openPause() && <Button title="Restart the plan today" kind="primary" onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); endPause(day) }} />}
        </Card>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <WeightCard day={day} />
        {healthConnected() && <View style={HALF}><Steps day={day} goal={T.steps} /></View>}
      </View>

      {healthConnected() && <Sleep day={day} />}

      <Card style={{ gap: 12, padding: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ color: C.text2, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Calories</Text>
            <Text style={{ color: C.text, fontSize: 44, fontWeight: '700', fontVariant: ['tabular-nums'], lineHeight: 50 }}>{t.unknown ? '≥' : ''}{t.kcal}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', paddingBottom: 6 }}>
            {T.kcalMax ? <Text style={{ color: C.text, fontSize: 17, fontWeight: '600' }}>{Math.max(0, T.kcalMax - Math.round(t.kcal + t.plannedKcal))} left</Text> : null}
            <Text style={{ color: C.text2, fontSize: 13 }}>{T.kcalMax ? `of ${T.kcalMax} with planned meals` : T.kcalMin ? `minimum ${T.kcalMin}` : 'eaten so far'}</Text>
          </View>
        </View>
        {T.kcalMax ? <Bar value={(t.kcal + t.plannedKcal) / T.kcalMax} marker={t.kcal / T.kcalMax} tint={t.kcal + t.plannedKcal > T.kcalMax ? C.negative : C.positive} /> : null}
        {T.kcalMax ? <Muted small>{Math.round(t.kcal)} eaten · {Math.round(t.plannedKcal)} still planned{t.kcal + t.plannedKcal > T.kcalMax ? ` · ${Math.round(t.kcal + t.plannedKcal - T.kcalMax)} over the ceiling` : ''}</Muted> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Num raised label="Protein" value={`${t.unknown ? '≥' : ''}${t.p} g`} sub={`of ${T.proteinG} g`} />
          <Num raised label="Water" value={`${(water / 1000).toFixed(1)} L`} sub={`of ${plan.waterTargetMl / 1000} L`} />
        </View>
      </Card>
      {t.unknown > 0 && <Muted small>{t.unknown} eaten item{t.unknown === 1 ? ' has' : 's have'} no amount yet, so the totals are a minimum.</Muted>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip title="+250 ml water" onPress={() => { Haptics.impactAsync(); addWater(day, 250) }} />
        <Chip title="+500 ml" onPress={() => { Haptics.impactAsync(); addWater(day, 500) }} />
        {water > 0 && <Chip title="Undo" onPress={() => undoWater(day)} />}
      </View>

      {ph.id >= 'V2' && ph.id !== 'CE' && !paused && !isPaused(addDays(day, -1)) && <TestCard day={day} meals={meals} />}

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Label>Meals</Label>
          {(() => {
            const f = flexSplit(meals, T.kcalMax)
            if (!f.flex && !f.fixed) return null
            const over = f.left != null && f.left < 0
            return (
              <Text style={{ color: over ? C.negative : C.text2, fontSize: 13, fontVariant: ['tabular-nums'] }} accessibilityLabel={`Dish meals ${f.flex} calories${f.room != null ? `, room for ${f.room}` : ''}`}>
                Dish meals {f.flex}{f.room != null ? ` of ${f.room}` : ''} kcal
              </Text>
            )
          })()}
        </View>
        {dayRows(plan, meals).map(r => <MealRow key={r.slot} day={day} slot={r.slot} meal={r.meal} at={r.time} onDelete={removeDish} />)}
        {removed && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 14, backgroundColor: C.raised }}>
            <Text style={{ color: C.text2, fontSize: 14, flex: 1 }} numberOfLines={1}>Deleted {removed.name || removed.items.map(i => i.name).join(', ') || 'meal'}</Text>
            <Pressable onPress={undoRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel="Undo delete"><Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>Undo</Text></Pressable>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Pressable onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/dish', params: { day } }) }}
            accessibilityRole="button" accessibilityLabel="Add a dish"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, backgroundColor: C.accent }}>
            <Text style={{ color: C.accentText, fontSize: 18, fontWeight: '700' }}>+</Text>
            <Text style={{ color: C.accentText, fontSize: 15, fontWeight: '600' }}>Add a dish</Text>
          </Pressable>
          {meals.some(m => m.state === 'planned' && m.items.length > 0) && (
            <Pressable onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/balance', params: { day } }) }}
              accessibilityRole="button" accessibilityLabel="Balance the day"
              style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, backgroundColor: C.raised }}>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>Balance the day</Text>
            </Pressable>
          )}
          {snackSlot(meals) && (
            <Pressable onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/meal', params: { day, slot: snackSlot(meals)! } }) }}
              accessibilityRole="button" style={{ paddingVertical: 6, paddingHorizontal: 12 }}>
              <Text style={{ color: C.text3, fontSize: 14 }}>+ Another snack</Text>
            </Pressable>
          )}
        </View>
        <PlanCard meals={meals} cap={T.kcalMax} />
        <Prep day={day} />
      </View>

      <Due day={day} />

      {p?.note && <Card><Label>Note</Label><Muted>{p.note}</Muted></Card>}

      {isToday && <Button title={weightOn(day) ? 'Send to the coach: weight and yesterday\'s food' : 'Send to the coach (weight not logged yet)'} kind="primary"
        onPress={() => { Haptics.selectionAsync(); void coachUpdate(day).then(message => Share.share({ message })) }} />}
    </ScrollView>
  )
}

function windowLine(now: Date) {
  const w = windowState(plan, now)
  return w.state === 'before' ? `opens in ${fmtDuration(w.opensIn)}` : w.state === 'closed' ? 'eating window closed'
    : w.carbsLeft > 0 ? `window open, carbs until ${clock(plan.window.carbCutoff)}` : `window closes in ${fmtDuration(w.closesIn)}`
}

function Arrow({ name, label, onPress }: { name: 'chevron.left' | 'chevron.right'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress() }} hitSlop={12} accessibilityRole="button" accessibilityLabel={label} style={{ paddingHorizontal: 4 }}>
      <SymbolView name={name} tintColor={C.text2} size={20} weight="semibold" />
    </Pressable>
  )
}

/** The day as planned, after the last pick: calories, protein, fat and carbs, and one button that fixes the meals and brings the day to the ceiling. */
function PlanCard({ meals, cap }: { meals: Meal[]; cap: number | null }) {
  const t = dayMacros(meals)
  if (!meals.some(m => m.state !== 'skipped' && m.items.length)) return null
  const planned = meals.some(m => m.state === 'planned')
  const off = cap ? t.kcal - cap : 0
  const save = () => {
    if (!cap) return
    const r = fitDay(meals, cap)
    if (!r.meals.length) return Alert.alert('Nothing to adjust', 'The planned meals here are not recipe dishes, so their amounts stay as they are.')
    for (const m of r.meals) putMeal({ ...m, origin: m.origin === 'coach' ? 'you' : m.origin })
    Haptics.notificationAsync(r.reached ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning)
    if (!r.reached) Alert.alert('Closest I can get', `The dishes come to ${r.kcal} kcal for the day. Going further would make a dish too small or too big.`)
  }
  return (
    <Card>
      <Label>Planned for the day</Label>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Num label="Calories" value={`${t.kcal}`} sub={cap ? `of ${cap}` : 'kcal'} warn={!!cap && t.kcal > cap} />
        <Num label="Protein" value={`${t.p} g`} sub="planned" />
        <Num label="Fat" value={`${t.fat} g`} sub="estimate" />
        <Num label="Carbs" value={`${t.carb} g`} sub="estimate" />
      </View>
      {cap && planned && Math.abs(off) > 3
        ? <Button title={off > 0 ? `Save my meals: trim ${off} kcal to ${cap}` : `Save my meals: add ${-off} kcal to reach ${cap}`} kind="primary" onPress={save} />
        : cap && planned ? <Muted small>Saved at {cap} kcal. Change a meal and the button comes back.</Muted> : null}
    </Card>
  )
}

function Num({ label, value, sub, warn, raised }: { label: string; value: string; sub: string; warn?: boolean; raised?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: raised ? C.raised : C.card, borderRadius: 14, padding: 12, gap: 2 }}>
      <Text style={{ color: C.text2, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: warn ? C.caution : C.text, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ color: C.text3, fontSize: 12 }}>{sub}</Text>
    </View>
  )
}

/** Weight Card BC: a field until there is a weight, then the number, where it
 *  came from and the change since yesterday. Tap the number to change it. */
function WeightCard({ day }: { day: string }) {
  const w = weightOn(day), y = weightOn(addDays(day, -1))
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const v = weightCard(w ?? null, y ?? null, editing)
  const n = Number(text.replace(',', '.'))
  if (v.kind === 'value') return (
    <Pressable onPress={() => { setText(w!.kg.toFixed(1)); setEditing(true) }} accessibilityRole="button" accessibilityLabel="Change the weight" style={HALF}>
      <Num label={v.from === 'scale' ? 'Weight · scale' : 'Weight'} value={v.kg} sub={v.change ?? 'first weigh-in'} />
    </Pressable>
  )
  return (
    <Card style={{ flexBasis: '100%' }}>
      <Label>Weight · empty stomach</Label>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Field value={text} onChangeText={setText} keyboardType="decimal-pad" placeholder={v.hint} unit="kg" width={90} autoFocus={v.editing} />
        <Button title="Save" kind="primary" disabled={!(n > 30 && n < 250)} onPress={() => { setWeight(day, Math.round(n * 10) / 10); setText(''); setEditing(false) }} />
        {v.editing && <Button title="Cancel" onPress={() => setEditing(false)} />}
      </View>
    </Card>
  )
}

/** Last night's sleep from the watch, counted for the day you wake up on. */
function Sleep({ day }: { day: string }) {
  const z = useHealth(day)?.sleep
  const hm = (min: number) => `${Math.floor(min / 60)} h ${Math.round(min % 60)} min`
  const at = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  return (
    <View style={{ flexDirection: 'row' }}>
      <Num label="Sleep last night" value={z ? hm(z.asleepMin) : '–'}
        sub={z ? `${at(z.bed)} to ${at(z.wake)}${z.deepMin ? ` · deep ${hm(z.deepMin)}` : ''}${z.remMin ? ` · REM ${hm(z.remMin)}` : ''}` : 'nothing from the watch yet'} />
    </View>
  )
}

/** Steps from Apple Health for the day, against the goal once the phase has one. */
function Steps({ day, goal }: { day: string; goal: boolean }) {
  const h = useHealth(day)
  const n = h?.steps
  const target = Number(getMeta('stepGoal') ?? 8000)
  return <Num label="Steps" value={n == null ? '–' : Math.round(n).toLocaleString('en-IN')}
    sub={goal ? `of ${target.toLocaleString('en-IN')}` : 'from the watch'} />
}

/** Meal Row BC: one meal on the list. Rule flags use the meal screen's Rule
 *  Badge, so both always agree. The tick marks eaten or back to planned. */
function MealRow({ day, slot, meal, at, onDelete }: { day: string; slot: Slot; meal?: Meal; at?: string; onDelete: (m: Meal) => void }) {
  const v = mealRow(slot, meal, at)
  const open = () => { Haptics.selectionAsync(); router.push({ pathname: '/meal', params: { day, slot } }) }
  if (v.kind === 'link') return (
    <Pressable onPress={open} accessibilityRole="button" style={{ paddingVertical: 6, paddingHorizontal: 12 }}>
      <Text style={{ color: C.text3, fontSize: 14 }}>{v.text}</Text>
    </Pressable>
  )
  const flags = meal ? [...new Set(meal.items.map(i => ruleBadge(verdictOn(day, i.name))).filter(b => b && b.tone === 'amber').map(b => `${b!.text}`))] : []
  const card = (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${v.label}: ${v.title}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: pressed ? C.raised : C.card })}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: C.text2, fontSize: 13, fontWeight: '600' }}>{v.label}</Text>
        <Text style={{ color: v.titleTone === 'full' ? C.text : v.titleTone === 'planned' ? C.text2 : C.text3, fontSize: 16, fontWeight: '600' }} numberOfLines={2}>{v.title}</Text>
        {v.detail ? <Text style={{ color: C.text2, fontSize: 13 }}>{v.detail}</Text> : null}
        {flags.map(f => <Text key={f} style={{ color: C.caution, fontSize: 13 }}>{f}</Text>)}
      </View>
      {meal && meal.items.length > 0 && (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{mealKcal(meal)}</Text>
          <Text style={{ color: C.text3, fontSize: 11 }}>kcal</Text>
        </View>
      )}
      {v.tick && meal && (
        <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel={v.tick === 'done' ? 'Eaten' : 'Mark eaten'}
          onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setMealState(day, slot, meal.state === 'eaten' ? 'planned' : 'eaten') }}>
          <Tick state={v.tick} />
        </Pressable>
      )}
    </Pressable>
  )
  if (!meal) return card
  // Swipe the card left to delete it; the Undo bar above the list brings it back.
  return (
    <ReanimatedSwipeable friction={2} rightThreshold={72} overshootRight={false}
      renderRightActions={() => (
        <Pressable onPress={() => onDelete(meal)} accessibilityRole="button" accessibilityLabel={`Delete ${v.title}`}
          style={{ width: 92, marginLeft: 8, borderRadius: 16, backgroundColor: C.negative, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Delete</Text>
        </Pressable>
      )}
      onSwipeableOpen={() => onDelete(meal)}>
      {card}
    </ReanimatedSwipeable>
  )
}

/** Kitchen prep due today, from the plan file: one line each, no alarm. */
function Prep({ day }: { day: string }) {
  const items = prepFor(plan, day, {})
  if (!items.length) return null
  return (
    <View style={{ gap: 2, paddingHorizontal: 4, paddingTop: 4 }}>
      {items.map(e => <Muted key={e.key} small>{clock(e.time)} · {e.title}: {e.items?.map(i => `${i.name} ${i.amount ?? ''}`.trim()).join(', ')}</Muted>)}
    </View>
  )
}

/** Every pill due today, by time, with the pill box row it goes in. One tap each. Pills only: drinks and meals live in their own places. */
function Due({ day }: { day: string }) {
  const doses = dosesOn(day)
  const rows: { key: string; time: string; title: string; detail?: string; state: 'open' | 'done' | 'skipped'; tap: () => void }[] = []
  for (const m of medsOn(day)) for (const time of m.times) {
    const d = doses.find(x => x.med_id === m.id && x.time === time)
    const s = d ? (d.status === 'taken' ? 'done' : 'skipped') : 'open'
    rows.push({ key: `d:${m.id}:${time}`, time, title: m.name, detail: [boxRow(m.id, time), m.dose, m.withFood].filter(Boolean).join(', '), state: s,
      tap: () => setDose(day, m.id, time, s === 'open' ? 'taken' : s === 'done' ? 'skipped' : null) })
  }
  const sunday = at(day, '12:00').getDay() === 0
  if (!rows.length && !sunday) return null
  rows.sort((a, b) => a.time.localeCompare(b.time))
  return (
    <Card>
      <Label>Due today</Label>
      {sunday && <Pressable onPress={() => router.push('/me')}><Muted small>Sunday: measure chest, waist and hip before breakfast, and enter them in Me.</Muted></Pressable>}
      {rows.map(r => (
        <Pressable key={r.key} onPress={() => { Haptics.selectionAsync(); r.tap() }} accessibilityRole="button" accessibilityLabel={`${r.title}, ${r.state}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }}>
          <Text style={{ width: 64, color: C.text2, fontSize: 13, fontVariant: ['tabular-nums'] }}>{clock(r.time)}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: r.state === 'skipped' ? C.text3 : C.text, fontSize: 15, fontWeight: '500' }}>{r.title}</Text>
            {r.detail ? <Text style={{ color: C.text2, fontSize: 12 }}>{r.detail}</Text> : null}
          </View>
          <Tick state={r.state} />
        </Pressable>
      ))}
    </Card>
  )
}

/** V2 on: what was new yesterday and how the night went, then today's new food.
 *  The app shows the evidence; the owner or the coach sets the result. */
function TestCard({ day, meals }: { day: string; meals: Meal[] }) {
  const y = addDays(day, -1)
  const newToday = [...new Set(meals.filter(m => m.state === 'eaten').flatMap(m => m.items.flatMap(i => verdictOn(day, i.name).tests)))]
  const yMeals = mealsOn(y)
  const newY = [...new Set(yMeals.filter(m => m.state === 'eaten').flatMap(m => m.items.flatMap(i => verdictOn(y, i.name).tests)))]
  const results = new Map(testsOn(y).map(r => [r.food, r.result]))
  const w0 = weightOn(y), w1 = weightOn(day)
  const s = symptomsOn(day)
  const jump = w0 && w1 ? w1.kg - w0.kg : null
  return (
    <Card>
      <Label>Food test</Label>
      {newY.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: C.text, fontSize: 15 }}>Yesterday's new food{newY.length > 1 ? 's' : ''}: {newY.join(', ')}</Text>
          {newY.length > 1 && <Text style={{ color: C.caution, fontSize: 13 }}>Two new foods on one day. Neither result can be pinned on one food.</Text>}
          <Muted small>{jump == null ? 'Waiting for both morning weights.' : `Weight ${jump >= 0 ? 'up' : 'down'} ${Math.abs(jump).toFixed(1)} kg overnight.${jump >= 0.5 ? ' That is the coach\'s 0.5 kg flag.' : ''}`}</Muted>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Chip title={s?.bloating === 1 ? '✓ Bloated' : 'Bloated'} onPress={() => setSymptom(day, 'bloating', s?.bloating === 1 ? null : true)} />
            <Chip title={s?.burping === 1 ? '✓ Burping' : 'Burping'} onPress={() => setSymptom(day, 'burping', s?.burping === 1 ? null : true)} />
          </View>
          {newY.map(f => (
            <View key={f} style={{ gap: 4 }}>
              <Muted small>{f}: {results.get(f) ?? 'waiting'}</Muted>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {(['passed', 'failed', 'inconclusive'] as TestResult[]).map(r =>
                  <Chip key={r} title={results.get(f) === r ? `✓ ${r}` : r} onPress={() => setTest(y, f, results.get(f) === r ? 'waiting' : r)} />)}
              </View>
            </View>
          ))}
        </View>
      ) : <Muted small>No new food yesterday.</Muted>}
      {newToday.length > 0 && <Muted small>New today: {newToday.join(', ')}. Weigh in tomorrow morning to see how it went.</Muted>}
    </Card>
  )
}
