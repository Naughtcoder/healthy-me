// What the home and lock screen widgets show, and what Siri and the widget
// buttons did while the app was closed. Both live in an App Group, a small
// shared store the app and its extensions can all read and write.
//
// today    (app writes)     the next things due, water, meals, protein, phase
// summary  (app writes)     the day as plain text, for the "Today's summary" Shortcut
// queue    (Siri, widget)   water added and weights logged, each with its own
//                           id, day and time, applied once on next open
import { ExtensionStorage } from '@bacons/apple-targets'
import { addDays, at, medOn, minutes, SLOT_NAME, SLOTS, hm, ymd, type Slot } from './core'
import { dayRows, slotTime } from './builder'
import { dayTotals } from './meals'
import { summaryText } from './summary'
import { addWater, dosesOn, emptyMeal, getMeta, mealAt, mealsOn, meds, medsOn, onChange, phaseOn, plan, programmeDayOn, putMeal, setDose, setMeta, setMealState, setWeight, targetsOn, waterOn, weights } from './db'
import { parseSpoken } from './spoken'

export const APP_GROUP = 'group.in.morgan.diet'
let store: ExtensionStorage | null = null
try { store = new ExtensionStorage(APP_GROUP) } catch { store = null }

const epoch = (day: string, time: string) => Math.round(+at(day, time) / 1000)

/** Planned meals and open doses for a day, as widget events. */
function due(day: string) {
  const out: { t: number; title: string; detail: string }[] = []
  for (const m of mealsOn(day)) if (m.state === 'planned' && ['breakfast', 'lunch', 'dinner'].includes(m.slot) && (m.name || m.items.length))
    out.push({ t: epoch(day, slotTime(plan, m.slot)), title: SLOT_NAME[m.slot], detail: m.name || m.items.map(i => i.name).slice(0, 3).join(', ') })
  const doses = dosesOn(day)
  for (const m of medsOn(day)) for (const time of m.times)
    if (!doses.some(d => d.med_id === m.id && d.time === time)) out.push({ t: epoch(day, time), title: m.name, detail: m.dose })
  return out.sort((a, b) => a.t - b.t)
}

/** Writes today's picture for the widgets and asks iOS to redraw them.
 *  Protein counts eaten food only. */
export function syncWidget() {
  if (!store) return
  try {
    const today = ymd(new Date())
    const t = dayTotals(mealsOn(today))
    const doses = dosesOn(today)
    const dosesDue = medsOn(today).reduce((n, m) => n + m.times.length, 0)
    store.set('today', JSON.stringify({
      date: today, phase: phaseOn(today).name,
      open: epoch(today, plan.window.open), close: epoch(today, plan.window.close), cutoff: epoch(today, plan.window.carbCutoff),
      openTomorrow: epoch(addDays(today, 1), plan.window.open),
      water: waterOn(today), waterTarget: plan.waterTargetMl,
      meals: t.mainsEaten,
      doses: doses.filter(d => d.status === 'taken').length, dosesDue,
      protein: t.p, proteinTarget: targetsOn(today).proteinG,
      events: [...due(today), ...due(addDays(today, 1))].filter(e => e.t > Date.now() / 1000 - 1800).slice(0, 12),
    }))
    ExtensionStorage.reloadWidget()
  } catch { /* widgets are a convenience; never block the app on them */ }
  syncSummary()
}

/** Writes the plain-text day for the "Today's summary" Shortcut. Kept apart
 *  from the widget data so a fault in one never stops the other. */
function syncSummary() {
  if (!store) return
  try {
    const today = ymd(new Date())
    const all = weights()
    const last = [...all].reverse().find(w => w.day <= today) ?? null
    const kg = new Map(all.map(w => [w.day, w.kg]))
    const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map(day => {
      const t = dayTotals(mealsOn(day))
      return { day, kg: kg.get(day) ?? null, kcal: t.kcal, p: t.p, water: waterOn(day) }
    })
    store.set('summary', summaryText({
      now: new Date(), today, phase: phaseOn(today).name, programmeDay: programmeDayOn(today),
      meals: dayRows(plan, mealsOn(today)).flatMap(r => r.meal ? [r.meal] : []), water: waterOn(today), waterTarget: plan.waterTargetMl,
      weight: last ? { day: last.day, kg: last.kg } : null,
      meds: meds(), doses: dosesOn(today), week,
    }))
  } catch { /* the summary is a convenience too */ }
}

type Queued = { id?: string; day?: string; at?: string } & ({ kind: 'water'; ml: number } | { kind: 'weight'; kg: number } | { kind: 'meal'; slot: string } | { kind: 'voice'; ts: number } | { kind: 'meds' } | { kind: 'ate'; slot: string } | { kind: 'food'; text: string })

/** Applies what Siri and the widget buttons recorded while the app was closed.
 *  Each action applies once (its id is remembered), and only applied actions
 *  are taken off the queue, so a crash part-way loses nothing. Actions from
 *  before ids existed have no day and land on today, as they always did. */
let voiceAsked = false
/** True once if Siri's "log a meal" ran in the last two minutes. */
export function takeVoiceRequest() { const v = voiceAsked; voiceAsked = false; return v }
/** The daily meal whose time is closest to now. */
export function nearestSlot(now = new Date()): Slot {
  const n = minutes(hm(now))
  return SLOTS.reduce((a, b) => Math.abs(minutes(slotTime(plan, b)) - n) < Math.abs(minutes(slotTime(plan, a)) - n) ? b : a)
}

const SLOT_IDS: Slot[] = ['breakfast', 'snack1', 'lunch', 'snack2', 'dinner', 'snack3', 'snack4', 'snack5', 'snack6', 'snack7', 'snack8']
const nowAt = () => hm(new Date())

/** "I took my medicines": every dose due by then that is not yet logged is taken. */
function takeDueMeds(day: string, time = nowAt()) {
  const logged = dosesOn(day)
  for (const m of medsOn(day)) for (const t of m.times)
    if (t <= time && !logged.some(d => d.med_id === m.id && d.time === t)) setDose(day, m.id, t, 'taken')
}
/** "I ate my 12 pm meal": the planned meal in that slot is marked eaten at that time. */
function ateMeal(day: string, slot: string, time = nowAt()) {
  const s = SLOT_IDS.find(x => x === slot)
  if (s && mealAt(day, s)?.state !== 'eaten') setMealState(day, s, 'eaten', time)
}
/** "Log what I ate": the sentence becomes foods in the nearest meal, which is marked eaten. */
function logSpoken(day: string, text: string, time = nowAt()) {
  const items = parseSpoken(text).map(f => ({ name: f.name, grams: f.grams, ml: f.ml, at: null, p: null, kcal: null, source: null }))
  const slot = nearestSlot(at(day, time))
  const m = mealAt(day, slot) ?? emptyMeal(day, slot)
  if (m.state === 'eaten') putMeal({ ...m, items: [...m.items, ...items], name: m.name || text })
  else putMeal({ ...m, state: 'eaten', eatenAt: time, origin: 'you', name: items.length ? '' : text, note: null, items })
}

export function drainQueue() {
  if (!store) return 0
  const read = (): Queued[] => { try { return JSON.parse(store!.get('queue') ?? '[]') } catch { return [] } }
  const items = read()
  if (!items.length) return 0
  const seen = new Set<string>(JSON.parse(getMeta('queue_seen') ?? '[]'))
  const today = ymd(new Date())
  const done: Queued[] = []
  for (const q of items) {
    if (q.id && seen.has(q.id)) { done.push(q); continue }
    const day = q.day ?? today
    if (q.kind === 'water' && q.ml > 0) addWater(day, q.ml)
    else if (q.kind === 'weight' && q.kg > 30 && q.kg < 250) setWeight(day, Math.round(q.kg * 10) / 10)
    else if (q.kind === 'voice' && Date.now() / 1000 - q.ts < 120) voiceAsked = true
    else if (q.kind === 'meds') takeDueMeds(day, q.at)
    else if (q.kind === 'ate') ateMeal(day, q.slot, q.at)
    else if (q.kind === 'food') logSpoken(day, q.text, q.at)
    // Old "meal as planned" actions from Siri: only the id is remembered; meals are logged in the app now.
    if (q.id) seen.add(q.id)
    done.push(q)
  }
  setMeta('queue_seen', JSON.stringify([...seen].slice(-200)))
  // Re-read so anything added while this ran stays queued.
  const left = read().filter(q => !done.some(d => d === q || (d.id && d.id === q.id) || (!d.id && !q.id && JSON.stringify(d) === JSON.stringify(q))))
  if (left.length) store.set('queue', JSON.stringify(left)); else store.remove('queue')
  return done.length
}

/** Keeps the widgets current: after any change in the app, at most every 2 seconds. */
let timer: ReturnType<typeof setTimeout> | null = null
onChange(() => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(syncWidget, 2000)
})
