// Add a dish you made: say or type it in one box ("I made spinach onion sag with 160 g palak, 90 g
// onion, 22 ml ghee, half a teaspoon of turmeric ..."), pick the time, check the card, save.
// The model reads the sentence when it is reachable; dish.ts reads it offline otherwise.
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import DateTimePicker from '@react-native-community/datetimepicker'
import * as Haptics from 'expo-haptics'
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import { C } from '@/theme'
import { at, hm, ymd, type Slot } from '@/lib/core'
import { snackSlot } from '@/lib/builder'
import { AllowanceCard } from '@/components/AllowanceCard'
import { asMealItems, cardOf, parseDish, saidIn, toItems, type Dish, type DishItem } from '@/lib/dish'
import { emptyMeal, mealsOn, putMeal, targetsOn } from '@/lib/db'
import { dayTotals } from '@/lib/meals'
import { dishShare, mealKcal } from '@/lib/budget'
import { scaleItems, SLOT_AT } from '@/lib/group'
import { readDish, visionReady } from '@/lib/vision'
import { Button, Card, Field, Label, Muted } from '@/components/ui'

/** The day's meal times (8, 10, 12, 2, 4, 6, 8) and where a dish can go: the four dish meals first; 10 AM and 8 PM on request. */
const SLOT_OF: Record<string, Slot> = { '10:00': 'snack1', '12:00': 'lunch', '14:00': 'snack5', '16:00': 'snack3', '18:00': 'snack6', '20:00': 'snack4' }
const DISH_TIMES = ['12:00', '14:00', '16:00', '18:00']
const MORE_TIMES = ['10:00', '20:00']
/** Equal percentages that add to exactly 100: 50/50, 34/33/33, 25 each. */
const equal = (n: number) => n < 1 ? [] : Array.from({ length: n }, (_, i) => Math.floor(100 / n) + (i < 100 % n ? 1 : 0))
const label = (t: string) => `${Number(t.slice(0, 2)) % 12 || 12} ${Number(t.slice(0, 2)) < 12 ? 'AM' : 'PM'}`

const FAT = /\b(ghee|oil|butter)\b/i
const r1 = (n: number) => Math.round(n * 10) / 10
/** A fat is shown and typed in millilitres unless switched to grams; the dish keeps it in grams (0.91 g a ml). */
const inMl = (i: DishItem, grams: string[]) => FAT.test(i.name) && i.grams != null && !grams.includes(i.name)
const amountShown = (i: DishItem, grams: string[]) => inMl(i, grams) ? `${r1(i.grams! / 0.91)} ml` : i.grams != null && FAT.test(i.name) ? `${r1(i.grams)} g` : gramsLabel(i)
const gramsLabel = (i: DishItem) => i.grams != null ? `${Math.round(i.grams * 10) / 10} g` : i.ml != null ? `${i.ml} ml` : 'no amount'

export default function AddDish() {
  const params = useLocalSearchParams<{ day?: string; slot?: string; q?: string }>()
  const day = params.day ?? ymd(new Date())
  const [text, setText] = useState(() => params.q ? `I made ${params.q} with ` : '')
  const [time, setTime] = useState(() => at(day, hm(new Date())))
  const [dish, setDish] = useState<Dish | null>(null)
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const [via, setVia] = useState<'model' | 'phone' | null>(null)
  const [picks, setPicks] = useState<string[]>([])      // the meal times a split dish goes to; empty means one portion at the time above
  const [more, setMore] = useState(false)
  const [sugg, setSugg] = useState<{ name: string; grams: number } | null>(null)   // what the allowance card would put in right now
  const [inG, setInG] = useState<string[]>([])   // fats the person switched to grams; the rest of the fats show in ml
  const [editAt, setEditAt] = useState<number | null>(null)   // the ingredient row whose amount is being typed
  const [editText, setEditText] = useState('')
  const [shares, setShares] = useState<number[]>([])    // percent of the dish for each chosen meal, in time order; they always add to 100

  useSpeechRecognitionEvent('start', () => setListening(true))
  useSpeechRecognitionEvent('end', () => setListening(false))
  useSpeechRecognitionEvent('result', e => { const t = e.results[0]?.transcript; if (t) { setText(t); setDish(null) } })
  useSpeechRecognitionEvent('error', e => {
    setListening(false)
    if (e.error === 'not-allowed') setError('Allow the microphone and speech recognition for Healthy Me in Settings to say it.')
    else if (e.error !== 'aborted' && e.error !== 'no-speech') setError('Voice input did not work. Try again, or type it.')
  })
  useEffect(() => () => { ExpoSpeechRecognitionModule.abort() }, [])
  const dictate = async () => {
    if (listening) { ExpoSpeechRecognitionModule.stop(); return }
    setError('')
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
    if (!perm.granted) { setError('Allow the microphone and speech recognition for Healthy Me in Settings to say it.'); return }
    Haptics.selectionAsync()
    setText(''); setDish(null)
    ExpoSpeechRecognitionModule.start({ lang: 'en-IN', interimResults: true, addsPunctuation: false })
  }

  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])
  const read = async () => {
    if (!text.trim()) return
    if (listening) ExpoSpeechRecognitionModule.stop()
    setBusy(true); setError(''); setDish(null)
    const local = parseDish(text)
    let out: Dish = local, how: 'model' | 'phone' = 'phone'
    if (visionReady()) {
      try {
        const r = await Promise.race([readDish(text), new Promise<never>((_, no) => setTimeout(() => no(new Error('slow')), 30_000))])
        // Only what was said: a food the model added on its own is dropped, and the dish keeps the name that was said.
        const items = toItems(r.items.filter(x => saidIn(text, x.food)).map(x => ({ food: x.food, amount: x.amount, unit: x.unit })))
        const said = r.name.trim() && saidIn(text, r.name) ? r.name.trim() : ''
        if (items.length) { const nm = local.name !== 'My dish' ? local.name : said; out = { name: nm ? nm.charAt(0).toUpperCase() + nm.slice(1) : items[0].name, items }; how = 'model' }
      } catch { /* offline, or the server is still waking up: the phone's reading is shown */ }
    }
    if (!alive.current) return
    setBusy(false); setVia(how)
    if (!out.items.length) { setError('I could not find any ingredients. Try "I made palak sabzi with 150 g spinach and 1 tablespoon ghee".'); return }
    setDish(out)
  }

  const card = dish ? cardOf(dish.items) : null
  const nowHm = hm(new Date()), isToday = day === ymd(new Date())
  const meals = mealsOn(day)
  const heldBy = (t: string) => meals.find(m => m.slot === SLOT_OF[t])
  const times = [...DISH_TIMES, ...(more || picks.some(t => MORE_TIMES.includes(t)) ? MORE_TIMES : [])].sort()
  // "Split into N": the next N dish meals that are free and not yet past, else the first N free ones.
  const splitInto = (n: number) => {
    Haptics.selectionAsync()
    if (n <= 1) { setPicks([]); return }
    const free = DISH_TIMES.filter(t => heldBy(t)?.state !== 'eaten')
    const ahead = free.filter(t => !isToday || t >= nowHm)
    setPicks([...ahead, ...free.filter(t => !ahead.includes(t))].slice(0, n).sort())
  }
  const toggle = (t: string) => {
    if (heldBy(t)?.state === 'eaten') return
    Haptics.selectionAsync()
    setPicks(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t].sort())
  }
  useEffect(() => { setShares(equal(picks.length)) }, [picks.join(',')])
  const n = Math.max(1, picks.length)
  const pct = (i: number) => shares.length === picks.length ? shares[i] : equal(picks.length)[i]
  // Move 5% between this meal and the next one (the last one gives to the first), never below 5%.
  const nudge = (i: number, by: number) => {
    Haptics.selectionAsync()
    setShares(cur => {
      const a = [...(cur.length === picks.length ? cur : equal(picks.length))], j = (i + 1) % a.length
      if (a[i] + by < 5 || a[j] - by < 5) return a
      a[i] += by; a[j] -= by
      return a
    })
  }
  const preset = (kind: 'equal' | 'early' | 'late') => {
    Haptics.selectionAsync()
    const e = equal(picks.length)
    if (kind === 'equal') { setShares(e); return }
    const w = picks.map((_, i) => kind === 'early' ? picks.length - i : i + 1), tot = w.reduce((a, b) => a + b, 0)
    const a = w.map(x => Math.round((x / tot) * 20) * 5)      // to the nearest 5%
    a[a.length - 1] += 100 - a.reduce((x, y) => x + y, 0)
    setShares(a)
  }
  // The day if this dish goes in: everything else on the day, plus this dish (the meals it replaces leave).
  const T = targetsOn(day)
  const target = picks.length ? picks.map(t => SLOT_OF[t]) : []
  const rest = dayTotals(meals.filter(m => !target.includes(m.slot)))
  const dayKcal = card ? Math.round(rest.kcal + rest.plannedKcal + card.kcal) : 0
  const over = !!T.kcalMax && !!card && dayKcal > T.kcalMax
  // How much of one ingredient the dish can have. The aim is what the meals it replaces come to, else what is left of the day, else the dish as it is.
  const replacedKcal = picks.length ? Math.round(meals.filter(m => target.includes(m.slot) && m.state === 'planned').reduce((t, m) => t + mealKcal(m), 0)) : 0
  const roomKcal = T.kcalMax ? Math.round(T.kcalMax - rest.kcal - rest.plannedKcal) : 0
  // Each dish meal has a fixed share of the day: the ceiling less the fixed foods, over the four dish meals. Choose the meals and the aim follows.
  const share = T.kcalMax ? dishShare(meals, T.kcalMax) : null
  const nMeals = Math.max(1, picks.length)
  const aimDefault = share ? share.each * nMeals : replacedKcal > 0 ? replacedKcal : roomKcal > 0 ? roomKcal : (card?.kcal ?? 0)
  const aimWhy = share ? `${nMeals} dish ${nMeals === 1 ? 'meal' : 'meals'} at ${share.each} kcal each` : replacedKcal > 0 ? `the ${picks.length} planned ${picks.length === 1 ? 'meal' : 'meals'} it replaces` : roomKcal > 0 ? 'what is left of the day' : 'the dish as it is'
  const removeAt = (i: number) => { Haptics.selectionAsync(); setDish(d => d && { ...d, items: d.items.filter((_, j) => j !== i) }) }
  const save = () => {
    if (!dish || !dish.items.length) return
    const now = new Date(), past = day < ymd(now)
    if (picks.length > 1) {
      // One portion of the dish in each chosen meal, every amount divided equally. Eaten meals stay; planned ones are replaced.
      for (const [i, t] of picks.entries()) {
        const slot = SLOT_OF[t], cur = mealsOn(day).find(m => m.slot === slot)
        if (cur?.state === 'eaten') continue
        const base = emptyMeal(day, slot)
        putMeal({ ...base, id: cur?.id, name: dish.name, state: past ? 'eaten' : 'planned', eatenAt: past ? t : null, time: t, origin: 'you', cook: true,
          note: `${pct(i)}% of ${dish.name}`, items: scaleItems(asMealItems(dish.items), pct(i) / 100) })
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      router.back()
      return
    }
    const meals = mealsOn(day)
    // Opened from a meal's search: the dish goes into that meal, at its own time.
    const given = params.slot as Slot | undefined
    const slot = given ?? snackSlot(meals, dish.name)
    if (!slot) { Alert.alert('No free snack row', 'This day already has six added dishes. Delete one first.'); return }
    const cur = meals.find(m => m.slot === slot)
    const base = emptyMeal(day, slot)
    if (given) {
      // Into this meal: planned at the meal's own time, unless it was already eaten.
      const t = cur?.time ?? SLOT_AT[slot] ?? hm(time)
      putMeal({ ...base, ...(cur ?? {}), id: cur?.id, name: dish.name, note: null, origin: 'you', items: asMealItems(dish.items), time: t, state: cur?.state === 'eaten' ? 'eaten' : 'planned', eatenAt: cur?.state === 'eaten' ? cur.eatenAt : null })
    } else {
      const eaten = at(day, hm(time)).getTime() <= now.getTime()
      putMeal({ ...base, id: cur?.id, name: dish.name, state: eaten ? 'eaten' : 'planned', eatenAt: eaten ? hm(time) : null, time: hm(time), origin: 'you', cook: true, items: asMealItems(dish.items) })
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    router.back()
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Card>
        <Label>What did you make?</Label>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <TextInput value={text} onChangeText={t => { setText(t); setDish(null) }} multiline placeholder="I made spinach onion sag with 160 g palak, 90 g onion, 22 ml ghee, half a teaspoon of turmeric"
            placeholderTextColor={C.text3} accessibilityLabel="Describe the dish"
            style={{ flex: 1, minHeight: 110, color: C.text, backgroundColor: C.raised, borderRadius: 12, padding: 12, fontSize: 16, textAlignVertical: 'top' }} />
          <Pressable onPress={dictate} accessibilityRole="button" accessibilityLabel={listening ? 'Stop listening' : 'Say it'}
            style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: listening ? C.negative : C.accent }}>
            <Text style={{ color: C.accentText, fontSize: 22 }}>{listening ? '■' : '🎙'}</Text>
          </Pressable>
        </View>
        <Muted small>Say or type the dish, each ingredient with its amount. Spoons, millilitres and "half a teaspoon" are fine; ghee in millilitres is weighed for you.</Muted>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: C.text, fontSize: 15 }}>Time</Text>
          <DateTimePicker value={time} mode="time" display="compact" onChange={(_, d) => d && setTime(d)} />
        </View>
        <Button title={busy ? 'Reading it...' : 'Read it'} kind="primary" disabled={busy || !text.trim()} onPress={read} />
        {busy && <ActivityIndicator />}
        {!!error && <Text style={{ color: C.negative, fontSize: 14 }}>{error}</Text>}
      </Card>

      {dish && card && (
        <Card>
          <Label>{dish.name}</Label>
          <View style={{ borderRadius: 12, overflow: 'hidden' }}>
            {card.items.map((it, i) => (
              <ReanimatedSwipeable key={`${it.name}${i}`} friction={2} rightThreshold={60} overshootRight={false}
                renderRightActions={() => (
                  <Pressable onPress={() => removeAt(i)} style={{ width: 88, backgroundColor: C.negative, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`Remove ${it.name}`}>
                    <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Remove</Text>
                  </Pressable>
                )}
                onSwipeableOpen={() => removeAt(i)}>
                <View style={{ backgroundColor: C.raised, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: i < card.items.length - 1 ? 1 : 0, borderBottomColor: C.line }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }}>{it.name}</Text>
                    <Text style={{ color: C.text3, fontSize: 12 }}>{it.p != null && it.kcal != null ? `${it.p} g protein · ${it.kcal} kcal` : 'no numbers for this one'}</Text>
                  </View>
                  {editAt === i ? (
                    <Field value={editText} placeholder="Amount" keyboardType="decimal-pad" unit={it.grams == null && it.ml != null || inMl(it, inG) ? 'ml' : 'g'} width={84} autoFocus returnKeyType="done"
                      onSubmitEditing={() => setEditAt(null)} onBlur={() => setEditAt(null)}
                      onChangeText={x => {
                        const c = x.replace(',', '.').replace(/[^\d.]/g, ''), parts = c.split('.')
                        const clean = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('')}` : c
                        setEditText(clean)
                        const n = clean === '' ? null : Number(clean)
                        const v = n == null || !Number.isFinite(n) ? null : n
                        setDish(d => d && { ...d, items: d.items.map((x2, j) => j !== i ? x2 : it.grams == null && it.ml != null ? { ...x2, ml: v } : inMl(it, inG) ? { ...x2, grams: v == null ? null : Math.round(v * 0.91 * 100) / 100 } : { ...x2, grams: v }) })
                      }} />
                  ) : (
                    <Pressable onPress={() => { Haptics.selectionAsync(); setEditAt(i); setEditText(String(inMl(it, inG) ? r1(it.grams! / 0.91) : it.grams ?? it.ml ?? '')) }} accessibilityRole="button" accessibilityLabel={`Amount of ${it.name}: ${amountShown(it, inG)}. Tap to change`}
                      style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.card }}>
                      <Text style={{ color: C.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{amountShown(it, inG)}</Text>
                    </Pressable>
                  )}
                  {FAT.test(it.name) && it.grams != null && (
                    <Pressable onPress={() => { Haptics.selectionAsync(); setEditAt(null); setInG(g => g.includes(it.name) ? g.filter(x => x !== it.name) : [...g, it.name]) }} hitSlop={6} accessibilityRole="button"
                      accessibilityLabel={`Show ${it.name} in ${inMl(it, inG) ? 'grams' : 'millilitres'}`} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: C.raised }}>
                      <Text style={{ color: C.accent, fontSize: 13, fontWeight: '700' }}>{inMl(it, inG) ? 'ml → g' : 'g → ml'}</Text>
                    </Pressable>
                  )}
                </View>
              </ReanimatedSwipeable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([['Protein', `${Math.round(card.p * 10) / 10} g`], ['Calories', `${card.kcal}`], ['Carbs', `${Math.round(card.carb)} g`], ['Fat', `${Math.round(card.fat)} g`]] as const).map(([k, v]) => (
              <View key={k} style={{ flex: 1, backgroundColor: C.raised, borderRadius: 12, padding: 10, alignItems: 'center' }}>
                <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{v}</Text>
                <Text style={{ color: C.text2, fontSize: 12 }}>{k}</Text>
              </View>
            ))}
          </View>
          {card.missing.length > 0 && <Text style={{ color: C.caution, fontSize: 13 }}>No numbers for {card.missing.join(', ')}, so the totals leave {card.missing.length === 1 ? 'it' : 'them'} out.</Text>}
          <Muted small>Read {via === 'model' ? 'by the photo-and-text reader' : 'on the phone'}. Carbs and fat are estimates. Tap an amount to change it (decimals such as 12.4 are fine). Swipe an ingredient left to take it out, or change the text and read it again.</Muted>
          <View style={{ gap: 8 }}>
            <Label>Split it</Label>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[1, 2, 3, 4].map(k => (
                <Pressable key={k} onPress={() => splitInto(k)} accessibilityRole="button" accessibilityLabel={k === 1 ? 'One portion' : `Split into ${k}`}
                  style={{ flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: n === k ? C.accent : C.raised }}>
                  <Text style={{ color: n === k ? C.accentText : C.text, fontWeight: '600', fontSize: 16 }}>{k === 1 ? 'None' : `${k}`}</Text>
                </Pressable>
              ))}
            </View>
            {picks.length > 0 && (
              <>
                <Muted small>Which meals get a portion. These are your dish meals; tap to change.</Muted>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {times.map(t => {
                    const held = heldBy(t), eaten = held?.state === 'eaten', on = picks.includes(t)
                    return (
                      <Pressable key={t} onPress={() => toggle(t)} disabled={eaten} accessibilityRole="button" accessibilityLabel={`${label(t)} meal`}
                        style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? C.accent : C.raised, opacity: eaten ? 0.4 : 1 }}>
                        <Text style={{ color: on ? C.accentText : C.text, fontWeight: '600', fontSize: 15 }}>{label(t)}{eaten ? ' (eaten)' : ''}</Text>
                      </Pressable>
                    )
                  })}
                  {!more && <Pressable onPress={() => setMore(true)} style={{ paddingVertical: 8, paddingHorizontal: 10 }}><Text style={{ color: C.text3, fontSize: 14 }}>10 AM, 8 PM</Text></Pressable>}
                </View>
                {picks.length === 1 && <Muted small>One meal chosen: pick more, or choose None.</Muted>}
                {picks.length > 1 && card && (
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {([['equal', 'Equal'], ['early', 'More early'], ['late', 'More late']] as const).map(([k, l]) => (
                        <Pressable key={k} onPress={() => preset(k)} accessibilityRole="button" style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.raised }}>
                          <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{l}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {picks.map((t, i) => (
                      <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.raised, borderRadius: 12, padding: 10 }}>
                        <Text style={{ color: C.text, fontSize: 15, fontWeight: '600', width: 56 }}>{label(t)}</Text>
                        <Pressable onPress={() => nudge(i, -5)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Less at ${label(t)}`} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.text, fontSize: 20 }}>−</Text></Pressable>
                        <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', width: 52, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{pct(i)}%</Text>
                        <Pressable onPress={() => nudge(i, 5)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`More at ${label(t)}`} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.text, fontSize: 20 }}>+</Text></Pressable>
                        <Text style={{ flex: 1, color: C.text2, fontSize: 12, textAlign: 'right' }}>{Math.round(card.kcal * pct(i) / 100)} kcal · {Math.round(card.p * pct(i)) / 100} g protein</Text>
                      </View>
                    ))}
                    <Muted small>Whole dish: {Math.round(card.p * 10) / 10} g protein · {card.kcal} kcal · {Math.round(card.carb)} g carbs · {Math.round(card.fat)} g fat, shared out by these percentages. The + and − move 5% to or from the next meal.</Muted>
                  </View>
                )}
                {picks.some(t => (heldBy(t)?.items.length ?? 0) > 0) && <Text style={{ color: C.caution, fontSize: 13 }}>Replaces what is planned at {picks.filter(t => (heldBy(t)?.items.length ?? 0) > 0).map(label).join(', ')}.</Text>}
              </>
            )}
            {!!T.kcalMax && <Text style={{ color: over ? C.negative : C.text2, fontSize: 13 }}>{over ? `The day would be ${dayKcal} kcal, ${dayKcal - T.kcalMax} over the ${T.kcalMax} ceiling.` : `The day comes to ${dayKcal} kcal of ${T.kcalMax}.`}</Text>}
          </View>
          {dish && dish.items.length > 0 && (
            <AllowanceCard items={dish.items} onSuggest={setSugg} aimDefault={aimDefault} aimWhy={aimWhy} otherKcal={Math.round(rest.kcal + rest.plannedKcal)} kcalMax={T.kcalMax ?? null}
              onUse={(name, grams) => { Haptics.selectionAsync(); setDish(d => d && { ...d, items: d.items.some(i => i.name === name) ? d.items.map(i => i.name === name ? { ...i, grams, ml: null } : i) : [...d.items.filter(i => !(FAT.test(i.name) && FAT.test(name) && i.grams == null && i.ml == null)), { name, grams, ml: null }] }) }} />
          )}
          {share ? <Muted small>Each dish meal is fixed at {share.each} kcal: {share.cap} less the {share.fixed} kcal of coffee ghee, egg whites, whey and the fibre drink, shared over four meals. Choose Split it and tap the meals, and the aim above becomes {share.each} times the number of meals. You can still type your own.</Muted> : null}
          <Button title={picks.length > 1 ? `Add ${picks.length} portions` : `Add to ${at(day, '12:00').toDateString() === new Date().toDateString() ? 'today' : 'this day'} at ${hm(time)}`} kind="primary" disabled={picks.length === 1} onPress={() => {
            const none = (dish?.items ?? []).filter(i => i.grams == null && i.ml == null).map(i => i.name)
            if (!none.length) { save(); return }
            const fill = sugg && none.includes(sugg.name) ? sugg : null
            Alert.alert(`No amount for ${none.join(', ')}`, fill ? `It would be saved without numbers. Set it puts in ${fill.grams} g ${fill.name.toLowerCase()}, the amount worked out above.` : 'It would be saved without numbers, so its calories are left out. Tap the amount to type it.',
              [{ text: 'Go back', style: 'cancel' }, { text: 'Save anyway', onPress: save }, ...(fill ? [{ text: 'Set it', isPreferred: true, onPress: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setDish(d => d && { ...d, items: d.items.map(i => i.name === fill.name ? { ...i, grams: fill.grams, ml: null } : i) }) } }] : [])])
          }} />
        </Card>
      )}
    </ScrollView>
  )
}
