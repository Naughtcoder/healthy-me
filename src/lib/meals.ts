// One record per meal: a name, a state (planned, eaten, skipped) and its items.
// Planning is typing a name; cooking is filling in amounts; eating is one tap.
// Pure, like core.ts, so the tests can check totals and the one-time move of
// the old food log without a phone.
import { effectiveDay, planDay, type Overrides, type Plan, type PlanItem, type Slot } from './core.ts'
import { lookup } from './foods.ts'

export type MealState = 'planned' | 'eaten' | 'skipped'
export type MealItem = {
  id?: number
  name: string
  grams: number | null
  ml: number | null
  /** When this item was eaten, if it differs from the meal (kept from the old log). */
  at: string | null
  /** Copied in when the meal is marked eaten, so later food-list fixes never
   *  rewrite a past day. Null while planned, or when the food or amount is unknown. */
  p: number | null
  kcal: number | null
  /** Where the numbers came from: 'list' (the food list), 'guess' (a best guess
   *  from the name), or 'moved' (worked out when the old log was moved). */
  source: string | null
}
export type Meal = {
  id?: number
  day: string
  slot: Slot
  name: string
  state: MealState
  eatenAt: string | null
  /** False when it is not cooked at home (office, eating out), so it stays off the shopping list. */
  cook: boolean
  note: string | null
  /** How the meal came to exist: 'plan', 'you', 'office', 'out', 'swap', 'build', 'log' (moved from the old log). */
  origin: string
  /** An added snack's own planned time. The five daily meals use their slot's time. */
  time?: string | null
  items: MealItem[]
}

/** Protein and kcal for an amount of a food, or null when either is unknown. */
export function nutrition(name: string, grams: number | null, ml: number | null = null) {
  const amount = grams ?? ml
  if (amount == null) return null
  const f = lookup(name)
  if (!f) return null
  return { p: Math.round((f.p * amount) / 10) / 10, kcal: Math.round((f.kcal * amount) / 100), source: f.guessed ? 'guess' : f.source ?? 'list' }
}

/** The item with its numbers frozen, for the moment a meal is marked eaten. */
export function snapshot(i: MealItem, source?: string): MealItem {
  const n = nutrition(i.name, i.grams, i.ml)
  return { ...i, p: n?.p ?? null, kcal: n?.kcal ?? null, source: n ? source ?? n.source : null }
}
/** Back to live numbers, for a meal moved back to planned. */
export const unsnapshot = (i: MealItem): MealItem => ({ ...i, p: null, kcal: null, source: null })

/** A short name for a list of items: "Paneer bhurji, Okra fry". */
export const nameOf = (items: { name: string }[]) => items.map(i => i.name).join(', ')

// ---- totals -------------------------------------------------------------------------

export type DayTotals = {
  /** Eaten food with known amounts. */
  p: number; kcal: number
  /** Eaten items, and eaten meals with no items, whose numbers are unknown. */
  unknown: number
  /** Planned meals still to come, using live numbers. */
  plannedP: number; plannedKcal: number
  mainsEaten: number
}

const MAIN: Slot[] = ['breakfast', 'lunch', 'dinner']

/** Only eaten food counts as eaten. Planned food is kept separate. */
export function dayTotals(meals: Meal[]): DayTotals {
  const t: DayTotals = { p: 0, kcal: 0, unknown: 0, plannedP: 0, plannedKcal: 0, mainsEaten: 0 }
  for (const m of meals) {
    if (m.state === 'eaten') {
      if (MAIN.includes(m.slot)) t.mainsEaten++
      if (!m.items.length) { t.unknown++; continue }
      for (const i of m.items) {
        if (i.p == null || i.kcal == null) { t.unknown++; continue }
        t.p += i.p; t.kcal += i.kcal
      }
    } else if (m.state === 'planned') {
      for (const i of m.items) {
        const n = nutrition(i.name, i.grams, i.ml)
        if (n) { t.plannedP += n.p; t.plannedKcal += n.kcal }
      }
    }
  }
  t.p = Math.round(t.p); t.kcal = Math.round(t.kcal)
  t.plannedP = Math.round(t.plannedP); t.plannedKcal = Math.round(t.plannedKcal)
  return t
}

// ---- the one-time move from the old food log ------------------------------------

export type OldRow = { id: number; day: string; slot: Slot; name: string; grams: number | null; ml: number | null; eaten_at: string; planned: number }
export const OLD_SKIPPED = 'Skipped'

const fromPlan = (xs: PlanItem[]): MealItem[] =>
  xs.map(([name, g]) => ({ name, grams: g > 0 ? g : null, ml: null, at: null, p: null, kcal: null, source: null }))

function plannedFrom(plan: Plan, day: string, slot: 'breakfast' | 'lunch' | 'dinner', ov: Overrides): Meal | null {
  const o = ov[`${day}|${slot}`]
  const base = { day, slot, state: 'planned' as const, eatenAt: null, note: null }
  if (o?.mode === 'office' || o?.mode === 'out')
    return { ...base, name: o.mode === 'office' ? 'At the office' : 'Eating out', cook: false, origin: o.mode, items: [] }
  if (o?.mode === 'custom') {
    const items = fromPlan(o.items ?? [])
    return { ...base, name: nameOf(items), cook: true, origin: 'build', items, note: o.items ? null : 'The saved meal could not be read.' }
  }
  if (o?.mode === 'dish') {
    const src = o.from ? planDay(plan, o.from) : undefined
    if (src) { const items = fromPlan(src[slot]); return { ...base, name: nameOf(items), cook: true, origin: 'swap', items } }
    // The swap points at a day that no longer exists: fall back to the plan, and say so.
  }
  const p = effectiveDay(plan, day, {})
  if (!p || !p[slot].length) return null
  const items = fromPlan(p[slot])
  return { ...base, name: nameOf(items), cook: true, origin: 'plan', items,
    note: o?.mode === 'dish' ? 'The swapped dish could not be found, so this is the original plan.' : null }
}

/** Every meal the old tables describe, as new meal records.
 *  - Real food logged for a day and slot makes an eaten meal. Every row is
 *    kept with its own time; missing amounts stay missing.
 *  - A slot with only the "Skipped" mark is skipped.
 *  - With nothing logged, the changed plan (built meal, swapped dish, office,
 *    eating out) or else the base plan becomes a planned meal. Never both.
 *  - Snacks are optional, so an unlogged snack makes no record. */
export function moveOldLog(rows: OldRow[], ov: Overrides, plan: Plan): Meal[] {
  const out: Meal[] = []
  const groups = new Map<string, OldRow[]>()
  for (const r of rows) {
    const k = `${r.day}|${r.slot}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  for (const [, g] of groups) {
    const { day, slot } = g[0]
    const real = g.filter(r => r.name !== OLD_SKIPPED).sort((a, b) => a.eaten_at.localeCompare(b.eaten_at) || a.id - b.id)
    if (!real.length) {
      out.push({ day, slot, name: '', state: 'skipped', eatenAt: g[0].eaten_at, cook: true, note: null, origin: 'log', items: [] })
      continue
    }
    const items = real.map(r => snapshot({ name: r.name, grams: r.grams, ml: r.ml, at: r.eaten_at, p: null, kcal: null, source: null }, 'moved'))
    out.push({ day, slot, name: nameOf(real), state: 'eaten', eatenAt: real[0].eaten_at, cook: true, origin: 'log', items,
      note: real.length < g.length ? 'Was also marked skipped; the food is kept.' : null })
  }
  const done = new Set(groups.keys())
  const days = new Set([...plan.days.map(d => d.date), ...Object.keys(ov).map(k => k.split('|')[0])])
  for (const day of [...days].sort()) for (const slot of ['breakfast', 'lunch', 'dinner'] as const) {
    if (done.has(`${day}|${slot}`)) continue
    const m = plannedFrom(plan, day, slot, ov)
    if (m) out.push(m)
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot])
}
const SLOT_ORDER: Record<Slot, number> = { breakfast: 0, snack1: 1, lunch: 2, snack2: 3, dinner: 4, snack3: 5, snack4: 6, snack5: 7, snack6: 8, snack7: 9, snack8: 10 }

/** Planned meals for days of the plan that have no record yet (a new person's plan). */
export function plannedFor(plan: Plan, days: string[], have: Set<string>): Meal[] {
  const out: Meal[] = []
  for (const day of days) for (const slot of ['breakfast', 'lunch', 'dinner'] as const) {
    if (have.has(`${day}|${slot}`)) continue
    const m = plannedFrom(plan, day, slot, {})
    if (m) out.push(m)
  }
  return out
}
