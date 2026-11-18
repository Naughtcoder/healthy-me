// The meal builder's rules: how a day is adding up, what a built meal breaks,
// which combinations fit a meal, and what the rest of the day should be.
// Pure, like core.ts, so the tests can check every combination it offers.
import { DIET, effectiveDay, EXTRA_SNACKS, isCarb, isExtra, minutes, NO_OV, ruleBreaks, SLOTS, type Overrides, type Plan, type PlanItem, type Slot } from './core.ts'
import { FOODS, lookup, type Food, type Meal } from './foods.ts'
import type { Meal as DayMeal } from './meals.ts'

export type Item = { name: string; grams: number }
export type Totals = { p: number; veg: number; kcal: number; carb: boolean; unknown: string[] }
export const MAINS = ['breakfast', 'lunch', 'dinner'] as const
export type Main = typeof MAINS[number]
const isMain = (s: Slot): s is Main => (MAINS as readonly string[]).includes(s)
const mealOf = (s: Slot): Meal => isMain(s) ? s : 'snack'

const DEFAULT_TARGETS = { proteinG: 60, vegG: 400, carbMeals: 2, kcalMax: null as number | null }
export const targetsOf = (plan: Plan) => ({ ...DEFAULT_TARGETS, ...plan.targets })

/** When each meal sits in the day. Matches the timeline. An added snack with
 *  no time of its own sits with the evening snack. */
export function slotTime(plan: Plan, slot: Slot) {
  const fixed: Partial<Record<Slot, string>> = { breakfast: plan.window.open, snack1: plan.snacks.morning.time, lunch: '13:30', snack2: plan.snacks.evening.time, dinner: '20:15' }
  return fixed[slot] ?? plan.snacks.evening.time
}

/** When a meal sits in the day: the time it was eaten, else its own planned time, else its slot's. */
export const mealTime = (plan: Plan, m: Pick<DayMeal, 'slot' | 'state' | 'eatenAt' | 'time'>) =>
  (m.state === 'eaten' && m.eatenAt) || m.time || slotTime(plan, m.slot)

/** The day's meal list in time order: a row for each of the five daily meals,
 *  with or without a record, and each added snack placed by its time. */
export function dayRows(plan: Plan, meals: DayMeal[]): { slot: Slot; meal?: DayMeal; time: string }[] {
  const slots = [...SLOTS, ...EXTRA_SNACKS.filter(s => meals.some(m => m.slot === s))]
  return slots.map(slot => {
    const meal = meals.find(m => m.slot === slot)
    return { slot, meal, time: meal ? mealTime(plan, meal) : slotTime(plan, slot) }
  }).sort((a, b) => minutes(a.time) - minutes(b.time))
}

/** Where another snack goes on a day: the added snack that already has this
 *  name (so repeating a meal twice does not double it), else the first free
 *  one. Null when all six are taken. */
export function snackSlot(meals: DayMeal[], name = ''): Slot | null {
  const n = name.trim().toLowerCase()
  const same = n ? meals.find(m => isExtra(m.slot) && m.name.trim().toLowerCase() === n) : undefined
  return same?.slot ?? EXTRA_SNACKS.find(s => !meals.some(m => m.slot === s)) ?? null
}

/** Protein, vegetables and kcal in a meal. Unknown foods count as nothing and are named. */
export function totals(items: Item[]): Totals {
  const t: Totals = { p: 0, veg: 0, kcal: 0, carb: false, unknown: [] }
  for (const { name, grams } of items) {
    const f = lookup(name)
    if (isCarb(name)) t.carb = true
    if (!f) { t.unknown.push(name); continue }
    t.p += (f.p * grams) / 100
    t.kcal += (f.kcal * grams) / 100
    if (f.group === 'veg') t.veg += grams
  }
  t.p = Math.round(t.p); t.kcal = Math.round(t.kcal)
  return t
}

// ---- the day so far -------------------------------------------------------------

export type Logged = { slot: Slot; name: string; grams: number | null }
export type SlotState = { slot: Slot; items: Item[]; source: 'logged' | 'planned' | 'away' | 'skipped' }
const SKIPPED = 'Skipped'
const toItems = (xs: PlanItem[]) => xs.filter(([, g]) => g > 0).map(([name, grams]) => ({ name, grams }))

/** What each meal of the day is: logged if it was, the plan if not. `swap`
 *  puts a meal being built in its slot. Meals at the office or out are 'away'
 *  until logged, and count as nothing. Unlogged snacks are optional, so they count as nothing. */
export function dayState(plan: Plan, day: string, logged: Logged[], ov: Overrides = NO_OV, swap?: { slot: Slot; items: Item[] }): SlotState[] {
  const p = effectiveDay(plan, day, ov)
  return SLOTS.map(slot => {
    if (swap?.slot === slot) return { slot, items: swap.items, source: 'planned' as const }
    const rows = logged.filter(l => l.slot === slot)
    if (rows.length) {
      const real = rows.filter(r => r.name !== SKIPPED)
      return real.length ? { slot, items: real.map(r => ({ name: r.name, grams: r.grams ?? lookup(r.name)?.grams ?? 100 })), source: 'logged' as const }
        : { slot, items: [], source: 'skipped' as const }
    }
    if (!isMain(slot) || !p) return { slot, items: [], source: 'planned' as const }
    const o = ov[`${day}|${slot}`]
    if (o && (o.mode === 'office' || o.mode === 'out')) return { slot, items: [], source: 'away' as const }
    return { slot, items: toItems(p[slot]), source: 'planned' as const }
  })
}

export type Balance = { p: number; veg: number; kcal: number; carbMeals: number; targets: ReturnType<typeof targetsOf> }
export function balance(plan: Plan, states: SlotState[]): Balance {
  const b = { p: 0, veg: 0, kcal: 0, carbMeals: 0, targets: targetsOf(plan) }
  for (const s of states) {
    const t = totals(s.items)
    b.p += t.p; b.veg += t.veg; b.kcal += t.kcal
    if (t.carb) b.carbMeals++
  }
  return b
}

// ---- checking one meal ------------------------------------------------------------

export type Check = { ok: boolean; text: string }
/** What is right and wrong with a meal, in plain words. `otherCarbMeals` is
 *  how many other meals today have carbs. */
export function checkMeal(plan: Plan, slot: Slot, items: Item[], otherCarbMeals: number): Check[] {
  const out: Check[] = []
  if (!items.length) return out
  const t = totals(items)
  const T = targetsOf(plan)
  const breaks = items.flatMap(i => ruleBreaks(i.name).map(r => `${i.name}: ${r}`))
  out.push(...breaks.map(text => ({ ok: false, text: `Not allowed. ${text}` })))
  if (!breaks.length) out.push({ ok: true, text: 'Clean-eating foods only' })
  const late = minutes(slotTime(plan, slot)) >= minutes(plan.window.carbCutoff)
  if (t.carb && late) out.push({ ok: false, text: 'Has carbs, and carbs end at 6 pm' })
  else if (late) out.push({ ok: true, text: 'No carbs, right for after 6 pm' })
  if (t.carb && otherCarbMeals >= T.carbMeals) out.push({ ok: false, text: `Carbs in a meal number ${otherCarbMeals + 1} today. Keep carbs to ${T.carbMeals} meals.` })
  if (isMain(slot)) {
    if (t.p < 10) out.push({ ok: false, text: `Only ${t.p} g protein. Add paneer, egg whites, sprouts or hung curd.` })
    else out.push({ ok: true, text: `${t.p} g protein` })
    if (slot !== 'breakfast' && t.veg === 0) out.push({ ok: false, text: 'No vegetables' })
  }
  if (t.unknown.length) out.push({ ok: false, text: `Not in the food list, so not counted: ${t.unknown.join(', ')}` })
  if (T.kcalMax) out.push({ ok: true, text: `About ${t.kcal} kcal` })
  return out
}

// ---- combinations ---------------------------------------------------------------------

export type Idea = { items: Item[]; p: number; veg: number; kcal: number; carb: boolean }
export type IdeaOpts = {
  pTarget: number           // protein this meal should bring
  vegTarget: number         // vegetables this meal should bring, grams
  carbOk: boolean
  avoid?: Set<string>       // already eaten or planned today
  office?: boolean          // only what a canteen has
  limit?: number
  allowed?: (name: string) => boolean   // the day's rules; foods it rejects are never offered
}

// Meat and fish are offered only once allowed; 'ask' keeps them out of ideas
// but still lets the person add them by hand, with a warning.
let allow: (name: string) => boolean = () => true
const pick = (meal: Meal, group: Food['group'], office?: boolean) =>
  FOODS.filter(f => f.group === group && f.meals.includes(meal) && (!office || f.office) && (!f.nonveg || DIET.meat === 'yes') && allow(f.name))

/** A protein portion sized toward the target, between 1x and 1.5x normal, in 25 g steps. */
function sized(f: Food, need: number): Item {
  if (f.grams < 50) return { name: f.name, grams: f.grams }   // a scoop is a scoop
  const at1 = (f.p * f.grams) / 100
  const k = at1 >= need || f.p < 5 ? 1 : Math.min(1.5, need / at1)
  return { name: f.name, grams: Math.round((f.grams * k) / 25) * 25 || f.grams }
}
const item = (f: Food): Item => ({ name: f.name, grams: f.grams })

/** Every sensible combination for a meal, best first. Pairing rules:
 *  breakfast is a base with its side and a protein; lunch is a base with its
 *  gravy, a vegetable and a protein; dinner is a protein with one or two
 *  vegetables and no carbs; a snack is one thing. Without carbs, the base goes. */
export function combos(plan: Plan, slot: Slot, o: IdeaOpts): Idea[] {
  allow = o.allowed ?? (() => true)
  const raw = generate(plan, slot, o)
  allow = () => true
  const T = targetsOf(plan)
  const scored = raw.map(items => {
    const t = totals(items)
    const repeats = items.filter(i => o.avoid?.has(i.name)).length
    let s = -Math.abs(t.p - o.pTarget) * 0.6 + Math.min(t.veg, o.vegTarget) / 40 - repeats * 6
    if (T.kcalMax) s -= Math.max(0, t.kcal - T.kcalMax / 3) / 20
    return { items, p: t.p, veg: t.veg, kcal: t.kcal, carb: t.carb, s }
  }).sort((a, b) => b.s - a.s)
  // Spread the list: no two ideas with the same first two foods, no protein more than twice.
  const out: Idea[] = [], seen = new Set<string>(), used = new Map<string, number>()
  for (const x of scored) {
    const key = x.items.slice(0, 2).map(i => i.name).join('|')
    const pr = x.items.find(i => lookup(i.name)?.group === 'protein')?.name ?? ''
    if (seen.has(key) || (used.get(pr) ?? 0) >= 2) continue
    seen.add(key); used.set(pr, (used.get(pr) ?? 0) + 1)
    out.push({ items: x.items, p: x.p, veg: x.veg, kcal: x.kcal, carb: x.carb })
    if (out.length >= (o.limit ?? 6)) break
  }
  return out
}

/** Every combination for a meal, unranked. */
function generate(plan: Plan, slot: Slot, o: Pick<IdeaOpts, 'carbOk' | 'office' | 'pTarget'>): Item[][] {
  const meal = mealOf(slot)
  const carbOk = o.carbOk && minutes(slotTime(plan, slot)) < minutes(plan.window.carbCutoff)
  const raw: Item[][] = []
  if (meal === 'snack') {
    for (const f of pick('snack', 'snack', o.office)) raw.push([item(f)])
  } else {
    const bases = carbOk ? pick(meal, 'base', o.office) : []
    const proteins = pick(meal, 'protein', o.office)
    const vegs = pick(meal, 'veg', o.office)
    const sides = pick(meal, 'side', o.office)
    const sideFor = (b: Food) => (b.pairs ?? []).map(n => sides.find(s => s.name === n)).filter((s): s is Food => !!s).slice(0, 2)
    const prot = (f: Food) => sized(f, o.pTarget)
    if (meal === 'breakfast') {
      for (const b of bases) for (const pr of proteins) {
        const ss = sideFor(b)
        if (ss.length) for (const s of ss) raw.push([item(b), item(s), prot(pr)])
        else raw.push([item(b), prot(pr)])
      }
      if (!bases.length) for (const pr of proteins) {
        const ss = sides.filter(s => s.name === 'Berries' || s.name === 'Walnuts and seeds')
        if (ss.length) for (const s of ss) raw.push([prot(pr), item(s)])
        else raw.push([prot(pr)])
      }
    } else if (meal === 'lunch') {
      for (const b of bases) for (const v of vegs) for (const pr of proteins) {
        const ss = sideFor(b)
        if (ss.length) for (const s of ss) raw.push([item(b), item(s), item(v), prot(pr)])
        else raw.push([item(b), item(v), prot(pr)])
      }
      if (!bases.length) for (const v of vegs) for (const pr of proteins) raw.push([prot(pr), item(v)])
    } else {
      for (const pr of proteins) for (const v of vegs) {
        raw.push([prot(pr), item(v)])
        for (const v2 of vegs) if (v2 !== v && /soup|salad/i.test(v2.name) && !/soup|salad/i.test(v.name)) raw.push([prot(pr), item(v), item(v2)])
      }
    }
  }
  return raw
}

/** How many possible meals the library makes for a slot, for the screen's count. */
export const comboCount = (plan: Plan, slot: Slot, carbOk: boolean, office = false) =>
  generate(plan, slot, { pTarget: 20, carbOk, office }).length

// ---- the rest of the day ----------------------------------------------------------------

export type Next = { slot: Slot; planned: Item[]; plannedP: number; idea: Idea | null }
export type Rest = { next: Next[]; end: Balance }

/** Given the day with `slot` set to what is being built, the best choice for
 *  each meal still to come, and where the day ends up if he follows them.
 *  Meals before `slot`, and meals already logged, stay as they are. */
export function restOfDay(plan: Plan, day: string, logged: Logged[], ov: Overrides, slot: Slot, items: Item[], office = false): Rest {
  const states = dayState(plan, day, logged, ov, { slot, items })
  const i0 = SLOTS.indexOf(slot)
  const open = states.filter(s => SLOTS.indexOf(s.slot) > i0 && s.source !== 'logged' && s.source !== 'skipped')
  const fixed = states.filter(s => !open.includes(s))
  const b = balance(plan, fixed)
  const T = b.targets
  const avoid = new Set(states.flatMap(s => s.items.map(i => i.name)))
  const next: Next[] = []
  let mainsLeft = open.filter(s => isMain(s.slot)).length
  for (const s of open) {
    const planned = s.items, plannedP = totals(planned).p
    if (!isMain(s.slot)) {
      // A snack only earns a place if protein is short even with the meals left.
      const short = T.proteinG - b.p - mainsLeft * 22
      const idea = short > 5 ? combos(plan, s.slot, { pTarget: short, vegTarget: 0, carbOk: false, avoid, office, limit: 1 })[0] ?? null : null
      if (idea) { b.p += idea.p; b.veg += idea.veg; b.kcal += idea.kcal }
      next.push({ slot: s.slot, planned: [], plannedP: 0, idea })
      continue
    }
    const pTarget = Math.max(15, (T.proteinG - b.p) / mainsLeft)
    const vegTarget = Math.max(0, (T.vegG - b.veg) / mainsLeft)
    const idea = combos(plan, s.slot, { pTarget, vegTarget, carbOk: b.carbMeals < T.carbMeals, avoid, office: office && s.slot === 'lunch', limit: 1 })[0] ?? null
    if (idea) {
      b.p += idea.p; b.veg += idea.veg; b.kcal += idea.kcal
      if (idea.carb) b.carbMeals++
      idea.items.forEach(i => avoid.add(i.name))
    }
    mainsLeft--
    next.push({ slot: s.slot, planned, plannedP, idea })
  }
  return { next, end: b }
}

// ---- one suggestion for an empty meal (spec v2) ----------------------------------------

/** The single best meal for a slot, given what the day already has. Only foods
 *  the day's rules fully allow are offered; new, ask-the-coach and not-yet foods never are. */
export function suggest(plan: Plan, slot: Slot, o: { proteinLeft: number; mainsLeft: number; carbOk: boolean; avoid: Set<string>; allowed: (name: string) => boolean }): Idea | null {
  const pTarget = Math.max(12, o.proteinLeft / Math.max(1, o.mainsLeft))
  return combos(plan, slot, { pTarget, vegTarget: isMain(slot) ? 150 : 0, carbOk: o.carbOk, avoid: o.avoid, allowed: o.allowed, limit: 1 })[0] ?? null
}
