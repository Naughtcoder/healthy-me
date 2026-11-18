// The day's calorie ceiling (850 in V1) and what is left of it. Meals already eaten are fixed;
// meals still planned can be made lighter, so the picker only offers a choice when the rest of the
// day can still come in under the ceiling, and a heavier choice can trim the later meals to fit.
import { dishItems, kcalOf } from './recipes.ts'
import { minKcal, roleOf, stepDown } from './choices.ts'
import { macrosOf } from './foods.ts'
import { nutrition, type Meal, type MealItem } from './meals.ts'

/** What one meal comes to: the frozen numbers when eaten, the live ones when planned, nothing when skipped. */
export function mealKcal(m: { state: Meal['state']; items: MealItem[] }) {
  if (m.state === 'skipped') return 0
  return Math.round(m.items.reduce((t, i) => t + (m.state === 'eaten' && i.kcal != null ? i.kcal : nutrition(i.name, i.grams, i.ml)?.kcal ?? 0), 0))
}

export type Budget = { cap: number; fixed: number; planned: number; minPlanned: number; count: number }
/** The other meals of the day against the ceiling, or null when the day has no ceiling. */
export function budgetOf(others: Meal[], cap: number | null | undefined): Budget | null {
  if (!cap) return null
  const rest = others.filter(m => m.state === 'planned')
  return {
    cap,
    fixed: others.filter(m => m.state === 'eaten').reduce((t, m) => t + mealKcal(m), 0),
    planned: rest.reduce((t, m) => t + mealKcal(m), 0),
    minPlanned: rest.reduce((t, m) => t + Math.min(mealKcal(m), minKcal(m)), 0),
    count: rest.length,
  }
}
/** The most this meal can come to and still leave the other planned meals at their lightest. */
export const roomFor = (b: Budget | null) => b ? b.cap - b.fixed - b.minPlanned : Infinity
/** After this meal: what is left for the other planned meals, what they are planned at, and how much they must come down. */
export const leftAfter = (b: Budget, thisKcal: number) => {
  const left = b.cap - b.fixed - thisKcal
  return { left, planned: b.planned, trim: Math.max(0, b.planned - left), count: b.count }
}

const blank = (name: string, grams: number): MealItem => ({ name, grams, ml: null, at: null, p: null, kcal: null, source: null })

/** The other planned meals brought down, a notch at a time from the heaviest, until the day fits. Only the meals that changed. */
export function fitRest(others: Meal[], thisKcal: number, b: Budget): Meal[] {
  let rest = others.filter(m => m.state === 'planned').map(m => ({ m, kcal: mealKcal(m), changed: false }))
  for (let guard = 0; guard < 60 && b.fixed + thisKcal + rest.reduce((t, r) => t + r.kcal, 0) > b.cap; guard++) {
    const options = rest.map(r => ({ r, next: stepDown(r.m) })).filter((x): x is { r: typeof rest[number]; next: NonNullable<ReturnType<typeof stepDown>> } => !!x.next)
    if (!options.length) break
    const { r, next } = options.sort((a, c) => c.r.kcal - a.r.kcal)[0]
    const items = next.items.map(i => blank(i.name, i.grams))
    rest = rest.map(x => x === r ? { m: { ...x.m, name: next.name, note: next.method, items }, kcal: kcalOf(next.items), changed: true } : x)
  }
  return rest.filter(r => r.changed).map(r => r.m)
}

/** What the day adds up to: planned and eaten meals together, skipped ones nothing. Fat and carbs are estimates from a table of the recipe foods. */
export function dayMacros(meals: Meal[]) {
  let kcal = 0, p = 0, carb = 0, fat = 0
  for (const m of meals) {
    if (m.state === 'skipped') continue
    kcal += mealKcal(m)
    for (const i of m.items) {
      p += m.state === 'eaten' && i.p != null ? i.p : nutrition(i.name, i.grams, i.ml)?.p ?? 0
      const x = macrosOf(i.name, i.grams); if (x) { carb += x.carb; fat += x.fat }
    }
  }
  return { kcal: Math.round(kcal), p: Math.round(p), carb: Math.round(carb), fat: Math.round(fat) }
}

const servingOf = (name: string) => Number(/\(([\d.]+) serving\)/.exec(name)?.[1] ?? 1)
const baseName = (name: string) => name.replace(/\s*\([\d.]+ serving\)/, '').trim()
const round = (g: number) => g < 10 ? Math.max(0.5, Math.round(g * 2) / 2) : Math.round(g)

/** The planned meals with their dishes' amounts changed so the whole day comes to `cap` kcal. Dishes stay as they are; whey, egg whites,
 *  ghee, the fibre drink, anything eaten or skipped, and meals that are not recipe dishes stay fixed. `reached` is false when the dishes
 *  alone cannot close the gap (nothing to scale, or it would take more than 3x or less than a third of a serving). */
export function fitDay(meals: Meal[], cap: number): { meals: Meal[]; kcal: number; reached: boolean } {
  const eaten = meals.filter(m => m.state === 'eaten').reduce((t, m) => t + mealKcal(m), 0)
  const planned = meals.filter(m => m.state === 'planned')
  const split = planned.map(m => {
    const role = roleOf(m)
    const dish = role === 'dish' || role === 'combo' ? dishItems(m.items) : []
    const rest = m.items.filter(i => !dish.includes(i))
    return { m, dish, rest, dishKcal: kcalOf(dish), restKcal: kcalOf(rest) }
  })
  const fixed = eaten + split.filter(s => !s.dish.length).reduce((t, s) => t + s.restKcal, 0)
  const fixedInDish = split.filter(s => s.dish.length).reduce((t, s) => t + s.restKcal, 0)
  const dishAt1 = split.reduce((t, s) => t + s.dishKcal, 0)
  if (!dishAt1) return { meals: [], kcal: Math.round(fixed), reached: Math.abs(fixed - cap) <= 1 }
  const k = Math.min(3, Math.max(1 / 3, (cap - fixed - fixedInDish) / dishAt1))
  const out = split.filter(s => s.dish.length).map(s => {
    const items = [...s.rest, ...s.dish.map(i => ({ ...i, grams: i.grams == null ? null : round(i.grams * k) }))]
    return { s, items }
  })
  // The day's total the way the day card adds it: each meal rounded on its own, then summed.
  const total = () => fixed + out.reduce((t, o) => t + kcalOf(o.items), 0)
  // Rounding leaves a few kcal either way: nudge single dish items by a few grams, whichever lands the day closest to the ceiling, until it is exact or nothing helps.
  // A dish cooked once for two meals (12 and 2 PM, 4 and 6 PM) is nudged in both meals together, so the two stay identical.
  const PAIR: Record<string, string> = { lunch: 'snack5', snack5: 'lunch', snack3: 'snack6', snack6: 'snack3' }
  const twinOf = (o: typeof out[number], idx: number) => {
    const it = o.items[idx]
    return out.find(x => x !== o && PAIR[o.s.m.slot] === x.s.m.slot && x.items[idx]?.name === it.name && x.items[idx].grams === it.grams)
  }
  for (let guard = 0; guard < 60; guard++) {
    const now = Math.abs(cap - total())
    if (now === 0) break
    let best: { o: typeof out[number]; idx: number; grams: number; miss: number } | null = null
    for (const o of out) o.items.forEach((it, idx) => {
      if (!o.s.dish.some(d => d.name === it.name) || !it.grams) return
      const twin = twinOf(o, idx)
      if (twin && out.indexOf(twin) < out.indexOf(o)) return   // the pair is tried once, from its first meal
      for (const d of [-6, -4, -3, -2, -1, 1, 2, 3, 4, 6]) {
        const g = it.grams! + d
        if (g < 1) continue
        const keep = o.items[idx], keepTwin = twin ? twin.items[idx] : null
        o.items[idx] = { ...it, grams: g }; if (twin) twin.items[idx] = { ...twin.items[idx], grams: g }
        const miss = Math.abs(cap - total()); o.items[idx] = keep; if (twin) twin.items[idx] = keepTwin!
        if (miss < now && (!best || miss < best.miss)) best = { o, idx, grams: g, miss }
      }
    })
    if (!best) break
    const pick = best as { o: typeof out[number]; idx: number; grams: number; miss: number }
    const twin = twinOf(pick.o, pick.idx)
    pick.o.items[pick.idx] = { ...pick.o.items[pick.idx], grams: pick.grams }
    if (twin) twin.items[pick.idx] = { ...twin.items[pick.idx], grams: pick.grams }
  }
  const result = out.map(o => {
    const was = servingOf(o.s.m.name), dishNow = kcalOf(o.items.filter(i => o.s.dish.some(d => d.name === i.name)))
    const serving = Math.round(was * (o.s.dishKcal ? dishNow / o.s.dishKcal : 1) * 100) / 100
    const name = serving === 1 ? baseName(o.s.m.name) : `${baseName(o.s.m.name)} (${serving} serving)`
    return { ...o.s.m, name, items: o.items }
  })
  const kcal = Math.round(total())
  return { meals: result, kcal, reached: Math.abs(kcal - cap) <= 1 && k > 1 / 3 && k < 3 }
}

// ---- balancing by hand --------------------------------------------------------------------------------

export type IngredientKind = 'fat' | 'protein' | 'veg'
/** Fats, protein foods and everything else (vegetables, spices, drinks) for the lock chips. */
export function kindOf(name: string): IngredientKind {
  const n = name.toLowerCase()
  if (/\b(ghee|butter|oil)\b/.test(n)) return 'fat'
  if (/\b(whey|egg|paneer|chicken|fish|prawn|mutton|dal|protein)\b/.test(n)) return 'protein'
  return 'veg'
}

/** The morning fat, the egg whites, the whey and the fibre drink never move. Whole meals of those kinds are fixed; in a meal that mixes them with a dish (whey and a dish), the whey and egg whites are fixed and the dish is free. */
const FIXED_FOOD = /^(whey|egg white|chia seeds|psyllium husk)/i
export function isFixed(m: { name: string; items: { name: string }[] }, i: { name: string }): boolean {
  const role = roleOf(m)
  return role === 'fat' || role === 'protein' || role === 'fibre' || FIXED_FOOD.test(i.name)
}
const itemKcal = (m: { state: Meal['state'] }, i: MealItem) => m.state === 'eaten' && i.kcal != null ? i.kcal : nutrition(i.name, i.grams, i.ml)?.kcal ?? 0
/** The day split into what is fixed and what you can play with, eaten and planned together. `room` is the ceiling less the fixed part. */
export function flexSplit(meals: Meal[], cap: number | null | undefined) {
  let fixed = 0, flex = 0
  for (const m of meals) {
    if (m.state === 'skipped') continue
    for (const i of m.items) { const k = itemKcal(m, i); if (isFixed(m, i)) fixed += k; else flex += k }
  }
  fixed = Math.round(fixed); flex = Math.round(flex)
  return { fixed, flex, room: cap ? cap - fixed : null, left: cap ? cap - fixed - flex : null }
}

/** The share of the ceiling each of the day's dish meals gets, fixed from the fixed foods alone (coffee ghee, egg whites, whey, fibre drink), so it does not move with what the dish meals hold today. Null when the day has no ceiling. */
export function dishShare(meals: Meal[], cap: number | null | undefined, count = 4): { each: number; fixed: number; cap: number } | null {
  if (!cap) return null
  const { fixed } = flexSplit(meals, cap)
  return { each: Math.max(0, Math.floor((cap - fixed) / count)), fixed, cap }
}

export type BalanceRow = { slot: Meal['slot']; name: string; before: number; after: number; eaten: boolean }
export type Balanced = {
  /** Planned meals whose amounts changed, ready to save. */
  meals: Meal[]
  rows: BalanceRow[]
  /** The day's total after balancing, the way the day card adds it. */
  total: number
  /** True when the total landed within 5 kcal of the target. */
  reached: boolean
  /** What stopped it, when it did not reach: nothing left to adjust, or the limit of 0.2x to 3x of an amount. */
  why: '' | 'nothing' | 'limit'
}

const rnd = (g: number) => Math.max(0.1, Math.round(g * 10) / 10)   // to a tenth of a gram, so small amounts such as ghee stay exact
const kc = (i: MealItem) => nutrition(i.name, i.grams, i.ml)?.kcal ?? 0

/** The planned meals with every ingredient that is NOT locked scaled by one common factor, so the whole day comes to `target` kcal.
 *  Locked ingredients (by name, across all meals) keep their amounts; eaten and skipped meals are never touched. A dish cooked once
 *  for two meals scales the same in both. Amounts stay between 0.2x and 3x of what they are now. */
export function balanceDay(meals: Meal[], target: number, locked: Set<string>): Balanced {
  const lockIn = (m: Meal, i: MealItem) => isFixed(m, i) || locked.has(i.name.trim().toLowerCase())
  const eaten = meals.filter(m => m.state === 'eaten').reduce((t, m) => t + mealKcal(m), 0)
  const planned = meals.filter(m => m.state === 'planned')
  const fixed = planned.reduce((t, m) => t + m.items.filter(i => lockIn(m, i)).reduce((a, i) => a + kc(i), 0), 0)
  const free = planned.reduce((t, m) => t + m.items.filter(i => !lockIn(m, i)).reduce((a, i) => a + kc(i), 0), 0)
  const want = (target - eaten - fixed) / (free || 1)
  const k = free > 0 ? Math.min(3, Math.max(0.2, want)) : 1
  const changed: Meal[] = []
  const after = new Map<Meal, number>()
  for (const m of planned) {
    const items = m.items.map(i => lockIn(m, i) || (i.grams == null && i.ml == null) ? i : { ...i, grams: i.grams == null ? null : rnd(i.grams * k), ml: i.ml == null ? null : rnd(i.ml * k), p: null, kcal: null, source: null })
    const a = Math.round(items.reduce((t, i) => t + kc(i), 0))
    after.set(m, a)
    if (items.some((i, j) => i !== m.items[j])) changed.push({ ...m, items })
  }
  const rows: BalanceRow[] = meals.filter(m => m.state !== 'skipped').map(m => ({ slot: m.slot, name: m.name, before: mealKcal(m), after: after.get(m) ?? mealKcal(m), eaten: m.state === 'eaten' }))
  const total = Math.round(eaten + [...after.values()].reduce((t, v) => t + v, 0))
  const reached = Math.abs(total - target) <= 5
  return { meals: changed, rows, total, reached, why: reached ? '' : free <= 0 ? 'nothing' : 'limit' }
}
