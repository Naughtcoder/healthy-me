import { useEffect, useState } from 'react'
import { ActionSheetIOS, ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import DateTimePicker from '@react-native-community/datetimepicker'
import * as ImagePicker from 'expo-image-picker'
import { C } from '@/theme'
import { at, clock, hm, ymd } from '@/lib/core'
import { deleteMed, med, saveMed } from '@/lib/db'
import { searchBrands, type Brand } from '@/lib/drugdb'
import { fromStrip, noteFor, splitContains } from '@/lib/drugs'
import { prepare, readStrip, visionReady } from '@/lib/vision'
import { Button, Card, Chip, Field, Label, Muted } from '@/components/ui'

const FOOD = ['empty stomach', 'before food', 'with breakfast', 'with lunch', 'with dinner', 'after food', 'at bedtime']

/** Add or change a medicine: find the brand, see what is in it, then dose,
 *  alarm times, food rule and dates. Every change here takes effect at once. */
export default function MedEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const old = id ? med(id) : null
  const [name, setName] = useState(old?.name ?? '')
  const [dose, setDose] = useState(old?.dose ?? '1 tablet')
  const [times, setTimes] = useState<string[]>(old?.times ?? ['09:30'])
  const [food, setFood] = useState(old?.withFood ?? 'with breakfast')
  const [start, setStart] = useState(old?.start ?? ymd(new Date()))
  const [end, setEnd] = useState<string | null>(old?.end ?? null)
  const [note, setNote] = useState(old?.note ?? '')
  const [about, setAbout] = useState(old?.about ?? '')
  const [contains, setContains] = useState(old?.contains ?? '')
  const [every, setEvery] = useState(old?.every ?? 1)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Brand[] | null>(null)
  const [searchError, setSearchError] = useState('')

  useEffect(() => {
    if (q.trim().length < 2) { setFound(null); return }
    let live = true
    const t = setTimeout(() => searchBrands(q).then(r => live && (setFound(r), setSearchError('')))
      .catch(() => live && setSearchError('The brand list did not open. Type the name and what is in it yourself.')), 200)
    return () => { live = false; clearTimeout(t) }
  }, [q])
  // A new medicine takes the brand's name; an existing one keeps its own and gets the ingredients.
  const pick = (b: Brand) => { if (!old || !name.trim()) setName(b.name); setContains(b.contains); setQ(''); setFound(null) }
  const parts = splitContains(contains)
  const [adding, setAdding] = useState(new Date(2026, 0, 1, 21, 0))
  const [reading, setReading] = useState(false)
  const [stripError, setStripError] = useState('')

  // A photo of the back of the strip fills What is in it, and the name when it is empty.
  const strip = async (camera: boolean) => {
    setStripError('')
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : { granted: true }
    if (!perm.granted) return setStripError('Camera access is off. Turn it on in Settings, or choose a photo.')
    const r = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 })
    if (r.canceled || !r.assets[0]) return
    setReading(true)
    try {
      const out = await readStrip(await prepare(r.assets[0].uri))
      const text = fromStrip(out.ingredients)
      if (!text) return setStripError('No list of ingredients could be read. Photograph the side that says "Each tablet contains" or "Composition".')
      setContains(text)
      if (!name.trim() && out.product.trim()) setName(out.product.trim())
    } catch (e: any) { setStripError(e?.message ?? 'That did not work. Try again.') }
    finally { setReading(false) }
  }
  const stripMenu = () => ActionSheetIOS.showActionSheetWithOptions(
    { options: ['Take a photo', 'Choose a photo', 'Cancel'], cancelButtonIndex: 2 },
    i => { if (i === 0) strip(true); if (i === 1) strip(false) })

  const save = () => {
    const newId = old?.id ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) + Date.now().toString(36)
    saveMed({ id: newId, name: name.trim(), dose: dose.trim(), times, withFood: food, start, end, note: note.trim() || undefined, about: about.trim() || undefined,
      active: old?.active ?? true, every: every > 1 ? every : undefined, contains: contains.trim() || undefined })
    router.back()
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Label>Find the brand</Label>
          <Field value={q} onChangeText={setQ} placeholder="Name or ingredient, e.g. vitamin D3 or iron" autoCorrect={false} style={{ width: '100%' }} />
          {found?.map(b => (
            <Pressable key={b.name} onPress={() => pick(b)} accessibilityRole="button" accessibilityLabel={b.name}
              style={({ pressed }) => ({ paddingVertical: 6, opacity: pressed ? 0.5 : 1 })}>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }}>{b.name}</Text>
              <Muted small>{b.contains}</Muted>
            </Pressable>
          ))}
          {found && !found.length && q.trim().length >= 3 && (
            <Muted small>Not found in the list. Type the name below and use Read the strip under What is in it.</Muted>
          )}
          {searchError ? <Muted small>{searchError}</Muted> : null}
        </Card>
        <Card>
          <Label>Name</Label>
          <Field value={name} onChangeText={setName} placeholder="Vitamin D3 60,000 IU" style={{ width: '100%' }} />
          <Label>Dose</Label>
          <Field value={dose} onChangeText={setDose} placeholder="1 capsule" style={{ width: '100%' }} />
        </Card>
        <Card>
          <Label>What is in it</Label>
          {visionReady() && <Button title="Read the strip" onPress={stripMenu} disabled={reading} />}
          {reading && <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ActivityIndicator /><View style={{ flex: 1 }}><Muted small>Reading. The first read after a quiet spell takes about 30 seconds.</Muted></View></View>}
          {stripError ? <Text style={{ color: C.caution, fontSize: 14 }}>{stripError}</Text> : null}
          <Field value={contains} onChangeText={setContains} placeholder="As on the strip: Coenzyme Q10 (300mg) + Vitamin E (10mg)" style={{ width: '100%' }} multiline />
          {parts.map(p => (
            <View key={p.name} style={{ gap: 2 }}>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{p.name}{p.strength ? `, ${p.strength}` : ''}</Text>
              <Muted small>{noteFor(p.name) ?? 'No plain-words note for this one yet.'}</Muted>
            </View>
          ))}
        </Card>
        <Card>
          <Label>Alarm times</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {times.map(t => <Chip key={t} title={`${clock(t)}  ✕`} onPress={() => setTimes(ts => ts.filter(x => x !== t))} />)}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <DateTimePicker value={adding} mode="time" display="compact" onChange={(_, d) => d && setAdding(d)} />
            <Button title="Add time" onPress={() => setTimes(ts => [...new Set([...ts, hm(adding)])].sort())} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[[1, 'Every day'], [7, 'Once a week']].map(([n, t]) => <Chip key={n} title={every === n ? `✓ ${t}` : String(t)} onPress={() => setEvery(Number(n))} />)}
          </View>
          {every === 7 && <Muted small>Weekly, on the same weekday as the start date.</Muted>}
        </Card>
        <Card>
          <Label>Food</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {FOOD.map(f => <Chip key={f} title={f === food ? `✓ ${f}` : f} onPress={() => setFood(f)} />)}
          </View>
        </Card>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label>Starts</Label>
            <DateTimePicker value={at(start, '12:00')} mode="date" display="compact" onChange={(_, d) => d && setStart(ymd(d))} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label>Ends</Label>
            {end
              ? <DateTimePicker value={at(end, '12:00')} mode="date" display="compact" onChange={(_, d) => d && setEnd(ymd(d))} />
              : <Button title="Set an end date" onPress={() => setEnd(start)} />}
          </View>
          {end && <Button title="No end date" onPress={() => setEnd(null)} />}
        </Card>
        <Card>
          <Label>What it is for</Label>
          <Field value={about} onChangeText={setAbout} placeholder="Why it was recommended" style={{ width: '100%' }} multiline />
        </Card>
        <Card>
          <Label>Note</Label>
          <Field value={note} onChangeText={setNote} placeholder="recommended by, why, anything to remember" style={{ width: '100%' }} multiline />
        </Card>
        {times.length === 0 && <Text style={{ color: C.caution }}>Add at least one alarm time.</Text>}
        <Button title="Save" kind="primary" onPress={save} disabled={!name.trim() || times.length === 0} />
        {old && <Button title="Delete" kind="danger" onPress={() => { deleteMed(old.id); router.back() }} />}
        <Muted small>Saved changes take effect at once. Alarms are booked three days ahead and refilled each time you open the app.</Muted>
      </ScrollView>
    </View>
  )
}
