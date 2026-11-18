// A coach's meal plan into your own days: a photo or the pasted text is read
// by the open-source model, you check it, then it fills your days as planned
// meals. Meals already eaten or skipped are never touched.
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import DateTimePicker from '@react-native-community/datetimepicker'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import * as Haptics from 'expo-haptics'
import { C } from '@/theme'
import { at, menuOnDates, SLOT_NAME, ymd } from '@/lib/core'
import { nameOf } from '@/lib/meals'
import { addPlannedMeals } from '@/lib/db'
import { parseMealCsv } from '@/lib/csv'
import { prepare, readMealPlan, visionReady, type MenuDay } from '@/lib/vision'
import { Button, Card, Chip, Field, Label, Muted } from '@/components/ui'

export default function Menu() {
  const [days, setDays] = useState<MenuDay[] | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [start, setStart] = useState(new Date())
  const [weeks, setWeeks] = useState(2)

  const read = async (input: { image?: string; text?: string }) => {
    setBusy(true); setError('')
    try {
      const out = await readMealPlan(input)
      if (!out.length) setError('No meals could be read. Try a clearer photo, or paste the text.')
      setDays(out)
    } catch (e: any) { setError(e?.message ?? 'That did not work. Try again.') }
    finally { setBusy(false) }
  }
  const photo = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : { granted: true }
    if (!perm.granted) return setError('Camera access is off. Turn it on in Settings, or choose a photo.')
    const r = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 })
    if (r.canceled || !r.assets[0]) return
    await read({ image: await prepare(r.assets[0].uri) })
  }
  const csv = async () => {
    setError('')
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/csv'], copyToCacheDirectory: true })
      if (r.canceled || !r.assets[0]) return
      const { days: out, problems } = parseMealCsv(await new File(r.assets[0].uri).text())
      if (!out.length) return setError(problems.slice(0, 3).join(' '))
      setDays(out)
      if (problems.length) setError(`${problems.length} row${problems.length > 1 ? 's' : ''} skipped. ${problems.slice(0, 2).join(' ')}`)
    } catch { setError('That file could not be read. Save it as a CSV and try again.') }
  }
  const span = days ? Math.max(1, ...days.map(d => d.day)) : 1
  const placed = days ? menuOnDates(days, ymd(start), weeks) : []
  const add = () => {
    const n = addPlannedMeals(placed.map(p => ({ day: p.day, slot: p.slot, name: p.name || nameOf(p.items), state: 'planned', eatenAt: null, cook: true, note: p.method ?? null, origin: 'coach', time: p.time ?? null,
      items: p.items.map(i => ({ name: i.name, grams: i.grams, ml: null, at: null, p: null, kcal: null, source: null })) })))
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setError(''); router.back()
    return n
  }
  const setMeal = (d: number, i: number, name: string) => setDays(ds => ds!.map(x => x.day === d ? { ...x, meals: x.meals.map((m, j) => j === i ? { ...m, name } : m) } : x))
  const dropMeal = (d: number, i: number) => setDays(ds => ds!.map(x => x.day === d ? { ...x, meals: x.meals.filter((_, j) => j !== i) } : x))

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        {!days && (
          <Card>
            <Muted>Photograph your coach's meal plan, or paste its text. You check every meal before anything is added.</Muted>
            {visionReady() && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Button title="Take a photo" kind="primary" onPress={() => photo(true)} /></View>
                <View style={{ flex: 1 }}><Button title="Choose a photo" onPress={() => photo(false)} /></View>
              </View>
            )}
            <Button title="Upload a CSV file" onPress={csv} />
            <Muted small>Columns: day, slot, meal, food, grams (one row per food; slot is breakfast, snack1, lunch, snack2, dinner, snack3 or snack4; an optional time column like 14:00 sets the clock time). A Google Sheet downloaded as CSV works. Uploading again replaces the meals still planned and keeps what you ate or skipped.</Muted>
            <Field value={text} onChangeText={setText} multiline placeholder="Or paste the meal plan here" style={{ width: '100%', minHeight: 120, textAlignVertical: 'top' }} />
            <Button title="Read the text" disabled={!text.trim() || !visionReady()} onPress={() => read({ text })} />
            <Muted small>Or skip this and plan each meal yourself from Today.</Muted>
          </Card>
        )}
        {busy && <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ActivityIndicator /><Muted small>Reading. The first read after a quiet spell takes about 30 seconds.</Muted></View>}
        {error ? <Text style={{ color: C.caution, fontSize: 14 }}>{error}</Text> : null}

        {days && (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Muted>Day 1 is</Muted>
              <DateTimePicker value={start} mode="date" display="compact" onChange={(_, d) => d && setStart(d)} />
            </View>
            {span <= 7 && (
              <View style={{ gap: 6 }}>
                <Muted small>A {span === 1 ? 'one-day' : `${span}-day`} plan. Repeat it for:</Muted>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[1, 2, 4].map(w => <Chip key={w} title={weeks === w ? `✓ ${w} week${w > 1 ? 's' : ''}` : `${w} week${w > 1 ? 's' : ''}`} onPress={() => setWeeks(w)} />)}
                </View>
              </View>
            )}
            <Button title={`Add ${placed.length} meals to my plan`} kind="primary" disabled={!placed.length} onPress={add} />
            <Muted small>Fills {at(placed[0]?.day ?? ymd(start), '12:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} onwards. A meal you already ate or skipped is kept; a planned one is replaced.</Muted>
          </Card>
        )}

        {days && days.map(d => (
          <Card key={d.day}>
            <Label>Day {d.day}</Label>
            {d.meals.map((m, i) => (
              <View key={i} style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ width: 92, color: C.text2, fontSize: 13 }}>{SLOT_NAME[m.slot]}</Text>
                  <View style={{ flex: 1 }}><Field value={m.name} onChangeText={v => setMeal(d.day, i, v)} style={{ width: '100%' }} /></View>
                  <Pressable onPress={() => dropMeal(d.day, i)} hitSlop={10} accessibilityLabel="Remove"><Text style={{ color: C.text3, fontSize: 16 }}>✕</Text></Pressable>
                </View>
                {m.items.length > 0 && <Muted small>{m.items.map(x => `${x.name}${x.grams ? ` ${x.grams} g` : ''}`).join(', ')}</Muted>}
              </View>
            ))}
          </Card>
        ))}

      </ScrollView>
    </View>
  )
}
