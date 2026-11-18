import { useRef, useState } from 'react'
import { Dimensions, ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import { C } from '@/theme'
import { ymd } from '@/lib/core'
import { phaseOn, setMeta, targetsOn } from '@/lib/db'
import { connectHealth, healthConnected } from '@/lib/health'
import { askPermission, refreshAlarms } from '@/lib/notify'
import { Button, Card, Label, Muted } from '@/components/ui'

export const TOUR_VERSION = '4'  // only bump for a new card; changed text alone does not re-show it

/** Three cards: Today, the plan, and reminders. */
export default function Tour() {
  const W = Dimensions.get('window').width
  const ref = useRef<ScrollView>(null)
  const [page, setPage] = useState(0)
  const [health, setHealth] = useState(healthConnected())
  const today = ymd(new Date())
  const ph = phaseOn(today), T = targetsOn(today)

  const cards = [
    {
      title: 'Today',
      body: [
        'Weight first, on an empty stomach. Then protein, calories and water for the day.',
        'Each meal is one card. Type a name in the morning ("paneer bhurji"). Fill in the amounts while cooking. Tick it when eaten.',
        'Only eaten food counts. A meal with no amounts says so, and the totals become a minimum.',
        'One button sends the coach today\'s weight and yesterday\'s food.',
      ],
    },
    {
      title: 'The plan',
      body: [
        `You are in ${ph.id === 'CE' ? ph.name : `${ph.id} ${ph.name}`}. ${T.kcalMax ? `Up to ${T.kcalMax} kcal and about ${T.proteinG} g protein a day.` : T.kcalMin ? `At least ${T.kcalMin} kcal and about ${T.proteinG} g protein a day.` : `About ${T.proteinG} g protein a day.`}`,
        'Every food is checked against the phase as you add it: allowed, not yet, ask the coach, or new.',
        'From V2, a new food is a test. The next morning shows the weight change and asks about bloating and burping. You or the coach set the result.',
        'Plan shows the next seven days, phase dates, the shopping list and the menu for the cook.',
      ],
    },
    {
      title: 'Reminders',
      body: [
        'Three kinds only: the morning weigh-in, and each supplement with one follow-up 30 minutes later if you have not answered.',
        'Taken and Skip work from the lock screen. Meal reminders are off unless you switch them on in Me.',
        'Meds holds your medicines and supplements: change times, doses and dates there yourself. Me holds your weight chart, measurements, Apple Health, coach questions and backups.',
      ],
    },
  ]
  const last = page === cards.length - 1
  const finish = async () => { setMeta('tour', TOUR_VERSION); router.back(); if (await askPermission()) void refreshAlarms() }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: 64 }}>
      <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => setPage(Math.round(e.nativeEvent.contentOffset.x / W))}>
        {cards.map((c, i) => (
          <View key={i} style={{ width: W, padding: 20, gap: 14 }}>
            <Text style={{ color: C.text, fontSize: 30, fontWeight: '700' }}>{c.title}</Text>
            <Card>{c.body.map((b, j) => <Muted key={j}>{b}</Muted>)}</Card>
            {i === 2 && !health && <Button title="Connect Apple Health" onPress={async () => setHealth(await connectHealth())} />}
            {i === 2 && health && <Label>Apple Health connected</Label>}
          </View>
        ))}
      </ScrollView>
      <View style={{ padding: 20, gap: 10 }}>
        <Muted small>{page + 1} of {cards.length}</Muted>
        <Button title={last ? 'Start' : 'Next'} kind="primary" onPress={() => last ? finish() : ref.current?.scrollTo({ x: W * (page + 1), animated: true })} />
        {!last && <Button title="Skip" onPress={finish} />}
      </View>
    </View>
  )
}
