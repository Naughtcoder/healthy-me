// The rules of the day, with no React and no phone APIs in them, so
// `node --test` can check them. Screens and alarms both build on these.
import { FOOD_RECIPES } from './foods.ts'

export type PlanItem = [name: string, grams: number]
export type PlanDay = {
  day: number; date: string
  breakfast: PlanItem[]; lunch: PlanItem[]; dinner: PlanItem[]
  note?: string; trial?: string; sunday?: boolean
}
/** One raw ingredient: name, amount, unit, and 'sprout' when it is a dry legume to soak and sprout. */
export type RawItem = [name: string, qty: number, unit: string, flag?: 'sprout']
/** How a planned dish is made: raw amounts for `per` grams cooked. Overnight dishes are set up the night before. */
export type Recipe = { per: number; raw: RawItem[]; overnight?: boolean }
export type SnackOption = { name: string; grams?: number; ml?: number }
export type RoutineStep = { id: string; time: string; title: string; detail: string; waterMl?: number }
export type Plan = {
  phase: string; phaseName: string; start: string; end: string
  window: { open: string; close: string; carbCutoff: string }
  waterTargetMl: number
  routine: RoutineStep[]
  snacks: Record<'morning' | 'evening', { time: string; options: SnackOption[] }>
  days: PlanDay[]
  recipes: Record<string, Recipe>
  prepTimes: { morning: string; evening: string; soak: string; drain: string }
  /** What a balanced day looks like in this phase. the coach sets the rules; these numbers are a guide unless `kcalMax` is set by them. */
  targets?: { proteinG: number; vegG: number; carbMeals: number; kcalMax?: number | null }
}
export type Med = {
  id: string; name: string; dose: string; times: string[]
  withFood?: string; start: string; end?: string | null; note?: string; about?: string; active: boolean
  /** Taken every this many days from the start: 1 daily (the default), 7 weekly. */
  every?: number
  /** What is in it, as "Coenzyme Q10 (100mg) + Levo-carnitine (1000mg)". */
  contains?: string
}

export type Slot = 'breakfast' | 'snack1' | 'lunch' | 'snack2' | 'dinner' | 'snack3' | 'snack4' | 'snack5' | 'snack6' | 'snack7' | 'snack8'
/** The five meals every day has a row for, in order. */
export const SLOTS: Slot[] = ['breakfast', 'snack1', 'lunch', 'snack2', 'dinner']
/** More snacks, added only when wanted (a third shake, a late snack), each at a time of its own. */
export const EXTRA_SNACKS: Slot[] = ['snack3', 'snack4', 'snack5', 'snack6', 'snack7', 'snack8']
export const isExtra = (s: Slot) => EXTRA_SNACKS.includes(s)
export const SLOT_NAME: Record<Slot, string> = {
  breakfast: 'Breakfast', snack1: 'Morning snack', lunch: 'Lunch', snack2: 'Evening snack', dinner: 'Dinner',
  snack3: 'Snack', snack4: 'Snack', snack5: 'Snack', snack6: 'Snack', snack7: 'Snack', snack8: 'Snack',
}

/** One thing on the day's timeline: a meal, a routine step, or a dose. */
export type DayEvent = {
  key: string; time: string; kind: 'meal' | 'routine' | 'med'
  title: string; detail?: string
  slot?: Slot; items?: { name: string; grams?: number; ml?: number; amount?: string }[]
  medId?: string
}

// ---- dates, always in the phone's local time --------------------------------

const pad = (n: number) => String(n).padStart(2, '0')
/** 2026-10-22 for a Date, in local time. */
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** 09:30 for a Date, in local time. */
export const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
/** The local Date for a day and a HH:MM time. */
export function at(day: string, time: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  return new Date(y, m - 1, d, h, mi, 0, 0)
}
export const addDays = (day: string, n: number) => {
  const d = at(day, '12:00'); d.setDate(d.getDate() + n); return ymd(d)
}
export const minutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m }
/** 9:30 am, the way the screens show a time. */
export function clock(time: string) {
  const [h, m] = time.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`
}

// ---- the plan -----------------------------------------------------------------

export const planDay = (plan: Plan, day: string) => plan.days.find(d => d.date === day)

/** A change made ahead of time to one meal: eaten at the office or out (so
 *  nothing is cooked for it), swapped for that meal from another plan day, or
 *  built from the food library. */
export type Override = { mode: 'office' | 'out' | 'dish' | 'custom'; from?: string; items?: PlanItem[] }
export type Overrides = Record<string, Override>          // key: `${day}|${slot}`
export const NO_OV: Overrides = {}
type MainSlot = 'breakfast' | 'lunch' | 'dinner'

/** The plan day with any overrides applied. Office and eating-out meals become
 *  empty, so no prep is scheduled for them. */
export function effectiveDay(plan: Plan, day: string, ov: Overrides = NO_OV): PlanDay | undefined {
  const p = planDay(plan, day)
  if (!p) return p
  const out: PlanDay = { ...p }
  for (const slot of ['breakfast', 'lunch', 'dinner'] as MainSlot[]) {
    const o = ov[`${day}|${slot}`]
    if (!o) continue
    if (o.mode === 'dish') { const src = o.from && planDay(plan, o.from); if (src) out[slot] = src[slot] }
    else if (o.mode === 'custom') out[slot] = o.items ?? []
    else out[slot] = []
  }
  return out
}

/** Every distinct dish set the plan has for a slot, for "pick another dish". */
export function dishChoices(plan: Plan, slot: MainSlot) {
  const seen = new Set<string>()
  return plan.days.filter(d => {
    const k = d[slot].map(([n]) => n).join('|')
    if (seen.has(k) || d[slot].some(([, g]) => !g)) return false
    seen.add(k); return true
  }).map(d => ({ from: d.date, items: d[slot] }))
}

/** What is fine to eat when the meal is not from home. */
export const OFFICE_SAFE = {
  yes: ['Rice, curd rice or lemon rice', 'Rasam without dal', 'Dry vegetable curry or sabzi', 'Curd or buttermilk', 'Paneer, boiled egg whites', 'Salad, sprouts'],
  no: ['Sambar, dal, chole, rajma that is not sprouted', 'Chapati, naan, paratha, bread', 'Dosa, idli, vada (urad dal)', 'Anything fried in batter, sweets, packaged snacks'],
}

/** the coach's clean-eating rules as word checks. Each hit names the rule it breaks.
 *  "no dal", "without peanuts" and sprouted legumes are not hits. */
const RULES: [RegExp, string][] = [
  [/\b(wheat|atta|maida|rava|sooji|semolina|chapat?h?i|rotis?|phulkas?|paratha|naan|puri|bread|pasta|noodles?|maggi|yippee|ramen|biscuits?)\b/i, 'Wheat (gluten)'],
  [/\b(milk|milk tea|chai|coffee with milk)\b/i, 'Milk'],
  [/\b(sugar|jaggery|honey|stevia|monk ?fruit|sucralose|aspartame|syrup|sweets?(?! potato)|dessert|chocolate|cake|ice ?cream|halwa|payasam|kheer)\b/i, 'Sugar'],
  [/\b(apple|banana|mango|orange|grapes?|papaya|pineapple|watermelon|melon|chikoo|guava|pomegranate|cherr(?:y|ies)|fruit)\b/i, 'Fruit (only berries are allowed)'],
  [/\b(dates|raisins?|apricots?|figs?|dry fruits?)\b/i, 'Dry fruit'],
  [/\b(dal|daal|sambar|lentils?|toor|urad|masoor|chole|chana dal|rajma|chickpeas?|kidney beans)\b/i, 'Dal or lentils that are not sprouted'],
  [/\b(idli|dosa|vada|uttapam)\b/i, 'Urad dal batter'],
  [/\b(soy|soya|tofu)\b/i, 'Soy'],
  [/\b(corn|maize|cornflour)\b/i, 'Corn'],
  [/\b(peanuts?|groundnuts?|cashews?)\b/i, 'Peanuts or cashews'],
  [/\b(yolk|whole eggs?|omelett?e)\b/i, 'Egg yolk'],
  [/\b(chips|namkeen|packaged|instant|maggi|yippee|ramen|kurkure|lays)\b/i, 'Packaged food'],
  [/\b(tender coconut|coconut water)\b/i, 'Tender coconut'],
  [/\b(refined oil|vegetable oil|palm oil|palmolein|palm fat|vanaspati|dalda|sunflower oil|soybean oil|rice bran oil|canola oil|margarine)\b/i, 'Refined or palm oil'],
  [/\b(alcohol|beer|wine|whisk(?:e)?y|vodka|rum|gin|brandy|cocktail)\b/i, 'Alcohol'],
]
/** What this person eats. Set from their profile at start-up. Meat is 'ask'
 *  for a non-vegetarian on the coach until their coach confirms it for the phase. */
export const DIET = { meat: 'no' as 'no' | 'ask' | 'yes' }
export const setMeat = (m: 'no' | 'ask' | 'yes') => { DIET.meat = m }
const MEAT = /\b(chicken|fish|mutton|lamb|goat|prawns?|shrimps?|crab|seafood|meat|keema|kebab|tandoori chicken|beef|pork|bacon|sausages?|salmon|tuna)\b/i

const ALLOWED_DOSA = /\b(ragi|neer|rice|moong|pesarattu|jowar|millet|sprouted)\b/i
export function ruleBreaks(name: string): string[] {
  // Drop negated phrases first: "without peanuts", "no dal", "no cornflour".
  const n = name.replace(/\b(no|without|minus|zero)\s+[a-z]+(\s+[a-z]+)?/gi, ' ')
  const hits: string[] = []
  for (const [re, why] of RULES) {
    if (!re.test(n)) continue
    if (why.startsWith('Dal') && /sprout/i.test(n)) continue
    if (why === 'Urad dal batter' && ALLOWED_DOSA.test(n)) continue
    if (why === 'Milk' && /\b(almond|coconut|oat|butter)\s*milk\b|buttermilk/i.test(n) && !/\b(cow|buffalo|dairy|plain)\s+milk\b/i.test(n)) continue
    if (why === 'Egg yolk' && /\bwhites?\b/i.test(n) && !/\byolk\b/i.test(n)) continue
    if (why.startsWith('Wheat') && /\b(jowar|bajra|ragi|millet|buckwheat)\b/i.test(n) && !/\b(wheat|atta|maida)\b/i.test(n.replace(/buckwheat/gi, ''))) continue
    hits.push(why)
  }
  if (MEAT.test(n) && DIET.meat !== 'yes') hits.push(DIET.meat === 'ask' ? 'Meat or fish: ask your coach first' : 'Meat or fish (set as vegetarian)')
  return hits
}

/** Carbs end at 6 pm. These words mark a food as a carb so a late log is flagged. */
const CARB_WORDS = ['rice', 'quinoa', 'roti', 'oats', 'poha', 'dosa', 'pesarattu', 'appam', 'upma',
  'millet', 'ragi', 'jowar', 'bajra', 'idiyappam', 'puttu', 'sabudana', 'potato', 'pongal', 'buckwheat']
export const isCarb = (name: string) => {
  const n = name.toLowerCase()
  return CARB_WORDS.some(w => n.includes(w))
}

/** A med counts on a day when it is switched on and the day falls inside its dates. */
export const medOn = (m: Med, day: string) => m.active && m.start <= day && (!m.end || day <= m.end)
  && (!m.every || m.every <= 1 || Math.round((+at(day, '12:00') - +at(m.start, '12:00')) / 86_400_000) % m.every === 0)

/** The Meds tab's three lists, shared with the summary so the two never disagree.
 *  Stopped: switched off or past its end date. Starting later: in date order. */
export function medGroups(all: Med[], today: string) {
  const stopped = all.filter(m => !m.active || (!!m.end && m.end < today))
  const later = all.filter(m => !stopped.includes(m) && m.start > today).sort((a, b) => a.start.localeCompare(b.start))
  const now = all.filter(m => !stopped.includes(m) && !later.includes(m))
  return { now, later, stopped }
}

/** Everything on one day, in time order: routine steps, meals, snacks and doses. */
export function eventsFor(plan: Plan, meds: Med[], day: string, ov: Overrides = NO_OV): DayEvent[] {
  const out: DayEvent[] = [...prepFor(plan, day, ov)]
  const p = effectiveDay(plan, day, ov)
  if (p) {
    for (const r of plan.routine) out.push({ key: `r:${r.id}`, time: r.time, kind: 'routine', title: r.title, detail: r.detail })
    const meal = (slot: Slot, time: string, items: PlanItem[]) => {
      const o = ov[`${day}|${slot}`]
      if (o && (o.mode === 'office' || o.mode === 'out'))
        return out.push({ key: `m:${slot}`, time, kind: 'meal', slot, title: `${SLOT_NAME[slot]} · ${o.mode === 'office' ? 'at the office' : 'eating out'}`,
          detail: `Pick from: ${OFFICE_SAFE.yes.join(', ')}.`, items: [] })
      out.push({ key: `m:${slot}`, time, kind: 'meal', slot, title: o ? `${SLOT_NAME[slot]} · ${o.mode === 'custom' ? 'your build' : 'swapped'}` : SLOT_NAME[slot],
        items: items.map(([name, grams]) => ({ name, grams: grams || undefined })) })
    }
    meal('breakfast', plan.window.open, p.breakfast)
    out.push({ key: 'm:snack1', time: plan.snacks.morning.time, kind: 'meal', slot: 'snack1', title: SLOT_NAME.snack1,
      detail: 'If hungry. Pick one.', items: plan.snacks.morning.options })
    meal('lunch', '13:30', p.lunch)
    out.push({ key: 'm:snack2', time: plan.snacks.evening.time, kind: 'meal', slot: 'snack2', title: SLOT_NAME.snack2,
      detail: 'If hungry. Pick one.', items: plan.snacks.evening.options })
    meal('dinner', '20:15', p.dinner)
    if (p.sunday) out.push({ key: 'r:measure', time: '08:00', kind: 'routine', title: 'Measurements', detail: 'Chest, waist and hip, before breakfast.' })
  }
  for (const m of meds) if (medOn(m, day)) for (const t of m.times)
    out.push({ key: `d:${m.id}:${t}`, time: t, kind: 'med', medId: m.id, title: m.name,
      detail: [boxRow(m.id, t), m.dose, m.withFood].filter(Boolean).join(', ') })
  // Water checks sit beside snacks at the same minute; keep meals first at a tie.
  const rank = { med: 0, meal: 1, routine: 2 } as const
  return out.sort((a, b) => minutes(a.time) - minutes(b.time) || rank[a.kind] - rank[b.kind])
}

// ---- kitchen prep ---------------------------------------------------------------

type Need = { name: string; qty: number; unit: string; sprout: boolean }

/** The raw ingredients behind a list of planned dishes, scaled to the planned grams. */
function rawFor(plan: Plan, items: PlanItem[], pick: (r: Recipe | undefined) => boolean = () => true): Need[] {
  const out: Need[] = []
  for (const [name, grams] of items) {
    if (!grams) continue                      // eating out has no amount
    const r = plan.recipes[name] ?? FOOD_RECIPES[name]
    if (!pick(r)) continue
    if (!r) { out.push({ name, qty: grams, unit: 'g', sprout: false }); continue }
    const k = grams / r.per
    for (const [n, q, unit, flag] of r.raw) out.push({ name: n, qty: q * k, unit, sprout: flag === 'sprout' })
  }
  return out
}

/** Adds up the same ingredient across dishes and rounds it to something you can weigh. */
function total(needs: Need[], use = true) {
  const m = new Map<string, Need>()
  for (const n of needs) {
    const key = `${n.name}|${n.unit}|${n.sprout}`
    const cur = m.get(key)
    if (cur) cur.qty += n.qty; else m.set(key, { ...n })
  }
  return [...m.values()].map(n => {
    const q = n.unit === 'g' || n.unit === 'ml' ? Math.max(5, Math.round(n.qty / 5) * 5) : Math.max(1, Math.round(n.qty))
    const base = n.name.replace(/, dry$/, '')
    // Sprouts are weighed dry: soak 140 g dry, then cook "sprouts from 60 g dry".
    if (n.sprout) return use ? { name: `${base} sprouts`, amount: `from ${q} g dry` } : { name: base, amount: `${q} g dry` }
    return { name: n.name, amount: `${q} ${n.unit}` }
  })
}

/** Soak, sprout and cook tasks for one day, with weighed amounts.
 *  Night before:  soak legumes for the day after next, set up overnight breakfasts.
 *  Morning:       drain yesterday's soak so it sprouts, cook breakfast.
 *  Evening:       cook tonight's dinner and tomorrow's packed lunch. */
export function prepFor(plan: Plan, day: string, ov: Overrides = NO_OV): DayEvent[] {
  const T = plan.prepTimes
  const today = effectiveDay(plan, day, ov), next = effectiveDay(plan, addDays(day, 1), ov), after = effectiveDay(plan, addDays(day, 2), ov)
  const out: DayEvent[] = []
  const add = (key: string, time: string, title: string, detail: string, needs: Need[]) => {
    if (needs.length) out.push({ key: `p:${key}`, time, kind: 'routine', title, detail, items: total(needs, key === 'morning' || key === 'evening') })
  }
  const all = (d?: PlanDay) => d ? [...d.breakfast, ...d.lunch, ...d.dinner] : []

  // Sprouts soaked last night (for tomorrow) get drained this morning.
  add('drain', T.drain, 'Drain the sprouts', 'Rinse, drain and leave covered in a warm spot. Rinse again tonight.',
    rawFor(plan, all(next)).filter(n => n.sprout))
  if (today) add('morning', T.morning, 'Cook breakfast', 'Weigh the raw amounts below.',
    rawFor(plan, today.breakfast, r => !r?.overnight))
  add('evening', T.evening, 'Cook dinner and tomorrow\'s lunch', 'Dinner tonight, lunch boxed for tomorrow. Weigh the raw amounts.',
    [...(today ? rawFor(plan, today.dinner) : []), ...(next ? rawFor(plan, next.lunch) : [])])
  add('soak', T.soak, 'Soak and set up for later', 'Legumes soak overnight for the day after tomorrow. Overnight breakfasts are set up now and kept in the fridge.',
    [...rawFor(plan, all(after)).filter(n => n.sprout), ...(next ? rawFor(plan, next.breakfast, r => !!r?.overnight) : [])])
  return out
}

/** Everything to buy for a list of dishes with cooked grams, as raw amounts. */
export const shoppingForItems = (plan: Plan, items: PlanItem[]) =>
  total(rawFor(plan, items), false).sort((a, b) => a.name.localeCompare(b.name))

/** Everything to buy for these days' meals, as dry and raw amounts, with
 *  changed meals applied and meals eaten out left off. Legumes are dry weight. */
export function shoppingFor(plan: Plan, days: string[], ov: Overrides = NO_OV) {
  const needs: Need[] = []
  for (const day of days) {
    const p = effectiveDay(plan, day, ov)
    if (p) needs.push(...rawFor(plan, [...p.breakfast, ...p.lunch, ...p.dinner]))
  }
  return total(needs, false).sort((a, b) => a.name.localeCompare(b.name))
}

// ---- whose plan it is ------------------------------------------------------------

export type Profile = {
  name: string
  weightKg: number; heightCm: number; goalKg: number
  diet: 'veg' | 'egg' | 'nonveg'
  meatOk?: boolean              // their coach confirmed meat and fish for this phase
  program: 'coach' | 'own' | 'track'
  start: string                 // day 1 of the plan
  open: string; close: string; cutoff: string
  owner?: boolean               // the person the plan file was written for (the owner)
  /** the coach only: start with the 14-day clean-eating menu, adapted to how they eat. Off for phones set up before 14 Nov 2026. */
  menu?: boolean
  /** Their own targets, from their coach. Empty means worked out or left off. */
  proteinG?: number | null; kcalMin?: number | null; waterMl?: number | null
}

/** Egg whites leave the menu for vegetarians: a sprouted moong dish at breakfast, paneer tikka at dinner. */
const EGG_SWAP: Record<string, [string, number]> = {
  'Egg whites': ['Sprouted moong subji', 150], 'Egg whites, boiled': ['Sprouted moong subji', 150],
  'Boiled egg whites, 4, tossed with pepper and onion': ['Paneer tikka', 150],
}
function forDiet<T extends [string, number]>(items: T[], diet: Profile['diet']): T[] {
  if (diet !== 'veg') return items
  const out: T[] = []
  for (const it of items) {
    const swap = EGG_SWAP[it[0]] as T | undefined
    if (!swap) out.push(it)
    else if (!out.some(o => o[0] === swap[0])) out.push(swap)
  }
  return out
}

/** The plan file reshaped for one person: day 1 on their start date, their
 *  eating window, and their own protein target (or 0.8 g a kg of goal weight,
 *  at least 60 g). the owner's days carry the 14-day menu as it is. Others on the coach
 *  get the same meals when they opt in (`menu`), swapped for their diet; anyone
 *  else plans their own meals, or brings in their coach's menu. */
export function planForProfile(base: Plan, p: Profile): Plan {
  const menu = !!p.owner || (!!p.menu && p.program === 'coach')
  const days = base.days.map((d, i) => {
    const date = addDays(p.start, i)
    if (p.owner) return { ...d, date }
    if (!menu) return { ...d, date, breakfast: [], lunch: [], dinner: [], note: undefined, trial: undefined }
    // The owner's notes and trial dates are theirs; the meals are the coach's clean-eating menu.
    return { ...d, date, breakfast: forDiet(d.breakfast, p.diet), lunch: forDiet(d.lunch, p.diet), dinner: forDiet(d.dinner, p.diet), note: undefined, trial: undefined }
  })
  const proteinG = p.proteinG || Math.max(60, Math.round((p.goalKg || p.weightKg) * 0.8 / 5) * 5)
  return {
    ...base,
    start: p.start, end: addDays(p.start, base.days.length - 1),
    window: { open: p.open, close: p.close, carbCutoff: p.cutoff },
    waterTargetMl: p.waterMl || base.waterTargetMl,
    days,
    targets: { ...(base.targets ?? { vegG: 400, carbMeals: 2 }), proteinG } as Plan['targets'],
  }
}
export const meatFor = (p: Profile): 'no' | 'ask' | 'yes' =>
  p.diet !== 'nonveg' ? 'no' : p.meatOk || p.program !== 'coach' ? 'yes' : 'ask'

// ---- the eating window --------------------------------------------------------

export type WindowState =
  | { state: 'before'; opensIn: number }
  | { state: 'open'; closesIn: number; carbsLeft: number }
  | { state: 'closed' }

/** Where now sits against the 12-hour window, in minutes. */
export function windowState(plan: Plan, now: Date): WindowState {
  const n = now.getHours() * 60 + now.getMinutes()
  const open = minutes(plan.window.open), close = minutes(plan.window.close), carbs = minutes(plan.window.carbCutoff)
  if (n < open) return { state: 'before', opensIn: open - n }
  if (n >= close) return { state: 'closed' }
  return { state: 'open', closesIn: close - n, carbsLeft: Math.max(0, carbs - n) }
}

/** Why a logged food breaks a rule, if it does. */
export function logWarnings(plan: Plan, name: string, time: string): string[] {
  const w: string[] = []
  const t = minutes(time)
  if (t < minutes(plan.window.open) || t >= minutes(plan.window.close)) w.push('Outside the eating window')
  if (isCarb(name) && t >= minutes(plan.window.carbCutoff)) w.push('Carb after 6 pm')
  for (const r of ruleBreaks(name)) w.push(`Not allowed: ${r}`)
  return w
}

export const fmtDuration = (mins: number) => {
  const h = Math.floor(mins / 60), m = mins % 60
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`
}

// ---- alarms -------------------------------------------------------------------

export type Alarm = {
  id: string; when: Date; title: string; body: string
  category: 'meal' | 'dose' | 'routine'; data: Record<string, string>
}

/** iOS keeps only the 64 soonest pending alarms per app. Stay at 50 so
 *  snoozes have room, and refill every time the app opens or anything is logged. */
export const ALARM_CAP = 50

/** The alarms from now forward, soonest first, up to the cap. */
export function alarmsFrom(plan: Plan, meds: Med[], now: Date, days = 3, skip: (day: string, key: string) => boolean = () => false, ov: Overrides = NO_OV): Alarm[] {
  const out: Alarm[] = []
  const today = ymd(now)
  for (let i = 0; i < days; i++) {
    const day = addDays(today, i)
    for (const e of eventsFor(plan, meds, day, ov)) {
      const when = at(day, e.time)
      if (when <= now || skip(day, e.key)) continue
      if (e.kind === 'med') {
        out.push({ id: `${day}|${e.key}`, when, title: `Take ${e.title}`, body: e.detail ?? '', category: 'dose',
          data: { day, key: e.key, medId: e.medId!, time: e.time } })
      } else if (e.kind === 'meal') {
        const body = e.items?.map(x => x.name).join(', ') ?? ''
        out.push({ id: `${day}|${e.key}`, when, title: e.title, body, category: 'meal', data: { day, key: e.key, slot: e.slot! } })
      } else {
        const body = e.items?.length ? e.items.map(x => `${x.name} ${x.amount ?? ''}`.trim()).join(', ') : e.detail ?? ''
        out.push({ id: `${day}|${e.key}`, when, title: e.title, body, category: 'routine', data: { day, key: e.key } })
      }
    }
  }
  return out.sort((a, b) => +a.when - +b.when).slice(0, ALARM_CAP)
}

/** V1 has no breakfast, lunch or dinner: the day runs on the coach's card (8 AM fat, 10 protein,
 *  12 veg, 2 protein, 4 veg, 6 protein, 8 fibre drink). So each supplement keeps its
 *  medicine list slot (morning, noon, evening, night) but moves to sit with the V1 meal it
 *  belongs after, and says which meal in words. Other phases use the times on the medicine. */
const FAT8 = 'right after the 8 AM ghee or butter, it needs fat'
const P10 = 'right after the 10 AM protein meal'
const P2 = 'right after the 2 PM protein meal'
const P6 = 'right after the 6 PM protein meal'
export const V1_MEDS: Record<string, { times: string[]; withFood: string }> = {
  d3: { times: ['08:15'], withFood: FAT8 },
  omega: { times: ['14:15'], withFood: P2 },
  multi: { times: ['18:15'], withFood: P6 },
}
/** Which row of the weekly pill box a dose goes in. 5-HTP has its own (Backup); the rest go by the time of day. */
export const BOX_ROWS = { morning: 'Morning row', noon: 'Noon row', night: 'Night row', backup: 'Backup row' } as const
export function boxRow(medId: string, time: string): string {
  if (medId === '5htp') return BOX_ROWS.backup
  const h = Number(time.slice(0, 2))
  return h < 12 ? BOX_ROWS.morning : h < 15 ? BOX_ROWS.noon : BOX_ROWS.night
}
/** The medicine as it is taken on a day: V1 days use the V1 times and food words. */
export const medForDay = (m: Med, v1: boolean): Med => v1 && V1_MEDS[m.id] ? { ...m, ...V1_MEDS[m.id] } : m

/** The reminders that remain (spec v2): the morning weigh-in, each supplement
 *  with one follow-up 30 minutes later, and meals only if switched on. Every
 *  request counts against the cap, follow-ups included. */
export function remindersFrom(meds: Med[], now: Date, o: {
  weighAt: string; days?: number; cap?: number
  /** True for days in V1, where doses move to the V1 meal times. */
  v1?: (day: string) => boolean
  settled?: (day: string, key: string) => boolean
  meals?: (day: string) => { slot: Slot; time: string; title: string; body: string }[]
}): Alarm[] {
  const out: Alarm[] = []
  const settled = o.settled ?? (() => false)
  const today = ymd(now)
  for (let i = 0; i < (o.days ?? 3); i++) {
    const day = addDays(today, i)
    const push = (a: Alarm) => { if (a.when > now) out.push(a) }
    if (!settled(day, 'r:weigh'))
      push({ id: `${day}|r:weigh`, when: at(day, o.weighAt), title: 'Weigh in', body: 'Empty stomach. Then send the update to the coach from Today.', category: 'routine', data: { day, key: 'r:weigh' } })
    // Doses due at the same minute share one reminder (and one follow-up), so a
    // morning of twelve supplements is one alarm, and one Taken marks them all.
    const due = new Map<string, Med[]>()
    const v1 = o.v1?.(day) ?? false
    for (const m0 of meds) if (medOn(m0, day)) { const m = medForDay(m0, v1); for (const t of m.times)
      if (!settled(day, `d:${m.id}:${t}`)) due.set(t, [...(due.get(t) ?? []), m]) }
    for (const [t, ms] of due) {
      const one = ms.length === 1 ? ms[0] : null
      const key = one ? `d:${one.id}:${t}` : `g:${t}`
      const what = one ? one.name : `${ms.length} supplements at ${clock(t)}`
      const body = one ? [boxRow(one.id, t), one.dose, one.withFood].filter(Boolean).join(', ') : ms.map(m => `${m.name} (${[boxRow(m.id, t), m.dose, m.withFood].filter(Boolean).join(', ')})`).join('\n')
      const data = { day, key, medId: ms.map(m => m.id).join(','), time: t }
      push({ id: `${day}|${key}`, when: at(day, t), title: `Take ${what}`, body, category: 'dose', data })
      push({ id: `${day}|${key}|follow`, when: new Date(+at(day, t) + 30 * 60_000), title: `Still to take: ${what}`, body, category: 'dose', data: { ...data, follow: '1' } })
    }
    for (const e of o.meals?.(day) ?? []) if (!settled(day, `m:${e.slot}`))
      push({ id: `${day}|m:${e.slot}`, when: at(day, e.time), title: e.title, body: e.body, category: 'meal', data: { day, key: `m:${e.slot}`, slot: e.slot } })
  }
  const sorted = out.sort((a, b) => +a.when - +b.when).slice(0, o.cap ?? 56)
  // Never keep a follow-up whose own dose alarm fell off the end.
  const ids = new Set(sorted.map(a => a.id))
  return sorted.filter(a => !a.id.endsWith('|follow') || ids.has(a.id.slice(0, -'|follow'.length)))
}

// ---- meetings -----------------------------------------------------------------------

export type Busy = { start: number; end: number; title: string }

/** Where an alarm should ring if a meeting is on: two minutes after the meeting
 *  (or a run of back-to-back meetings) ends. Returns null when the time is free. */
export function afterMeetings(when: Date, busy: Busy[]): { at: Date; during: string } | null {
  const t = +when
  let hit = busy.find(b => b.start <= t && t < b.end)
  if (!hit) return null
  let end = hit.end
  const titles = [hit.title]
  // Follow meetings that start before or within 2 minutes of this one ending.
  for (let moved = true; moved;) {
    moved = false
    for (const b of busy) if (b.start <= end + 2 * 60_000 && b.end > end) { end = b.end; titles.push(b.title); moved = true }
  }
  return { at: new Date(end + 2 * 60_000), during: titles[0] }
}

/** Your own meal blocks are not meetings: an alarm for lunch during "Lunch" should ring. */
export const isMealBlock = (title: string) => /\b(lunch|breakfast|dinner|meal|eat)\b/i.test(title)

// ---- pauses ---------------------------------------------------------------------------
// the coach allows a pause: the programme stops counting until you restart. A
// pause runs from its first day to its last, both included; an open pause has no end.

export type Pause = { start: string; end: string | null }
const daysBetween = (a: string, b: string) => Math.round((+at(b, '12:00') - +at(a, '12:00')) / 86_400_000)

/** True when the day falls inside a pause. */
export const pausedOn = (pauses: Pause[], day: string) => pauses.some(p => p.start <= day && (!p.end || day <= p.end))

/** Programme day number (day 1 = start), not counting paused days. Null on a paused day. */
export function programmeDay(start: string, day: string, pauses: Pause[]): number | null {
  if (day < start || pausedOn(pauses, day)) return null
  let paused = 0
  for (const p of pauses) {
    const end = p.end ?? day
    if (p.start > day) continue
    paused += Math.max(0, daysBetween(p.start < start ? start : p.start, end < day ? end : addDays(day, -1)) + 1)
  }
  return daysBetween(start, day) + 1 - paused
}

/** Phase start dates after a pause: phases that had not started when the pause
 *  began move later by the length of the pause. Started phases stay put. */
export function shiftAfterPause(starts: Record<string, string>, p: { start: string; end: string }): Record<string, string> {
  const n = daysBetween(p.start, p.end) + 1
  return Object.fromEntries(Object.entries(starts).map(([id, s]) => [id, s >= p.start ? addDays(s, n) : s]))
}

/** the coach allows one pause in any 30 days. Returns the earlier pause it clashes with, if any. */
export const pauseClash = (pauses: Pause[], start: string) =>
  pauses.find(p => p.start < start && daysBetween(p.start, start) < 30) ?? null

// ---- adding a medicine list -----------------------------------------------------------

export type RxLine = { name: string; dose: string; times: string[]; withFood: string; days: number | null; everyDays?: number; note: string }
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'med'

/** Medicines from a medicine list. With `oneADay`, each starts a day after the
 *  one before (the coach's rule: one new supplement a day). A medicine already
 *  on the phone keeps its id, so it is updated rather than doubled. */
export function medsFromRx(lines: RxLine[], start: string, oneADay: boolean, existing: Med[]): Med[] {
  return lines.map((l, i) => {
    const s = oneADay ? addDays(start, i) : start
    const old = existing.find(m => m.name.trim().toLowerCase() === l.name.trim().toLowerCase())
    const times = [...new Set(l.times.filter(t => /^\d{2}:\d{2}$/.test(t)))].sort()
    return { id: old?.id ?? `${slug(l.name)}-${s.replace(/-/g, '')}`, name: l.name.trim(), dose: l.dose.trim() || '1', times: times.length ? times : ['08:00'],
      withFood: l.withFood, start: s, end: l.days ? addDays(s, l.days - 1) : null, note: l.note.trim() || undefined, about: old?.about, active: true,
      every: l.everyDays && l.everyDays > 1 ? l.everyDays : undefined }
  })
}

// ---- weights from Apple Health ------------------------------------------------------------
// A smart scale's app (Life Health Sense and the like) saves to Apple Health; the
// first reading of each day from any other app is that morning's weight.

export type WeightSample = { kg: number; at: Date; app: string }

/** The first reading of each local day, ignoring this app's own writes. */
export function morningWeights(samples: WeightSample[], ownApp: string): Record<string, { kg: number; at: string }> {
  const out: Record<string, { kg: number; at: string; t: number }> = {}
  for (const s of samples) {
    if (s.app === ownApp || !(s.kg > 30 && s.kg < 250)) continue
    const day = ymd(s.at)
    if (!out[day] || +s.at < out[day].t) out[day] = { kg: Math.round(s.kg * 10) / 10, at: hm(s.at), t: +s.at }
  }
  return Object.fromEntries(Object.entries(out).map(([d, v]) => [d, { kg: v.kg, at: v.at }]))
}

/** Which days to fill from Apple Health: days with no weight yet, and days whose
 *  weight came from Apple Health before but has changed there. A weight typed
 *  in the app is never replaced. */
export function weightsToApply(morning: Record<string, { kg: number; at: string }>, have: Record<string, { kg: number; source: string }>) {
  return Object.entries(morning)
    .filter(([day, w]) => !have[day] || (have[day].source === 'health' && have[day].kg !== w.kg))
    .map(([day, w]) => ({ day, kg: w.kg, at: w.at }))
}

// ---- a coach's menu, laid out on dates ------------------------------------------------------

export type MenuIn = { day: number; meals: { slot: Slot; name: string; method?: string; time?: string; items: { name: string; grams: number | null }[] }[] }
/** The menu's numbered days on real dates from `start`, repeated `weeks` times
 *  when it is a week or shorter (a 7-day plan repeated for 4 weeks covers 28 days). */
export function menuOnDates(menu: MenuIn[], start: string, weeks = 1) {
  const span = Math.max(1, ...menu.map(d => d.day))
  const reps = span <= 7 ? Math.max(1, weeks) : 1
  const out: { day: string; slot: Slot; name: string; method?: string; time?: string; items: { name: string; grams: number | null }[] }[] = []
  for (let r = 0; r < reps; r++) for (const d of menu) for (const m of d.meals)
    out.push({ day: addDays(start, r * span + d.day - 1), slot: m.slot, name: m.name, method: m.method, time: m.time, items: m.items })
  return out
}

/** The days a meal repeats on after `day`: the next n days, or the same weekday for n weeks. */
export function repeatDates(day: string, n: number, weekly = false): string[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDays(day, weekly ? 7 * (i + 1) : i + 1))
}
