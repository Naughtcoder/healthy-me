// One meal on one day: plan it with a name, fill it from one add bar, mark it
// eaten. Built from the behavioural components in src/lib/bc.ts (spec:
// drafts/at-health-meal-entry-bc-spec-2026-10-26.md). This file only draws
// what those functions return.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActionSheetIOS, ActivityIndicator, Alert, Modal, Pressable, ScrollView, Share, Switch, Text, TextInput, View } from 'react-native'
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router'
import DateTimePicker from '@react-native-community/datetimepicker'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition'
import { SymbolView } from 'expo-symbols'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import { C } from '@/theme'
import { at, clock, hm, isExtra, logWarnings, repeatDates, ymd, type Slot } from '@/lib/core'
import { slotTime, snackSlot, suggest } from '@/lib/builder'
import { FOODS, lookup, per100, searchFoods } from '@/lib/foods'
import { takeHandOff } from '@/lib/handoff'
import { amountLabel, countedAs } from '@/lib/servings'
import { kcalOf, substitutes, swapGrams } from '@/lib/recipes'
import { budgetOf, dishShare, fitRest } from '@/lib/budget'
import { build, FATS, recipeFor, roleOf, VEHICLES } from '@/lib/choices'
import { cookText, stepsOf } from '@/lib/prep'
import { droppedMeals, fitPortion, initialMembers, memberMeals, mergeAll, scaleItems, SLOT_AT, slotsFor, wouldReplace, type Members } from '@/lib/group'
import { dishBase, gridFor, plain, hasEgg, pickerFor, pickerFromContent, type Opt } from '@/lib/slots'
import { AllowanceCard } from '@/components/AllowanceCard'
import { dayTotals, nameOf, nutrition, type Meal, type MealItem } from '@/lib/meals'
import { actions, amountMode, amountText, headerText, nameField, PICKS, ruleBadge, showsTime, sourceNote, totalsBar } from '@/lib/bc'
import { addPlannedMeals, deleteMeal, dishesIMade, emptyMeal, lastAmount, lastLike, mealAt, mealsOn, plan, putMeal, recentItems, saveCustomFood, targetsOn, useDb, verdictOn } from '@/lib/db'
import { prepare, readLabel, readPlate, visionReady, type Label as LabelRead } from '@/lib/vision'
import { matches, rank } from '@/lib/search'
import { Button, Card, Chip, Field, Label, Muted } from '@/components/ui'

const blank = (name: string, grams: number | null = null, ml: number | null = null): MealItem =>
  ({ name, grams, ml, at: null, p: null, kcal: null, source: null })
/** 14:00 as "2 PM", 16:30 as "4:30 PM". */
const shortClock = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}` }
const short = (day: string) => at(day, '12:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

const OIL_NAMES = ['ghee', 'butter', 'olive oil', 'coconut oil', 'sesame oil', 'mustard oil']

export default function MealScreen() {
  useDb()
  const params = useLocalSearchParams<{ day?: string; slot?: Slot; voice?: string }>()
  const day = params.day ?? ymd(new Date())
  const slot = (params.slot ?? 'lunch') as Slot
  const today = ymd(new Date())
  const when = day < today ? 'past' : day > today ? 'future' : 'today'
  const saved = mealAt(day, slot)
  const [m, setM] = useState<Meal>(() => saved ? { ...saved, name: nameField(saved) } : emptyMeal(day, slot))
  const [time, setTime] = useState(() => at(day, saved?.eatenAt ?? saved?.time ?? (when === 'today' ? hm(new Date()) : slotTime(plan, slot))))
  // Once the time is set by hand, "Eaten" uses it instead of now.
  const [timeSet, setTimeSet] = useState(false)
  const extra = isExtra(slot)
  const [text, setText] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [label, setLabel] = useState<LabelRead | null>(null)
  const search = useRef<TextInput>(null)
  const [listening, setListening] = useState(false)
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState(false)
  const [swapAt, setSwapAt] = useState<number | null>(null)   // the ingredient row whose swap choices are showing
  const [left, setLeft] = useState<MealItem[]>([])
  // Later meals brought down to fit the ceiling after a heavier pick; saved together with this meal.
  const [trim, setTrim] = useState<Meal[]>([])

  // ---- Voice input: speech goes into the add bar, the same box as typing -------------------------
  useSpeechRecognitionEvent('start', () => setListening(true))
  useSpeechRecognitionEvent('end', () => setListening(false))
  useSpeechRecognitionEvent('result', e => { const t = e.results[0]?.transcript; if (t) setText(t) })
  useSpeechRecognitionEvent('error', e => {
    setListening(false)
    if (e.error === 'not-allowed') setError('Allow the microphone and speech recognition for Healthy Me in Settings to say what you ate.')
    else if (e.error !== 'aborted' && e.error !== 'no-speech') setError('Voice input did not work. Try again, or type it.')
  })
  useEffect(() => () => { ExpoSpeechRecognitionModule.abort() }, [])
  const dictate = async () => {
    if (listening) { ExpoSpeechRecognitionModule.stop(); return }
    setError(''); setLabel(null)
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
    if (!perm.granted) { setError('Allow the microphone and speech recognition for Healthy Me in Settings to say what you ate.'); return }
    Haptics.selectionAsync()
    setText('')
    ExpoSpeechRecognitionModule.start({ lang: 'en-IN', interimResults: true, addsPunctuation: false })
  }
  // Opened by Siri's "log a meal": start listening straight away.
  useEffect(() => { if (params.voice === '1') setTimeout(() => { void dictate() }, 500) }, [])

  const T = targetsOn(day)
  const rawOthers = mealsOn(day).filter(x => x.slot !== slot).map(x => trim.find(t => t.slot === x.slot) ?? x)
  // One dish for several meals: the chips choose which of the day's four dish meals hold it, each at a portion of this one.
  const family = slotsFor(slot, roleOf(m))
  // Each meal at the time it really sits: this meal at its time, an eaten one when it was eaten, else its own planned time, else its slot's.
  const slotAt = (sl: Slot) => {
    if (sl === slot) return hm(time)
    const o = rawOthers.find(x => x.slot === sl)
    return (o?.state === 'eaten' && o.eatenAt) || o?.time || SLOT_AT[sl] || slotTime(plan, sl)
  }
  const chipOrder = [...family].sort((a, b) => slotAt(a).localeCompare(slotAt(b)))
  const dishMeal = family.length > 0 && m.items.length > 0
  const [members, setMembers] = useState<Members>(() => dishMeal ? initialMembers(m, rawOthers) : {})
  const [splitting, setSplitting] = useState(false)
  const [merged, setMerged] = useState<{ items: MealItem[]; members: Members } | null>(null)   // "both portions in this meal": what to go back to
  const [pickQ, setPickQ] = useState('')   // search box over the dish choices
  const start = useRef(members).current
  const asSaved = dishMeal ? memberMeals(m, rawOthers, members) : []
  const emptied = dishMeal ? droppedMeals(m, rawOthers, start, members) : []
  const others = [...rawOthers.filter(x => !asSaved.some(y => y.slot === x.slot) && !emptied.some(y => y.slot === x.slot)), ...asSaved, ...emptied]
  const before = lastLike(slot, m.name, day)

  // ---- editing ------------------------------------------------------------------------------
  const set = (patch: Partial<Meal>) => setM(x => ({ ...x, ...patch }))
  // A changed amount clears the frozen numbers, so they are worked out again on save.
  const setItem = (i: number, patch: Partial<MealItem>) =>
    setM(x => ({ ...x, items: x.items.map((it, j) => j === i ? { ...it, ...patch, p: null, kcal: null, source: null } : it) }))
  const add = (name: string, amount?: number, isMl = false) => {
    Haptics.selectionAsync()
    const prev = lastAmount(name), c = countedAs(name)
    const grams = prev?.grams ?? (c ? c.each * 2 : lookup(name)?.grams ?? null)
    const item = !prev && amount ? blank(name, isMl ? null : amount, isMl ? amount : null) : blank(name, prev?.ml ? null : grams, prev?.ml ?? null)
    setM(x => ({ ...x, items: [...x.items, item] }))
    setText('')
    search.current?.focus()
  }
  const remove = (i: number) => { Haptics.selectionAsync(); setOpen(null); setLeft(l => [...l, m.items[i]]); setM(x => ({ ...x, items: x.items.filter((_, j) => j !== i) })) }
  // The meal card's picker: choose another allowed version of this meal; the foods, amounts and method follow.
  // Only choices that leave the rest of the day able to finish under the ceiling are open (the coach's 850 kcal in V1).
  const budget = budgetOf(others, T.kcalMax)
  // Only in a phase with a calorie ceiling (V1), where the coach dishes apply.
  // The slot is the planned time (the coach's day: 8 fat, 10/2/6 protein, 12/4 vegetables, 8 PM fibre drink); off the grid, what the meal contains decides.
  const plannedAt = useRef(saved?.time ?? slotTime(plan, slot)).current
  const grid = gridFor(m, plannedAt, slot)
  // Any option can be picked: the day is brought to the ceiling once, from Today ("Save my meals"), not meal by meal.
  const choices = budget ? (grid ? pickerFor(m, grid, Infinity, others.some(o => hasEgg(o.items))) : pickerFromContent(m, Infinity)) : null
  const baseKcal = useRef(kcalOf(m.items)), warnedAt = useRef(kcalOf(m.items))
  const apply = (out: Opt['built'], more: Meal[] = []) => {
    setPicking(false); setOpen(null)
    if (more.length) setTrim(t => [...t.filter(x => !more.some(y => y.slot === x.slot)), ...more])
    setM(x => ({ ...x, name: out.name, note: out.method, items: out.items.map(i => blank(i.name, i.grams)) }))
  }
  /** Nothing to confirm here any more: every choice goes straight in, and the day is fitted to the ceiling from Today. */
  const heavy = (_kcal: number, go: (trimRest: boolean) => void, _cancelable = true) => go(false)
  const putBack = (j: number) => { Haptics.selectionAsync(); setM(x => ({ ...x, items: [...x.items, left[j]] })); setLeft(l => l.filter((_, k) => k !== j)) }
  /** Add or take out one meal of the day as a place for this dish. */
  const toggle = (sl: Slot) => {
    if (sl === slot) return
    const o = rawOthers.find(x => x.slot === sl), t = clock(slotAt(sl)), mem = members[sl]
    if (mem) {
      if (start[sl] && (!mem.follow || o?.state === 'eaten')) { Alert.alert('Already eaten', `The ${t} meal is logged as eaten with this dish, so it stays.`); return }
      Haptics.selectionAsync(); setMembers(p => { const n = { ...p }; delete n[sl]; return n }); return
    }
    const add = () => { Haptics.selectionAsync(); setMembers(p => ({ ...p, [sl]: { k: 1, follow: true } })) }
    if (wouldReplace(o, m)) Alert.alert(`Replace the ${t} meal?`, `It has ${plain(o!.name) || nameOf(o!.items)}${o!.state === 'eaten' ? ', logged as eaten' : ''}. It becomes ${plain(m.name)}.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Replace', style: 'destructive', onPress: add }])
    else add()
  }
  /** Eat the portions of the other planned meals in this one: this meal becomes the whole pan, the others are emptied on save. */
  const eatAll = () => {
    const r = mergeAll(m.items, members)
    if (!r) return
    Haptics.selectionAsync()
    setMerged({ items: m.items, members })
    setM(x => ({ ...x, items: r.items }))
    setMembers(r.members)
  }
  const splitBack = () => { if (!merged) return; Haptics.selectionAsync(); setM(x => ({ ...x, items: merged.items })); setMembers(merged.members); setMerged(null) }
  const portion = (sl: Slot, d: number) => setMembers(p => p[sl] ? { ...p, [sl]: { ...p[sl]!, k: Math.min(3, Math.max(0.25, Math.round((p[sl]!.k + d) * 20) / 20)) } } : p)
  const pick = (o: Opt) => {
    setPickQ(''); setMerged(null)
    setLeft([])
    if (!choices || o.id === choices.current || !o.built.items.length) { setPicking(false); return }
    Haptics.selectionAsync()
    const kcal = kcalOf(o.built.items)
    heavy(kcal, trimRest => apply(o.built, trimRest && budget ? fitRest(others, kcal, budget) : []))
  }
  // Swap one vegetable for another that is on the list, same grams.
  const swapFood = (i: number, name: string) => { Haptics.selectionAsync(); setItem(i, { name, grams: swapGrams(m.items[i].name, name, m.items[i].grams) }) }
  useFocusEffect(useCallback(() => {
    const h = takeHandOff()
    if (h) setM(x => ({ ...x, items: [...x.items, blank(h.name, h.grams)] }))
  }, []))

  // ---- Add Food BC ------------------------------------------------------------------------
  const q = text.trim().toLowerCase()
  const recent = recentItems(12)
  const pool = [...new Set([...recent, ...FOODS.map(f => f.name)])]
  const own = q.length >= 2 ? pool.filter(n => n.toLowerCase().includes(q)).slice(0, 6) : []
  const results = q.length >= 2 ? [...own, ...searchFoods(q, 10).filter(n => !own.includes(n))].slice(0, 10) : []
  const chips = recent.filter(n => !m.items.some(i => i.name === n)).slice(0, 6)

  const words = pickQ.trim().toLowerCase().split(/\s+/).filter(Boolean)
  // The library dishes, then the dishes you made yourself that match: one tap puts one in this meal.
  const mine = !picking || !choices ? [] : dishesIMade().filter(d => !words.length || matches(d.name, pickQ)).slice(0, words.length ? 8 : 5).map((d): typeof choices.options[number] => {
    const items = d.items.map(i => ({ name: i.name, grams: i.grams ?? i.ml ?? 0 }))
    return { id: `my:${d.name}`, group: 'Your dishes', label: d.name, sub: `${Math.round(kcalOf(items))} kcal`, kcal: Math.round(kcalOf(items)), p: 0, blocked: false, built: { name: d.name, method: '', items } } as typeof choices.options[number]
  })
  const found = choices ? [...(words.length ? choices.options.filter(o => matches(`${o.label} ${o.sub ?? ''} ${o.group ?? ''}`, pickQ)) : choices.options), ...mine] : []
  // Searching shows one list, best match first: names that start with what you typed, then names with it as a word, then the rest.
  const shown = words.length ? [...found].sort((x, y) => rank(x.label, pickQ) - rank(y.label, pickQ)) : found

  const photo = async (kind: 'plate' | 'label') => {
    setError(''); setLabel(null)
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    const r = perm.granted ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })
    if (r.canceled || !r.assets[0]) return
    setBusy(true)
    try {
      const img = await prepare(r.assets[0].uri)
      if (kind === 'plate') {
        const out = await readPlate(img)
        setM(x => ({ ...x, items: [...x.items, ...out.map(o => blank(o.name, o.grams))] }))
      } else setLabel(await readLabel(img))
    } catch (e: any) { setError(e?.message ?? 'That did not work. Try again.') }
    finally { setBusy(false) }
  }
  const labelNums = label ? per100(label.nutrition) : null
  const camera = () => ActionSheetIOS.showActionSheetWithOptions(
    { options: ['Photo of the plate', 'Photo of a label', 'Cancel'], cancelButtonIndex: 2 },
    i => { if (i === 0) photo('plate'); if (i === 1) photo('label') })

  // ---- Suggestion BC and Totals Bar BC -------------------------------------------------------
  const rest = dayTotals(others)
  const here = m.items.reduce((t, i) => { const n = nutrition(i.name, i.grams, i.ml); return n ? { p: t.p + n.p, kcal: t.kcal + n.kcal } : t }, { p: 0, kcal: 0 })
  // The pan: this meal's foods and every other meal's, added up. The day against the ceiling, and the portion that fits it.
  const panAmounts = (() => {
    const tot = new Map<string, number>()
    for (const i of [...m.items, ...asSaved.flatMap(o => o.items)]) if (i.grams && i.name.trim()) tot.set(i.name, (tot.get(i.name) ?? 0) + i.grams)
    return [...tot].map(([n, g]) => `${n} ${Math.round(g * 10) / 10} g`).join(', ')
  })()
  const variable = here.kcal + asSaved.filter(o => o.state === 'planned').reduce((t, o) => t + kcalOf(o.items), 0)
  const dayKcal = (budget ? budget.fixed + budget.planned : 0) + here.kcal
  const overBy = budget ? Math.round(dayKcal - budget.cap) : 0
  const fitK = budget ? fitPortion(budget.cap, dayKcal - variable, variable) : 1
  const fit = () => { if (fitK >= 1) return; Haptics.selectionAsync(); setM(x => ({ ...x, items: scaleItems(x.items, fitK) })) }
  const dayP = Math.round(rest.p + rest.plannedP + here.p), dayK = Math.round(rest.kcal + rest.plannedKcal + here.kcal)
  const need = T.proteinG - rest.p - rest.plannedP
  const mainsLeft = ['breakfast', 'lunch', 'dinner'].filter(s => !others.some(o => o.slot === s && o.items.length)).length
  const carbMeals = others.filter(o => o.items.some(i => /rice|millet|quinoa|roti|oats|poha|dosa|sweet potato/i.test(i.name))).length
  const idea = !m.items.length && need >= 15
    ? suggest(plan, slot, { proteinLeft: need, mainsLeft, carbOk: carbMeals < T.carbMeals,
        avoid: new Set(others.flatMap(o => o.items.map(i => i.name))), allowed: n => verdictOn(day, n).level === 'ok' })
    : null
  const warn = [...new Set(m.items.flatMap(i => logWarnings(plan, i.name, hm(time)).filter(w => !w.startsWith('Not allowed'))))]
  const bar = totalsBar(m.items, dayP, T.proteinG, dayK, T.kcalMin, warn, T.kcalMax)

  // ---- Repeat BC ----------------------------------------------------------------------------
  // Copies this meal's name and foods into the same slot on later days, as planned meals.
  // Days where that meal was already eaten or skipped are left alone.
  const weekday = at(day, '12:00').toLocaleDateString('en-IN', { weekday: 'long' })
  const repeat = () => {
    const items = m.items.filter(i => i.name.trim())
    if (!items.length && !m.name.trim()) return Alert.alert('Nothing to repeat yet', 'Add a name or a food first.')
    const opts: [string, string[]][] = [
      ['Next 3 days', repeatDates(day, 3)], ['Next 7 days', repeatDates(day, 7)], ['Next 14 days', repeatDates(day, 14)],
      [`Every ${weekday} for 4 weeks`, repeatDates(day, 4, true)],
    ]
    ActionSheetIOS.showActionSheetWithOptions(
      { title: 'Repeat this meal', message: 'The same name and foods go into later days as planned meals. Meals already eaten or skipped are kept.', options: [...opts.map(o => o[0]), 'Cancel'], cancelButtonIndex: opts.length },
      i => {
        if (i >= opts.length) return
        const name = m.name.trim() || nameOf(items)
        // An added snack goes into a free snack on each day, at the same time.
        const slotOn = (d: string) => extra ? snackSlot(mealsOn(d), name) : slot
        const n = addPlannedMeals(opts[i][1].flatMap(d => { const s = slotOn(d); return s ? [{ day: d, slot: s, name, state: 'planned' as const, eatenAt: null, cook: m.cook, note: null, origin: 'repeat',
          time: extra ? hm(time) : null, items: items.map(it => ({ name: it.name, grams: it.grams, ml: it.ml, at: null, p: null, kcal: null, source: null })) }] : [] }))
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        Alert.alert('Repeated', `Added to ${n} day${n === 1 ? '' : 's'}${n < opts[i][1].length ? `. ${opts[i][1].length - n} already had this meal eaten or skipped${extra ? ', or no free snack' : ''}, so they were kept.` : '.'}`)
      })
  }

  // ---- Action BC ----------------------------------------------------------------------------
  const act = actions(m.state, when)
  const commit = (state: Meal['state'], more: Meal[] = []) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    const items = m.items.filter(i => i.name.trim())
    const at = state === 'eaten' && m.state !== 'eaten' && when === 'today' && !timeSet ? hm(new Date()) : hm(time)
    // An added snack keeps a planned time, so it holds its place in the day if moved back to planned.
    const planned = !extra ? null : state === 'planned' ? hm(time) : m.time ?? at
    // The meals that hold this dish are saved with it: same dish, each at its portion; meals taken out go back to empty.
    const group = dishMeal && (state === 'planned' || state === 'eaten') ? [...asSaved, ...emptied] : []
    for (const t of [...trim.filter(x => !more.some(y => y.slot === x.slot) && !group.some(y => y.slot === x.slot)), ...more, ...group]) putMeal({ ...t, origin: t.origin === 'coach' ? 'you' : t.origin })
    putMeal({ ...m, origin: m.origin === 'coach' ? 'you' : m.origin, state, items, name: m.name.trim() || nameOf(items), eatenAt: state === 'planned' ? null : at, time: planned })
    router.back()
  }
  // A meal made heavier by hand (amounts, added food) gets the same pop-up when it is logged as eaten.
  const save = (state: Meal['state']) => state === 'eaten' ? heavy(Math.round(here.kcal), trimRest => commit(state, trimRest && budget ? fitRest(others, Math.round(here.kcal), budget) : []), false) : commit(state)

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: headerText(slot, short(day), m.state, m.state === 'eaten' ? hm(time) : null) }} />
      <ScrollView automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}>

        {/* Meal card: the plan on top, a picker for the other allowed versions, then its foods and how to cook it */}
        {choices && (() => {
          const here_ = m.items.length ? `${Math.round(here.kcal)} kcal · ${Math.round(here.p)} g protein` : ''
          const leftFor = (k: number) => budget ? budget.cap - budget.fixed - k : null
          return (
            <>
              <Card>
                <Label>{m.state === 'eaten' ? 'Eaten' : 'Planned'} · {hm(time)}</Label>
                <Pressable onPress={() => choices.options.length > 1 && setPicking(v => !v)} accessibilityRole="button"
                  accessibilityLabel={`Meal: ${m.name}.${choices.options.length > 1 ? ' Tap to see the other choices.' : ''}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: C.text, fontSize: 20, fontWeight: '700' }}>{plain(m.name)}</Text>
                    <Text style={{ color: C.text2, fontSize: 14 }}>{here_}</Text>
                  </View>
                  {choices.options.length > 1 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.raised }}><Text style={{ color: C.accent, fontSize: 14, fontWeight: '600' }}>{picking ? 'Close' : 'Change'}</Text><SymbolView name={picking ? 'chevron.up' : 'chevron.down'} tintColor={C.accent} size={14} /></View>}
                </Pressable>
                {dishMeal && (
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }}>{roleOf(m) === 'protein' ? 'Use this at' : 'Eat this dish at'}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {chipOrder.map(sl => {
                        const o = rawOthers.find(x => x.slot === sl), on = sl === slot || !!members[sl]
                        const eaten = o?.state === 'eaten' && sl !== slot
                        const state = sl === slot ? 'this meal' : on ? (eaten ? 'eaten' : 'with this') : !o || !o.items.length ? 'free' : eaten ? 'eaten' : 'other dish'
                        const tag = ['snack1', 'snack2', 'dinner'].includes(sl) ? 'shake slot' : ''
                        return (
                          <Pressable key={sl} onPress={() => toggle(sl)} accessibilityRole="button" accessibilityState={{ selected: on }}
                            accessibilityLabel={`${clock(slotAt(sl))}${tag ? `, ${tag}` : ''}, ${state}`}
                            style={{ flexBasis: '22%', flexGrow: 1, minHeight: 54, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                              backgroundColor: on ? C.accent : C.raised, opacity: eaten && !on ? 0.5 : 1 }}>
                            <Text style={{ color: on ? C.accentText : C.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{shortClock(slotAt(sl))}</Text>
                            <Text style={{ color: on ? C.accentText : C.text3, fontSize: 11, textAlign: 'center' }} numberOfLines={2}>{[tag, state].filter(Boolean).join(' · ')}</Text>
                          </Pressable>
                        )
                      })}
                    </View>
                    <Muted small>{asSaved.length ? `One pan, cooked once for ${asSaved.length + 1} meals. Each meal gets the amounts below${splitting ? ', changed by the portions you set' : ''}. Tap a time to add or remove it.` : 'Tap other times to cook this dish once for more meals.'}</Muted>
                    {asSaved.length > 0 && (
                      <Pressable onPress={() => setSplitting(v => !v)} hitSlop={8} accessibilityRole="button">
                        <Text style={{ color: C.accent, fontSize: 14, fontWeight: '600' }}>{splitting ? 'Equal portions' : 'Split differently'}</Text>
                      </Pressable>
                    )}
                    {merged ? (
                      <Pressable onPress={splitBack} hitSlop={8} accessibilityRole="button">
                        <Text style={{ color: C.accent, fontSize: 14, fontWeight: '600' }}>Both portions are in this meal. Split them back into separate meals</Text>
                      </Pressable>
                    ) : Object.values(members).some(x => x?.follow) ? (
                      <Pressable onPress={eatAll} hitSlop={8} accessibilityRole="button">
                        <Text style={{ color: C.accent, fontSize: 14, fontWeight: '600' }}>Eat all the portions in this meal only</Text>
                      </Pressable>
                    ) : null}
                    {splitting && family.filter(sl => members[sl]?.follow).map(sl => {
                      const mem = members[sl]!, o = asSaved.find(x => x.slot === sl)
                      const kc = o ? Math.round(kcalOf(o.items)) : 0
                      return (
                        <View key={sl} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ flex: 1, color: C.text, fontSize: 15 }}>{clock(slotAt(sl))} meal · {kc} kcal</Text>
                          <Chip title="−" onPress={() => portion(sl, -0.25)} />
                          <Text style={{ width: 52, textAlign: 'center', color: C.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{Math.round(mem.k * 100)}%</Text>
                          <Chip title="+" onPress={() => portion(sl, 0.25)} />
                        </View>
                      )
                    })}
                    {overBy > 0 && variable > 0 && (
                      <Button title={`Fit to my day: ${Math.round(dayKcal)} kcal down to ${Math.round(dayKcal - variable * (1 - fitK))}`} onPress={fit} />
                    )}
                  </View>
                )}
                {(roleOf(m) === 'dish' || roleOf(m) === 'combo') && m.items.some(i => i.grams) && (
                  <Button title="Share how to cook this" onPress={() => {
                    // Every meal that holds this dish is cooked together: amounts added up, times listed.
                    const group = [{ time: slotAt(slot), items: m.items }, ...asSaved.map(o => ({ time: slotAt(o.slot), items: o.items }))].sort((x, y) => x.time.localeCompare(y.time))
                    const items = group.flatMap(g => g.items.filter(i => i.name.trim() && (i.grams || group.length === 1))).reduce<{ name: string; grams: number | null }[]>((acc, i) => { const x = acc.find(y => y.name.toLowerCase() === i.name.toLowerCase()); if (x) x.grams = (x.grams ?? 0) + (i.grams ?? 0); else acc.push({ name: i.name, grams: i.grams }); return acc }, [])
                    const eats = group.length > 1 ? group.map(g => ({ time: g.time, serving: 1 })) : undefined
                    void Share.share({ message: cookText({ name: m.name, items, steps: stepsOf(m.note ?? recipeFor(m)), eats }) })
                  }} />
                )}
                {picking && (
                  <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicking(false)}>
                    <View style={{ flex: 1, backgroundColor: C.bg }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 }}>
                        <Text style={{ color: C.text, fontSize: 20, fontWeight: '700' }}>Change dish</Text>
                        <Pressable onPress={() => { setPicking(false); setPickQ('') }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                          <Text style={{ color: C.accent, fontSize: 16, fontWeight: '600' }}>Done</Text>
                        </Pressable>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.raised, borderRadius: 12, paddingHorizontal: 12, marginHorizontal: 16, marginBottom: 6 }}>
                        <SymbolView name="magnifyingglass" tintColor={C.text3} size={16} />
                        <TextInput value={pickQ} onChangeText={setPickQ} placeholder="Search: gobi, palak, paneer, soup" placeholderTextColor={C.text3} autoFocus
                          style={{ flex: 1, minHeight: 46, color: C.text, fontSize: 17 }} autoCorrect={false} spellCheck={false} autoCapitalize="none" clearButtonMode="while-editing" />
                      </View>
                      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
                    {words.length > 0 && (
                      <Pressable onPress={() => router.replace({ pathname: '/dish', params: { day, slot, q: pickQ.trim() } })} accessibilityRole="button"
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
                        <SymbolView name="plus.circle.fill" tintColor={C.accent} size={22} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }}>Add "{pickQ.trim()}" as your own dish</Text>
                          <Text style={{ color: C.text3, fontSize: 12 }}>Say or type what went in; the amounts are worked out for you{shown.length === 0 ? ' · no match in the list' : ''}</Text>
                        </View>
                      </Pressable>
                    )}
                    {shown.map((o, i) => {
                      const left = leftFor(o.kcal)
                      const head = !words.length && o.group && o.group !== shown[i - 1]?.group
                      return (
                        <View key={o.id}>
                          {head && <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, paddingTop: 12, paddingBottom: 2 }}>{o.group}</Text>}
                          <Pressable disabled={o.blocked} onPress={() => pick(o)} accessibilityRole="button"
                            accessibilityState={{ selected: o.id === choices.current, disabled: o.blocked }}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, opacity: o.blocked ? 0.4 : 1,
                              borderBottomWidth: i === shown.length - 1 ? 0 : 1, borderBottomColor: C.line }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: C.text, fontSize: 16, fontWeight: o.id === choices.current ? '700' : '500' }}>{o.label}</Text>
                              <Text style={{ color: C.text3, fontSize: 12 }}>
                                {[o.sub, o.blocked ? (o.why === 'egg' ? 'one egg meal a day, already had egg' : `too much for today's ${budget?.cap}`) : left != null ? `${left} left for the rest` : ''].filter(Boolean).join(' · ')}
                              </Text>
                            </View>
                            {o.id === choices.current && <SymbolView name="checkmark" tintColor={C.accent} size={16} />}
                          </Pressable>
                        </View>
                      )
                    })}
                      </ScrollView>
                    </View>
                  </Modal>
                )}
                {roleOf(m) === 'fat' && m.state === 'planned' && (() => {
                  const fat = FATS.find(f => m.items.some(i => i.name.toLowerCase() === f)) ?? 'ghee'
                  const vehicle = VEHICLES.find(v => m.name.toLowerCase().endsWith(v)) ?? VEHICLES[0]
                  const cap = (t: string) => t[0].toUpperCase() + t.slice(1)
                  const go = (f: string, v: string) => { Haptics.selectionAsync(); const b = build('fat', { fat: f, vehicle: v }); apply({ name: b.name, method: b.method, items: b.items }) }
                  return (
                    <View style={{ gap: 10 }}>
                      <View style={{ gap: 6 }}>
                        <Muted small>Fat (same calories, the grams change)</Muted>
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                          {FATS.map(f => <Chip key={f} title={f === fat ? `✓ ${cap(f)}` : cap(f)} onPress={() => go(f, vehicle)} />)}
                        </View>
                      </View>
                      <View style={{ gap: 6 }}>
                        <Muted small>Drink</Muted>
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                          {VEHICLES.map(v => <Chip key={v} title={v === vehicle ? `✓ ${cap(v.replace(' (no milk, no sugar)', ''))}` : cap(v.replace(' (no milk, no sugar)', ''))} onPress={() => go(fat, v)} />)}
                        </View>
                      </View>
                    </View>
                  )
                })()}
                {choices.second && roleOf(m) !== 'fat' && (
                  <View style={{ gap: 6 }}>
                    <Muted small>{choices.second.label}</Muted>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      {choices.second.options.filter(o => !o.blocked || o.id === `f:${choices.second!.current}`).map(o =>
                        <Chip key={o.id} title={o.id === `f:${choices.second!.current}` || o.id === choices.second!.current ? `✓ ${o.label}` : o.label} onPress={() => pick({ ...o, id: o.id === `f:${choices.second!.current}` ? '__same' : o.id })} />)}
                    </View>
                  </View>
                )}
              </Card>

              {asSaved.length > 0 && panAmounts ? (
                <Card>
                  <Label>{`Cook once, for ${asSaved.length + 1} meals`}</Label>
                  <Muted small>Cook this much, once. You eat it at {[slotAt(slot), ...asSaved.map(o => slotAt(o.slot))].sort().map(t => clock(t)).join(', ')}.</Muted>
                  {panAmounts.split(', ').map(l => <Text key={l} style={{ color: C.text, fontSize: 16, fontWeight: '600' }}>{l}</Text>)}
                </Card>
              ) : null}

              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Label>{asSaved.length > 0 ? `What you eat at ${clock(hm(time))}` : 'What goes in'}</Label>
                  <Pressable onPress={() => setEditing(v => !v)} hitSlop={8} accessibilityRole="button">
                    <Text style={{ color: C.accent, fontSize: 14, fontWeight: '600' }}>{editing ? 'Done' : 'Edit amounts'}</Text>
                  </Pressable>
                </View>
                {asSaved.length > 0 ? <Muted small>Your portion of the pan. The other {asSaved.length === 1 ? 'meal has its' : `${asSaved.length} meals have their`} own, listed above.</Muted> : null}
                {!editing && m.items.map((it, i) => {
                  const n = nutrition(it.name, it.grams, it.ml)
                  return (
                    <View key={`${i}-${it.name}`} style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text style={{ flex: 1, color: C.text, fontSize: 16 }}>{it.name}</Text>
                      <Text style={{ color: C.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{amountText(it)}</Text>
                      <Text style={{ width: 64, textAlign: 'right', color: C.text2, fontSize: 14, fontVariant: ['tabular-nums'] }}>{n ? `${n.kcal} kcal` : ''}</Text>
                      {OIL_NAMES.includes(it.name.toLowerCase()) && roleOf(m) !== 'fat' && (
                        <Pressable onPress={() => setSwapAt(swapAt === i ? null : i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Swap ${it.name} for another oil`}>
                          <Text style={{ color: C.accent, fontSize: 14, fontWeight: '600' }}>{swapAt === i ? 'Close' : 'Swap'}</Text>
                        </Pressable>
                      )}
                      <Pressable onPress={() => remove(i)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Leave out ${it.name}`}>
                        <Text style={{ color: C.text2, fontSize: 16 }}>✕</Text>
                      </Pressable>
                    </View>
                    {swapAt === i && (
                      <View style={{ gap: 6 }}>
                        <Muted small>Swap {it.name} for another oil. The grams change to keep the same calories.</Muted>
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                          {OIL_NAMES.filter(n => n !== it.name.toLowerCase()).map(n => <Chip key={n} title={`${n[0].toUpperCase()}${n.slice(1)} · ${swapGrams(it.name, n, it.grams) ?? ''} g`} onPress={() => { swapFood(i, n); setSwapAt(null) }} />)}
                        </View>
                      </View>
                    )}
                    </View>
                  )
                })}
                {!editing && m.items.length > 0 && <Muted small>Did not eat something? Tap ✕ to leave it out and the calories adjust.</Muted>}
                {left.map((it, j) => (
                  <View key={`left-${j}-${it.name}`} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ flex: 1, color: C.text2, fontSize: 15, textDecorationLine: 'line-through' }}>{it.name}</Text>
                    <Pressable onPress={() => putBack(j)} hitSlop={8} accessibilityRole="button"><Text style={{ color: C.accent, fontSize: 14, fontWeight: '600' }}>Put back</Text></Pressable>
                  </View>
                ))}
                {editing && <Muted small>Swipe an item left to remove it. Tap an amount to change it or swap the vegetable.</Muted>}
                {editing && (
                  <View style={{ marginHorizontal: -14, marginBottom: -14, borderRadius: 18, overflow: 'hidden' }}>
                    {m.items.map((it, i) => <ItemRow key={`${i}-${it.name}`} it={it} day={day} open={open === i} last={i === m.items.length - 1}
                      onToggle={() => setOpen(open === i ? null : i)} onChange={p => setItem(i, p)} onRemove={() => remove(i)} onSwap={name => swapFood(i, name)} />)}
                  </View>
                )}
              </Card>

              {m.state !== 'eaten' && !!T.kcalMax && m.items.length > 0 && (() => {
                // The whole pan: this meal and every meal that follows it, each at its portion. The aim and the answer are for the pan; this meal gets its share.
                const K = 1 + asSaved.reduce((t, o) => t + (members[o.slot]?.follow ? members[o.slot]!.k : 0), 0)
                const outside = dayTotals(others.filter(x => !asSaved.some(y => y.slot === x.slot)))
                const sh = dishShare([m, ...rawOthers], T.kcalMax)
                const other = Math.round(outside.kcal + outside.plannedKcal), room = Math.round(T.kcalMax - other)
                const pan = m.items.filter(i => i.name.trim()).map(i => ({ name: i.name, grams: i.grams == null ? null : i.grams * K, ml: i.ml == null ? null : i.ml * K }))
                return (
                  <AllowanceCard items={pan} share={1 / K}
                    aimDefault={sh ? sh.each * (1 + asSaved.length) : room > 0 ? room : Math.round(here.kcal * K)} aimWhy={sh ? `${1 + asSaved.length} dish ${asSaved.length ? 'meals' : 'meal'} at ${sh.each} kcal each` : room > 0 ? 'what is left of the day after the other meals' : 'the dish as it is'}
                    otherKcal={other} kcalMax={T.kcalMax} what={K > 1 ? 'the whole dish' : 'this meal'}
                    onUse={(name, panGrams) => {
                      Haptics.selectionAsync()
                      const mine = Math.round((panGrams / K) * 10) / 10, i = m.items.findIndex(x => x.name === name)
                      if (i >= 0) setItem(i, { grams: mine, ml: null }); else setM(x => ({ ...x, items: [...x.items, blank(name, mine, null)] }))
                    }} />
                )
              })()}

              {m.note ? (
                <Card>
                  <Label>How to cook it</Label>
                  <Text style={{ color: C.text, fontSize: 16, lineHeight: 23 }}>{recipeFor(m) ?? m.note}</Text>
                </Card>
              ) : null}

              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Muted small>Cooked at home</Muted>
                  <Switch value={m.cook} onValueChange={v => set({ cook: v })} />
                </View>
                <Pressable onPress={repeat} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <SymbolView name="repeat" tintColor={C.text2} size={15} />
                  <Text style={{ color: C.text2, fontSize: 15 }}>Repeat this meal on other days</Text>
                </Pressable>
              </Card>
            </>
          )
        })()}

        {/* Name BC (meals that are not one of the planned versions) */}
        {!choices && (
        <Card>
          <Field value={m.name} onChangeText={v => set({ name: v })} placeholder={m.items.length ? nameOf(m.items) : 'What will you eat? Paneer bhurji'}
            clearButtonMode="while-editing"
            style={{ width: '100%', fontSize: 18 }} autoCapitalize="sentences" returnKeyType="done" />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Muted small>Cooked at home</Muted>
            <Switch value={m.cook} onValueChange={v => set({ cook: v })} />
          </View>
          {!m.name.trim() && m.items.length > 0 && <Muted small>The name follows the foods below. Type one to set your own.</Muted>}
          {(m.name.trim() || m.items.length > 0) && (
            <Pressable onPress={repeat} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <SymbolView name="repeat" tintColor={C.text2} size={15} />
              <Text style={{ color: C.text2, fontSize: 15 }}>Repeat this meal on other days</Text>
            </Pressable>
          )}
          {m.note ? <Muted small>{m.note}</Muted> : null}
        </Card>
        )}

        {/* Add Food BC: ate something else, by typing, voice, barcode or photo */}
        <Card>
          {choices && <Label>Ate something else?</Label>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.raised, borderRadius: 12, paddingHorizontal: 10 }}>
            <SymbolView name="magnifyingglass" tintColor={C.text3} size={16} />
            <TextInput ref={search} value={text} onChangeText={setText} placeholder="Add a food" placeholderTextColor={C.text3}
              style={{ flex: 1, minHeight: 44, color: C.text, fontSize: 16 }} autoCorrect={false} spellCheck={false} autoCapitalize="none"
              returnKeyType="done" onSubmitEditing={() => q && add(results[0] ?? text.trim())} />
            <Pressable onPress={dictate} hitSlop={8} accessibilityRole="button" accessibilityLabel={listening ? 'Stop listening' : 'Say what you ate'}>
              <SymbolView name={listening ? 'mic.fill' : 'mic'} tintColor={listening ? C.caution : C.text2} size={21} />
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/scan', params: { day } })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Scan a barcode">
              <SymbolView name="barcode.viewfinder" tintColor={C.text2} size={22} />
            </Pressable>
            {visionReady() && <Pressable onPress={camera} hitSlop={8} accessibilityRole="button" accessibilityLabel="Read a photo">
              <SymbolView name="camera" tintColor={C.text2} size={21} />
            </Pressable>}
          </View>
          {q.length < 2 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {before && !m.items.length && <Chip title={`Same as ${at(before.day, '12:00').toLocaleDateString('en-IN', { weekday: 'short' })}`}
                onPress={() => setM(x => ({ ...x, name: x.name || before.name, items: before.items.map(i => ({ ...i, id: undefined, p: null, kcal: null, source: null, at: null })) }))} />}
              {chips.map(n => <Chip key={n} title={n.length > 22 ? `${n.slice(0, 21)}…` : n} onPress={() => add(n)} />)}
            </View>
          ) : (
            <View>
              {results.map(n => (
                <Pressable key={n} onPress={() => add(n)} style={({ pressed }) => ({ paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
                  <Text style={{ color: C.text, fontSize: 15 }}>{n}</Text>
                </Pressable>
              ))}
              {!results.some(n => n.toLowerCase() === q) && (
                <Pressable onPress={() => add(text.trim())} style={{ paddingVertical: 8 }}>
                  <Text style={{ color: C.text2, fontSize: 15 }}>Add "{text.trim()}" as typed</Text>
                </Pressable>
              )}
            </View>
          )}
          {busy && <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ActivityIndicator /><Muted small>Reading the photo. The first one after a quiet spell takes about 30 seconds.</Muted></View>}
          {error ? <Text style={{ color: C.caution, fontSize: 14 }}>{error}</Text> : null}
        </Card>

        {label && (
          <Card>
            <Label>{label.product || 'The label'}</Label>
            {!label.ingredients.length && <Muted small>No ingredients could be read, so this is unknown, not allowed.</Muted>}
            {label.ingredients.map(g => {
              const b = ruleBadge(verdictOn(day, g))
              return <Text key={g} style={{ color: b ? C.caution : C.text, fontSize: 14 }}>{g}{b ? ` · ${b.text}` : ''}</Text>
            })}
            {labelNums
              ? <Muted small>{`${label.nutrition.protein} g protein and ${label.nutrition.kcal} kcal in ${label.nutrition.amount} ${label.nutrition.unit}. Adding it saves these numbers.`}</Muted>
              : <Muted small>No nutrition table could be read. After adding it, tap "Add the numbers from the label" to type them in.</Muted>}
            {label.product ? <Chip title={`Add ${label.product}`} onPress={() => {
              if (labelNums) saveCustomFood({ name: label.product, ...labelNums, source: 'label', ingredients: label.ingredients.join(', ') })
              // A per-scoop or per-serving column also gives a sensible first amount.
              const serving = label.nutrition.amount && label.nutrition.amount !== 100 ? label.nutrition.amount : undefined
              add(label.product, serving, label.nutrition.unit === 'ml'); setLabel(null)
            }} /> : null}
          </Card>
        )}

        {/* Item Row BC */}
        {m.items.length > 0 && !choices && (
          <View style={{ backgroundColor: C.card, borderRadius: 18, overflow: 'hidden' }}>
            {m.items.map((it, i) => <ItemRow key={`${i}-${it.name}`} it={it} day={day} open={open === i} last={i === m.items.length - 1}
              onToggle={() => setOpen(open === i ? null : i)} onChange={p => setItem(i, p)} onRemove={() => remove(i)} onSwap={name => swapFood(i, name)} />)}
          </View>
        )}
        {m.items.length > 0 && !choices && <Muted small>Swipe an item left to remove it. Tap an amount to change it or swap the vegetable.</Muted>}

        {/* Suggestion BC */}
        {idea && (
          <Card>
            <Muted small>A meal that fits the plan and the rest of the day:</Muted>
            <Text style={{ color: C.text, fontSize: 15 }}>{idea.items.map(x => `${x.name} ${amountLabel(x.name, x.grams)}`).join(', ')}</Text>
            <Chip title="Use this" onPress={() => setM(x => ({ ...x, name: x.name || nameOf(idea.items), items: idea.items.map(i => blank(i.name, i.grams)) }))} />
          </Card>
        )}

        {saved && <Pressable onPress={() => Alert.alert('Clear this meal?', 'Its name and food are removed.', [
          { text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => { deleteMeal(day, slot); router.back() } }])}>
          <Text style={{ color: C.text3, fontSize: 14, textAlign: 'center', paddingVertical: 8 }}>Clear this meal</Text>
        </Pressable>}
      </ScrollView>

      {/* Totals Bar BC and Action BC, pinned */}
      <View style={{ borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 30, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{bar.line}</Text>
            <Text style={{ color: C.text2, fontSize: 12 }}>{bar.day}</Text>
          </View>
          {showsTime(m.state, when, extra) && <DateTimePicker value={time} mode="time" display="compact" onChange={(_, d) => { if (d) { setTime(d); setTimeSet(true) } }} />}
        </View>
        {bar.warn.map(w => <Text key={w} style={{ color: C.caution, fontSize: 13 }}>{w}</Text>)}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {act.primary.map(a => (
            <View key={a} style={{ flex: 1 }}>
              {a === 'save-plan' && <Button title="Save plan" onPress={() => save('planned')} disabled={!m.name.trim() && !m.items.length} />}
              {a === 'eaten' && <Button title="Eaten" kind="primary" onPress={() => save('eaten')} />}
              {a === 'save' && <Button title="Save" kind="primary" onPress={() => save('eaten')} />}
            </View>
          ))}
        </View>
        <Pressable onPress={() => save(act.link === 'back-to-planned' || act.link === 'unskip' ? 'planned' : 'skipped')} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: C.text2, fontSize: 14, textAlign: 'center' }}>
            {act.link === 'skip' ? 'Skip this meal' : act.link === 'unskip' ? 'Undo skip' : 'Move back to planned'}
          </Text>
        </Pressable>
      </View>
    </GestureHandlerRootView>
  )
}

/** One food on one line: name and numbers, the amount, the rule badge. Tap the amount for the picker; swipe left to remove. */
/** An amount typed by hand, with a decimal point ("2.5 g"). The text is kept as typed, so "2." does not lose its dot. */
function AmountInput({ value, unit, onValue, onDone }: { value: number | null | undefined; unit: string; onValue: (v: number | null) => void; onDone: () => void }) {
  const [t, setT] = useState(value == null ? '' : String(value))
  return <Field value={t} placeholder="Amount" keyboardType="decimal-pad" unit={unit} width={90} autoFocus returnKeyType="done" onSubmitEditing={onDone}
    onChangeText={x => {
      const c = x.replace(',', '.').replace(/[^\d.]/g, ''), parts = c.split('.')
      const clean = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('')}` : c
      setT(clean)
      const n = clean === '' ? null : Number(clean)
      onValue(n == null ? null : Number.isFinite(n) ? n : 0)
    }} />
}

function ItemRow({ it, day, open, last, onToggle, onChange, onRemove, onSwap }: {
  it: MealItem; day: string; open: boolean; last: boolean
  onToggle: () => void; onChange: (p: Partial<MealItem>) => void; onRemove: () => void; onSwap: (name: string) => void
}) {
  const a = amountMode(it)
  const n = nutrition(it.name, it.grams, it.ml)
  const note = sourceNote(it)
  const badge = ruleBadge(verdictOn(day, it.name))
  const empty = amountText(it) === 'add amount'
  const [fix, setFix] = useState(false)
  // Unknown or guessed numbers always offer the label; known ones offer it once the row is open.
  const doubtful = !n || note === 'A guess from the name'
  return (
    <ReanimatedSwipeable friction={2} rightThreshold={60} overshootRight={false}
      renderRightActions={() => (
        <Pressable onPress={onRemove} style={{ width: 88, backgroundColor: C.negative, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`Remove ${it.name}`}>
          <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Remove</Text>
        </Pressable>
      )}
      onSwipeableOpen={dir => { if (dir === 'left' || dir === 'right') onRemove() }}>
      <View style={{ backgroundColor: C.card, paddingHorizontal: 14, paddingVertical: 10, gap: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }} numberOfLines={2}>{it.name}</Text>
            <Text style={{ color: C.text3, fontSize: 12 }}>{[n ? `${n.p} g protein · ${n.kcal} kcal` : null, note].filter(Boolean).join(' · ')}</Text>
          </View>
          <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={`Amount: ${amountText(it)}`}
            style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: empty ? C.accent : C.raised }}>
            <Text style={{ color: empty ? C.accentText : C.text, fontWeight: '600', fontSize: 14, fontVariant: ['tabular-nums'] }}>{amountText(it)}</Text>
          </Pressable>
          <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel={`Remove ${it.name}`}><Text style={{ color: C.text3, fontSize: 15 }}>✕</Text></Pressable>
        </View>
        {badge && <Pressable onPress={() => Alert.alert(badge.text, badge.why)}>
          <Text style={{ color: badge.tone === 'amber' ? C.caution : C.text2, fontSize: 13 }}>{badge.text}</Text>
        </Pressable>}
        {open && (a.mode === 'count' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Chip title="−" onPress={() => onChange({ grams: Math.max(0, a.n - 1) * a.each })} />
            <Text style={{ color: C.text, fontSize: 17, fontWeight: '600' }}>{a.n} {a.n === 1 ? a.one : a.many}</Text>
            <Chip title="+" onPress={() => onChange({ grams: (a.n + 1) * a.each })} />
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {PICKS[a.mode].map(([l, v]) => <Chip key={l} title={a.value === v ? `✓ ${l}` : l}
                onPress={() => { onChange(a.mode === 'ml' ? { ml: v, grams: null } : { grams: v }); onToggle() }} />)}
            </View>
            <AmountInput value={a.value} unit={a.mode === 'ml' ? 'ml' : 'g'}
              onValue={v => onChange(a.mode === 'ml' ? { ml: v, grams: null } : { grams: v })} onDone={onToggle} />
          </View>
        ))}
        {open && substitutes(it.name).length > 0 && (
          <View style={{ gap: 6 }}>
            <Muted small>Not available? Swap {it.name} for:</Muted>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {substitutes(it.name).map(n => <Chip key={n} title={n} onPress={() => { onSwap(n); onToggle() }} />)}
            </View>
          </View>
        )}
        {!fix && (doubtful || open) && (
          <Pressable onPress={() => setFix(true)} accessibilityRole="button" hitSlop={6}>
            <Text style={{ color: C.text2, fontSize: 13 }}>{doubtful ? 'Add the numbers from the label' : 'Numbers wrong? Use the label\'s'}</Text>
          </Pressable>
        )}
        {fix && <LabelNumbers it={it} onDone={serving => {
          setFix(false)
          // Numbers for a scoop or serving make that the amount; per-100 numbers keep his.
          if (serving === undefined) return
          onChange(serving == null ? {} : a.mode === 'ml' ? { ml: serving, grams: null } : { grams: serving })
        }} />}
      </View>
    </ReanimatedSwipeable>
  )
}

/** The protein and calories printed on a packet, for any amount (per 100 g, or
 *  per scoop or serving), saved as this food's own numbers. They count from
 *  then on, here and on every later day. Past eaten meals keep theirs. */
function LabelNumbers({ it, onDone }: { it: MealItem; onDone: (serving?: number | null) => void }) {
  const unit = amountMode(it).mode === 'ml' ? 'ml' : 'g'
  const [p, setP] = useState('')
  const [k, setK] = useState('')
  const [amt, setAmt] = useState('100')
  const num = (t: string) => t.trim() ? Number(t.replace(',', '.')) : null
  const nums = per100({ amount: num(amt), protein: num(p), kcal: num(k) })
  const save = () => {
    if (!nums) return
    saveCustomFood({ name: it.name, ...nums, source: 'you' })
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    // Saved: hands back the scoop or serving size, or null for per-100 numbers.
    onDone(num(amt) === 100 ? null : num(amt))
  }
  return (
    <View style={{ gap: 8 }}>
      <Muted small>Copy them from the packet. Per 100 g or per scoop both work: change 100 to the scoop size if that is what the label gives.</Muted>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: C.text2, fontSize: 15 }}>In</Text>
        <Field value={amt} onChangeText={setAmt} placeholder="100" keyboardType="decimal-pad" unit={`${unit}, the label says:`} width={70} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Field value={p} onChangeText={setP} placeholder="0" keyboardType="decimal-pad" unit="g protein" width={70} autoFocus />
        <Field value={k} onChangeText={setK} placeholder="0" keyboardType="decimal-pad" unit="kcal" width={70} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Button title="Save numbers" kind="primary" onPress={save} disabled={!nums} /></View>
        <View style={{ flex: 1 }}><Button title="Cancel" onPress={() => onDone()} /></View>
      </View>
    </View>
  )
}
