import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import DateTimePicker from '@react-native-community/datetimepicker'
import { C } from '@/theme'
import { at, hm, ymd, type Profile } from '@/lib/core'
import { profile, saveProfile } from '@/lib/db'
import { Button, Card, Field, Label, Muted } from '@/components/ui'

const pick = <T extends string>(value: T, set: (v: T) => void, options: [T, string, string][]) => (
  <View style={{ gap: 8 }}>
    {options.map(([v, title, about]) => (
      <Pressable key={v} onPress={() => set(v)} accessibilityRole="radio" accessibilityState={{ selected: value === v }}
        style={{ padding: 12, borderRadius: 12, borderWidth: 2, borderColor: value === v ? C.positive : 'transparent', backgroundColor: C.raised, gap: 2 }}>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: C.text2, fontSize: 14, lineHeight: 19 }}>{about}</Text>
      </Pressable>
    ))}
  </View>
)

/** First launch for anyone but the plan's owner: who they are, how they eat,
 *  which programme they follow and their eating window. Editable later from Progress. */
export default function Setup() {
  const now = profile()
  const [name, setName] = useState(now?.name ?? '')
  const [weight, setWeight] = useState(now?.weightKg ? String(now.weightKg) : '')
  const [height, setHeight] = useState(now?.heightCm ? String(now.heightCm) : '')
  const [goal, setGoal] = useState(now?.goalKg ? String(now.goalKg) : '')
  const [diet, setDiet] = useState<Profile['diet']>(now?.diet ?? 'veg')
  const [meatOk, setMeatOk] = useState<'no' | 'yes'>(now?.meatOk ? 'yes' : 'no')
  const [program, setProgram] = useState<Profile['program']>(now?.program ?? 'coach')
  const [menu, setMenu] = useState<'yes' | 'no'>(now ? (now.menu ? 'yes' : 'no') : 'yes')
  const [start, setStart] = useState(now?.start ? at(now.start, '12:00') : new Date())
  const [open, setOpen] = useState(at(ymd(new Date()), now?.open ?? '09:30'))
  const [close, setClose] = useState(at(ymd(new Date()), now?.close ?? '21:30'))
  const [cutoff, setCutoff] = useState(at(ymd(new Date()), now?.cutoff ?? '18:00'))
  const [protein, setProtein] = useState(now?.proteinG ? String(now.proteinG) : '')
  const [kcal, setKcal] = useState(now?.kcalMin ? String(now.kcalMin) : '')
  const [water, setWater] = useState(now?.waterMl ? String(now.waterMl / 1000) : '')
  const num = (s: string) => Number(s.replace(',', '.')) || 0
  const ok = name.trim() && num(weight) >= 30 && num(weight) <= 250

  const save = () => {
    saveProfile({
      name: name.trim(), weightKg: num(weight), heightCm: num(height), goalKg: num(goal) || num(weight),
      diet, meatOk: diet === 'nonveg' && meatOk === 'yes', program, menu: program === 'coach' && menu === 'yes', start: ymd(start),
      open: hm(open), close: hm(close), cutoff: hm(cutoff), owner: now?.owner,
      proteinG: num(protein) || null, kcalMin: num(kcal) || null, waterMl: num(water) ? Math.round(num(water) * 1000) : null,
    })
    if (now) router.back(); else router.replace('/tour')
  }

  return (
    <ScrollView automaticallyAdjustKeyboardInsets style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, gap: 14, paddingTop: 72, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: C.text, fontSize: 28, fontWeight: '700' }}>{now ? 'Your details' : 'Set up Healthy Me'}</Text>
      <Muted>Everything stays on this phone. You can change any of it later from Me.</Muted>

      <Card>
        <Label>About you</Label>
        <Field value={name} onChangeText={setName} placeholder="First name" style={{ width: '100%' }} />
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Field value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="Weight" unit="kg" width={90} />
          <Field value={goal} onChangeText={setGoal} keyboardType="decimal-pad" placeholder="Goal" unit="kg" width={90} />
          <Field value={height} onChangeText={setHeight} keyboardType="number-pad" placeholder="Height" unit="cm" width={90} />
        </View>
        <Muted small>Your daily protein target comes from your goal weight, unless your coach gave you one below.</Muted>
      </Card>

      {!now?.owner && (
        <Card>
          <Label>Your coach's targets</Label>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Field value={protein} onChangeText={setProtein} keyboardType="number-pad" placeholder="Protein" unit="g a day" width={80} />
            <Field value={kcal} onChangeText={setKcal} keyboardType="number-pad" placeholder="Minimum" unit="kcal" width={80} />
            <Field value={water} onChangeText={setWater} keyboardType="decimal-pad" placeholder="Water" unit="litres" width={70} />
          </View>
          <Muted small>Leave any of these empty if your coach has not set it.</Muted>
        </Card>
      )}

      <Card>
        <Label>How you eat</Label>
        {pick(diet, setDiet, [
          ['veg', 'Vegetarian', 'No meat, fish or eggs.'],
          ['egg', 'Vegetarian with eggs', 'Egg whites only while on the clean-eating phase.'],
          ['nonveg', 'Non-vegetarian', 'Chicken, fish and mutton show up in the food list and meal ideas.'],
        ])}
        {diet === 'nonveg' && program === 'coach' && (
          <>
            <Text style={{ color: C.text, fontSize: 15, marginTop: 4 }}>Has your coach allowed meat and fish in this phase?</Text>
            {pick(meatOk, setMeatOk, [
              ['no', 'Not yet, or not sure', 'Meat and fish are flagged "ask your coach first" and left out of meal ideas.'],
              ['yes', 'Yes, confirmed', 'Meat and fish count as allowed.'],
            ])}
          </>
        )}
      </Card>

      <Card>
        <Label>Your programme</Label>
        {pick(program, setProgram, [
          ['coach', 'Coach-led programme', 'Clean-eating rules first, then the later phases. Bring in your coach\'s meal plan from the Plan tab.'],
          ['own', 'My own plan', 'Plan each meal yourself against the same rules.'],
          ['track', 'Just tracking', 'Log what you eat, water, weight and medicines. No rules applied to meat.'],
        ])}
        {program === 'coach' && pick(menu, setMenu, [
          ['yes', 'Use the 14-day clean-eating menu', 'Breakfast, lunch and dinner for 14 days from Day 1, matched to how you eat. Change any meal later. Replaces nothing you have already logged.'],
          ['no', 'I will bring my coach\'s plan', 'Start with empty meals and load your plan from the Plan tab or a CSV.'],
        ])}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: C.text, fontSize: 15 }}>Day 1</Text>
          <DateTimePicker value={start} mode="date" display="compact" onChange={(_, d) => d && setStart(d)} />
        </View>
      </Card>

      <Card>
        <Label>Eating window</Label>
        {([['First meal', open, setOpen], ['Carbs end', cutoff, setCutoff], ['Last meal', close, setClose]] as const).map(([label, v, set]) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: C.text, fontSize: 15 }}>{label}</Text>
            <DateTimePicker value={v} mode="time" display="compact" onChange={(_, d) => d && set(d)} />
          </View>
        ))}
        <Muted small>The default is a 12 hour eating window, with no carbs after 6 pm.</Muted>
      </Card>

      <Button title={now ? 'Save' : 'Continue'} kind="primary" disabled={!ok} onPress={save} />
      {!ok && <Muted small>Add your name and weight to continue.</Muted>}
    </ScrollView>
  )
}
