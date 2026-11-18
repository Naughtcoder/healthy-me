// Medicines and supplements: what you take now, what starts later, what has
// stopped. Tap one to change it; every change takes effect at once, no update
// to the app needed. Adding finds the brand in the Indian brand list.
import { Pressable, ScrollView, Switch, Text, View } from 'react-native'
import { router } from 'expo-router'
import { C } from '@/theme'
import { at, boxRow, clock, medGroups, V1_MEDS, ymd, type Med } from '@/lib/core'
import { meds, saveMed, useDb } from '@/lib/db'
import { overlaps } from '@/lib/drugs'
import { Button, Card, Label, Muted, Screen } from '@/components/ui'

const short = (day: string) => at(day, '12:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const often = (m: Med) => !m.every || m.every <= 1 ? (m.times.length === 1 ? 'once a day' : `${m.times.length} times a day`)
  : m.every === 7 ? 'once a week' : `every ${m.every} days`

function Row({ m, today }: { m: Med; today: string }) {
  const ended = !!m.end && m.end < today
  const live = m.active && !ended
  return (
    <Pressable onPress={() => router.push({ pathname: '/med', params: { id: m.id } })} accessibilityRole="button" accessibilityLabel={m.name}
      style={({ pressed }) => ({ backgroundColor: pressed ? C.raised : C.card, borderRadius: 16, padding: 14, gap: 4 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ flex: 1, color: live ? C.text : C.text3, fontSize: 16, fontWeight: '600' }}>{m.name}</Text>
        <Switch value={m.active} onValueChange={v => saveMed({ ...m, active: v })} />
      </View>
      {m.contains ? <Text style={{ color: C.text2, fontSize: 14 }}>{m.contains}</Text> : null}
      <Muted small>{m.dose}, {often(m)}{m.withFood ? `, ${m.withFood}` : ''} · {m.times.map(clock).join(', ')}</Muted>
      <Muted small>Box: {[...new Set((V1_MEDS[m.id]?.times ?? m.times).map(t => boxRow(m.id, t)))].join(' and ')}</Muted>
      {V1_MEDS[m.id] ? <Muted small>In V1 (from Sat 7 Nov): {V1_MEDS[m.id].times.map(clock).join(', ')}, {V1_MEDS[m.id].withFood}</Muted> : null}
      <Muted small>{m.start > today ? `Starts ${short(m.start)}` : `Since ${short(m.start)}`}{ended ? ` · ended ${short(m.end!)}` : m.end ? ` · until ${short(m.end)}` : ''}</Muted>
    </Pressable>
  )
}

export default function Meds() {
  useDb()
  const today = ymd(new Date())
  const all = meds()
  const { now, later, stopped } = medGroups(all, today)
  const doubled = overlaps(now.map(m => ({ name: m.name, contains: m.contains, perDay: m.times.length / (m.every && m.every > 1 ? m.every : 1) })))
  return (
    <Screen>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}>
        <Text style={{ color: C.text, fontSize: 28, fontWeight: '700' }}>Meds</Text>

        <Label>Taking now</Label>
        {now.length ? now.map(m => <Row key={m.id} m={m} today={today} />) : <Muted>Nothing yet. Add a medicine or supplement below.</Muted>}

        {doubled.map(d => (
          <Card key={d.key}>
            <Text style={{ color: C.caution, fontSize: 15, fontWeight: '600' }}>{d.label} is in {d.names.length} of these</Text>
            <Muted small>{d.names.join(' and ')}{d.perDay ? `: ${d.perDay} a day in total` : ''}. Worth checking with the coach that the total is what they meant.</Muted>
          </Card>
        ))}

        {later.length > 0 && <Label>Starting later</Label>}
        {later.map(m => <Row key={m.id} m={m} today={today} />)}        <Button title="Add one medicine or supplement" onPress={() => router.push('/med')} />

        {stopped.length > 0 && <Label>Stopped</Label>}
        {stopped.map(m => <Row key={m.id} m={m} today={today} />)}

      </ScrollView>
    </Screen>
  )
}
