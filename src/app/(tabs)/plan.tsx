// The week ahead and the programme: where you are, what comes back next, the
// next seven days of meals, food test results, shopping and the cook's menu.
import { useState } from 'react'
import { Pressable, ScrollView, Share, Text, View } from 'react-native'
import { router } from 'expo-router'
import DateTimePicker from '@react-native-community/datetimepicker'
import { C } from '@/theme'
import { addDays, at, SLOT_NAME, ymd } from '@/lib/core'
import { allTests, endPause, openPause, ownRules, pauseClashOn, setOwnRule, startPause, isOwner, mealsOn, PHASES, phaseOn, phaseStart, phaseText, setPhaseStart, useDb } from '@/lib/db'
import { menuText } from '@/lib/share'
import { Button, Card, Field, Label, Muted, Screen } from '@/components/ui'

const short = (day: string) => at(day, '12:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
const MAIN = ['breakfast', 'lunch', 'dinner'] as const

export default function Plan() {
  useDb()
  const today = ymd(new Date())
  const ph = phaseOn(today)
  const i = PHASES.findIndex(p => p.id === ph.id)
  const next = PHASES[i + 1] ? phaseText(PHASES[i + 1]) : null
  const nextStart = next ? phaseStart(next.id) : null
  const [dates, setDates] = useState(false)
  const tests = allTests().filter(t => t.result !== 'waiting' || t.day < today)

  return (
    <Screen>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}>
        <Text style={{ color: C.text, fontSize: 28, fontWeight: '700' }}>Plan</Text>

        <Card>
          <Label>Now · {ph.id === 'CE' ? ph.name : `${ph.id} ${ph.name}`}</Label>
          <Muted>{ph.about}</Muted>
          {next && <Text style={{ color: C.text, fontSize: 15 }}>
            Next: {next.id} {next.name}{next.brings.length ? ` (${next.brings.join(', ')})` : ''}, {nextStart ? `from ${short(nextStart)}` : 'start date not set yet'}.
          </Text>}
          <Button title={dates ? 'Hide phase dates' : 'Phase dates'} onPress={() => setDates(!dates)} />
          {dates && PHASES.slice(1).map(p => {
            const s = phaseStart(p.id)
            const prev = PHASES[PHASES.indexOf(p) - 1]
            const min = prev ? phaseStart(prev.id) : null
            return (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ flex: 1, color: C.text, fontSize: 15 }}>{p.id} {phaseText(p).name}</Text>
                {s ? <DateTimePicker value={at(s, '12:00')} mode="date" display="compact" minimumDate={min ? at(addDays(min, 1), '12:00') : undefined}
                      onChange={(_, d) => d && setPhaseStart(p.id, ymd(d))} />
                  : <Button title="Set" onPress={() => setPhaseStart(p.id, min && min >= today ? addDays(min, 1) : today)} />}
              </View>
            )
          })}
          {dates && <Muted small>Phases only change on the dates set here. Set each one when the coach confirms it.</Muted>}
        </Card>

        <PauseCard today={today} />

        <Label>Next seven days</Label>
        {Array.from({ length: 7 }, (_, k) => addDays(today, k)).map(day => {
          const meals = mealsOn(day)
          return (
            <Card key={day}>
              <Pressable onPress={() => router.push({ pathname: '/day/[date]', params: { date: day } })}>
                <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{day === today ? 'Today' : short(day)}</Text>
              </Pressable>
              {MAIN.map(s => {
                const m = meals.find(x => x.slot === s)
                return (
                  <Pressable key={s} onPress={() => router.push({ pathname: '/meal', params: { day, slot: s } })} style={{ flexDirection: 'row', gap: 8 }}>
                    <Text style={{ width: 80, color: C.text2, fontSize: 14 }}>{SLOT_NAME[s]}</Text>
                    <Text style={{ flex: 1, color: m?.name || m?.items.length ? (m.state === 'eaten' ? C.text3 : C.text) : C.text3, fontSize: 14 }} numberOfLines={1}>
                      {m?.state === 'skipped' ? 'Skipped' : m?.name || m?.items.map(x => x.name).join(', ') || 'Not planned'}
                    </Text>
                  </Pressable>
                )
              })}
            </Card>
          )
        })}

        {(isOwner() && (ph.id !== 'CE' && ph.id !== 'V1') || tests.length > 0) && (
          <Card>
            <Label>Food tests</Label>
            {!tests.length && <Muted small>Each new food shows up here after the morning that follows it.</Muted>}
            {tests.map(t => (
              <View key={`${t.day}|${t.food}`} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: C.text, fontSize: 15 }}>{t.food}</Text>
                <Text style={{ color: t.result === 'failed' ? C.caution : t.result === 'passed' ? C.positive : C.text2, fontSize: 15 }}>{t.result}, {short(t.day)}</Text>
              </View>
            ))}
          </Card>
        )}

        <RulesCard />
        <Button title="Add my coach's meal plan (photo or text)" onPress={() => router.push('/menu')} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button title="Shopping list" onPress={() => router.push('/shop')} /></View>
          <View style={{ flex: 1 }}><Button title="Tomorrow for the cook" onPress={() => Share.share({ message: menuText(addDays(today, 1)) })} /></View>
        </View>
      </ScrollView>
    </Screen>
  )
}

/** Pause and restart. The programme allows one pause in any 30 days; the app warns, it does not stop you. */
function PauseCard({ today }: { today: string }) {
  const open = openPause()
  const clash = !open ? pauseClashOn(today) : null
  return (
    <Card>
      <Label>{open ? `Paused since ${short(open.start)}` : 'Pause'}</Label>
      <Muted small>{open
        ? 'Restarting moves the phases that had not started yet by the days you were paused.'
        : 'For a day or two off the plan, such as travel or a wedding. Rules, targets and food tests stop, and the programme days stop counting until you restart.'}</Muted>
      {clash && <Text style={{ color: C.caution, fontSize: 13 }}>You paused on {short(clash.start)}. The programme allows one pause in 30 days, so check with the coach first.</Text>}
      {open ? <Button title="Restart the plan today" kind="primary" onPress={() => endPause(today)} />
        : <Button title="Pause from today" onPress={() => startPause(today)} />}
    </Card>
  )
}

/** The person's own food rules from their coach. They win over the app's general rules. */
function RulesCard() {
  const rules = ownRules()
  const [word, setWord] = useState('')
  const add = (allow: boolean) => { setOwnRule(word, allow); setWord('') }
  return (
    <Card>
      <Label>My coach's food rules</Label>
      <Muted small>{isOwner() ? 'Anything your coach tells you that the app gets wrong.' : 'What your coach allows or rules out. These win over the app\'s general rules.'} One word or food each, such as chicken or coffee.</Muted>
      {rules.map(r => (
        <View key={r.word} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, color: C.text, fontSize: 15 }}>{r.word}</Text>
          <Text style={{ color: r.allow ? C.positive : C.caution, fontSize: 14 }}>{r.allow ? 'allowed' : 'not allowed'}</Text>
          <Pressable onPress={() => setOwnRule(r.word, null)} hitSlop={10} accessibilityLabel={`Remove ${r.word}`}><Text style={{ color: C.text3, fontSize: 16 }}>✕</Text></Pressable>
        </View>
      ))}
      <Field value={word} onChangeText={setWord} placeholder="A food, such as chicken" style={{ width: '100%' }} autoCapitalize="none" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button title="Allowed" disabled={!word.trim()} onPress={() => add(true)} /></View>
        <View style={{ flex: 1 }}><Button title="Not allowed" disabled={!word.trim()} onPress={() => add(false)} /></View>
      </View>
    </Card>
  )
}
