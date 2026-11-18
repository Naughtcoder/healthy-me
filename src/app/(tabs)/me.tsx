// Everything about you rather than today: weight and measurements, Apple
// Health, coach questions, the weekly summary, and settings with backup and
// restore. Medicines have their own tab.
import { useEffect, useState } from 'react'
import { ScrollView, Share, Switch, Text, View } from 'react-native'
import { router } from 'expo-router'
import { C } from '@/theme'
import { addDays, at, ymd } from '@/lib/core'
import { refreshAlarms, mealAlerts } from '@/lib/notify'
import { exportAll, getMeta, measures, questions, setMeasure, setMeta, targetsOn, useDb, weights } from '@/lib/db'
import { bodyReadings, connectHealth, healthConnected, healthFor, type BodyReading, type DayHealth } from '@/lib/health'
import { worldCount } from '@/lib/foods'
import { BarChart, LineChart, RING } from '@/components/Charts'
import { Button, Card, Field, Label, Muted, Screen } from '@/components/ui'

const short = (day: string) => at(day, '12:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

export default function Me() {
  useDb()
  const today = ymd(new Date())
  const w = weights()
  const first = w[0], last = w[w.length - 1]
  const m = measures()
  const open = questions().filter(q => !q.answered).length
  return (
    <Screen>
      <ScrollView contentInsetAdjustmentBehavior="automatic" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}>
        <Text style={{ color: C.text, fontSize: 28, fontWeight: '700' }}>Me</Text>

        <Card>
          <Label>Weight</Label>
          {!w.length ? <Muted>Log your first empty-stomach weight on Today.</Muted> : (
            <>
              <Text style={{ color: C.text, fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                {last.kg.toFixed(1)} kg{w.length > 1 ? <Text style={{ color: C.text2, fontSize: 16, fontWeight: '400' }}>  {(last.kg - first.kg).toFixed(1)} since {short(first.day)}</Text> : null}
              </Text>
              <LineChart points={w.slice(-14).map(x => ({ label: short(x.day).split(' ')[0], value: x.kg }))} unit=" kg" />
            </>
          )}
        </Card>

        <BodyCard />
        <MeasureCard today={today} />
        {m.length > 0 && (
          <Card>
            <Label>Measurements, cm</Label>
            {m.slice(-6).map(r => <Text key={r.day} style={{ color: C.text, fontVariant: ['tabular-nums'] }}>{short(r.day)}   chest {r.chest ?? '-'}   waist {r.waist ?? '-'}   hip {r.hip ?? '-'}</Text>)}
          </Card>
        )}

        <HealthWeek steps={targetsOn(today).steps} />

        <Button title={`Questions for the coach${open ? ` · ${open} open` : ''}`} onPress={() => router.push('/questions')} />
        <Button title="Weekly summary" onPress={() => router.push('/review')} />

        <Label>Settings</Label>
        <MealAlerts />
        <Button title="Your details, diet and eating window" onPress={() => router.push('/setup')} />
        <Button title="Replay the walkthrough" onPress={() => router.push('/tour')} />
        <Button title="Export a backup" onPress={() => Share.share({ message: exportAll() })} />
        <Button title="Restore from a backup" onPress={() => router.push('/restore')} />
        <Muted small>Everything is stored only on this phone. Export a backup now and then, and keep it somewhere safe.</Muted>
        <Muted small>Food values: this app's own list first, then {worldCount().toLocaleString('en-IN')} foods from USDA FoodData Central (public domain) and the UK's CoFID 2021 (contains public sector information licensed under the Open Government Licence v3.0). Barcodes are looked up on Open Food Facts (Open Database Licence); only the barcode number is sent.</Muted>
      </ScrollView>
    </Screen>
  )
}

function MeasureCard({ today }: { today: string }) {
  const [chest, setChest] = useState(''), [waist, setWaist] = useState(''), [hip, setHip] = useState('')
  const n = (s: string) => { const v = Number(s.replace(',', '.')); return v > 0 ? v : null }
  return (
    <Card>
      <Label>Measurements · Sundays</Label>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Field value={chest} onChangeText={setChest} keyboardType="decimal-pad" placeholder="chest" unit="cm" width={74} />
        <Field value={waist} onChangeText={setWaist} keyboardType="decimal-pad" placeholder="waist" unit="cm" width={74} />
        <Field value={hip} onChangeText={setHip} keyboardType="decimal-pad" placeholder="hip" unit="cm" width={74} />
      </View>
      <Button title="Save for today" kind="primary" disabled={!(n(chest) || n(waist) || n(hip))}
        onPress={() => { setMeasure(today, { chest: n(chest), waist: n(waist), hip: n(hip) }); setChest(''); setWaist(''); setHip('') }} />
    </Card>
  )
}

/** The last seven days from Apple Health. The step goal only shows once activity is part of the plan. */
function HealthWeek({ steps }: { steps: boolean }) {
  const [on, setOn] = useState(healthConnected())
  const [rows, setRows] = useState<[string, DayHealth][]>([])
  const [goal, setGoal] = useState(Number(getMeta('stepGoal') ?? 8000))
  const [goalText, setGoalText] = useState(String(goal))
  useEffect(() => {
    if (!on) return
    const today = ymd(new Date())
    Promise.all(Array.from({ length: 7 }, (_, i) => addDays(today, -i)).map(d => healthFor(d).then(h => [d, h] as [string, DayHealth]))).then(setRows)
  }, [on])
  if (!on) return (
    <Card>
      <Label>Apple Health</Label>
      <Muted>Connect to see sleep, breathing at night, resting heart rate and steps from your watch.</Muted>
      <Button title="Connect Apple Health" kind="primary" onPress={async () => setOn(await connectHealth())} />
    </Card>
  )
  const days = [...rows].reverse()
  const lab = (d: string) => short(d).split(' ')[0]
  return (
    <>
      <Card>
        <Label>Sleep, last 7 nights · hours</Label>
        <BarChart points={days.map(([d, h]) => ({ label: lab(d), value: h.sleep ? h.sleep.asleepMin / 60 : null }))} color={RING.meds} target={7} />
      </Card>
      <Card>
        <Label>Breathing disturbances in sleep · an hour</Label>
        <LineChart points={days.map(([d, h]) => ({ label: lab(d), value: h.breathing ?? null }))} color={RING.move} />
        <Muted small>The sleep apnea number to watch as weight comes down.</Muted>
      </Card>
      <Card>
        <Label>Resting heart rate · beats a minute</Label>
        <LineChart points={days.map(([d, h]) => ({ label: lab(d), value: h.restingHr ? Math.round(h.restingHr) : null }))} color={RING.meals} />
      </Card>
      <Card>
        <Label>Steps</Label>
        <BarChart points={days.map(([d, h]) => ({ label: lab(d), value: h.steps ?? null }))} color={RING.move} target={steps ? goal : undefined} />
        {steps ? (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Text style={{ color: C.text2, fontSize: 14 }}>Daily goal</Text>
            <Field value={goalText} onChangeText={setGoalText} keyboardType="number-pad" unit="steps" width={90}
              onEndEditing={() => { const v = Math.round(Number(goalText)); if (v >= 1000 && v <= 30000) { setMeta('stepGoal', String(v)); setGoal(v) } else setGoalText(String(goal)) }} />
          </View>
        ) : <Muted small>No step goal in this phase. The coach asked for no exercise until V4.</Muted>}
      </Card>
      <Card>
        <Label>Calories burnt by moving · kcal</Label>
        <BarChart points={days.map(([d, h]) => ({ label: lab(d), value: h.activeKcal != null ? Math.round(h.activeKcal) : null }))} color={RING.move} />
        <Muted small>Apple Health's active energy: what movement burns above resting. It follows your heart rate, so it is only accurate on days the watch is worn.</Muted>
      </Card>
    </>
  )
}

function MealAlerts() {
  const [on, setOn] = useState(mealAlerts())
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: C.text, fontSize: 16 }}>Meal reminders</Text>
        <Muted small>Off by default. The weigh-in and supplement reminders always run.</Muted>
      </View>
      <Switch value={on} onValueChange={v => { setMeta('mealAlerts', v ? '1' : '0'); setOn(v); void refreshAlarms() }} />
    </Card>
  )
}

/** What the smart scale saved to Apple Health: body fat and lean mass beside weight. */
function BodyCard() {
  const [rows, setRows] = useState<BodyReading[]>([])
  useEffect(() => { bodyReadings(30).then(setRows) }, [])
  const fat = rows.filter(r => r.fatPct != null), lean = rows.filter(r => r.leanKg != null)
  if (!fat.length && !lean.length) return null
  const last = <K extends keyof BodyReading>(xs: BodyReading[], k: K) => xs[xs.length - 1]?.[k]
  const change = (xs: BodyReading[], k: 'fatPct' | 'leanKg') => xs.length > 1 ? (xs[xs.length - 1][k]! - xs[0][k]!).toFixed(1) : null
  return (
    <Card>
      <Label>Body composition · from the scale</Label>
      {fat.length > 0 && <Text style={{ color: C.text, fontSize: 16 }}>Body fat {last(fat, 'fatPct')}%{change(fat, 'fatPct') ? <Text style={{ color: C.text2 }}>{`  ${change(fat, 'fatPct')} since ${short(fat[0].day)}`}</Text> : null}</Text>}
      {lean.length > 0 && <Text style={{ color: C.text, fontSize: 16 }}>Lean mass {last(lean, 'leanKg')} kg{change(lean, 'leanKg') ? <Text style={{ color: C.text2 }}>{`  ${change(lean, 'leanKg')} since ${short(lean[0].day)}`}</Text> : null}</Text>}
      {fat.length > 1 && <LineChart points={fat.slice(-14).map(r => ({ label: short(r.day).split(' ')[0], value: r.fatPct! }))} unit="%" />}
      <Muted small>Lean mass is what you want to hold on to while fat comes down: muscle, bone and water. A steady lean mass with falling body fat means the weight lost is fat.</Muted>
    </Card>
  )
}
