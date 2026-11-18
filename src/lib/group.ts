// One dish, cooked once, eaten at several meals of the day (any of the four dish slots).
// A member is another meal that holds this dish: `k` is its portion compared with this meal (1 = the same amount),
// `follow` is false for a meal already eaten with this dish (what was eaten stays as logged).
import type { Slot } from './core.ts'
import type { Meal, MealItem } from './meals.ts'
import { dishBase } from './slots.ts'
import { roleOf } from './choices.ts'

/** The day's meals in order, and when the coach's V1 day has each. The chips show these, not the time something else was logged there. */
const DAY_ORDER: Slot[] = ['breakfast', 'snack1', 'lunch', 'snack5', 'snack2', 'snack3', 'snack6', 'dinner', 'snack4']
export const SLOT_AT: Partial<Record<Slot, string>> = { breakfast: '08:00', snack1: '10:00', lunch: '12:00', snack5: '14:00', snack2: '14:00', snack3: '16:00', snack6: '18:00', dinner: '18:00', snack4: '20:00' }
/** Where a vegetable dish can go: any meal of the day except the coffee and the fibre drink, each at the time it really sits. A shake or an egg or whey meal goes to the 10 AM, 2 PM and 6 PM protein meals. */
const DISH_FAMILY: Slot[] = ['snack1', 'lunch', 'snack5', 'snack2', 'snack3', 'dinner', 'snack6', 'snack4']
const PROTEIN_FAMILY: Slot[] = ['snack1', 'snack2', 'dinner']
export function slotsFor(slot: Slot, role: string | null): Slot[] {
  const f = role === 'dish' ? DISH_FAMILY : role === 'combo' || role === 'protein' ? PROTEIN_FAMILY : []
  if (!f.length) return []
  return DAY_ORDER.filter(s => s === slot || f.includes(s))
}
export type Member = { k: number; follow: boolean }
export type Members = Partial<Record<Slot, Member>>

const r1 = (n: number) => Math.round(n * 10) / 10
const blank = (i: MealItem, k: number): MealItem => ({ name: i.name, grams: i.grams == null ? null : r1(i.grams * k), ml: i.ml == null ? null : r1(i.ml * k), at: null, p: null, kcal: null, source: null })
const emptyOf = (day: string, slot: Slot): Meal => ({ day, slot, name: '', state: 'planned', eatenAt: null, cook: true, note: null, origin: 'you', items: [] })

/** The foods of a meal at a portion: every amount times `k`. */
export const scaleItems = (items: MealItem[], k: number): MealItem[] => items.filter(i => i.name.trim()).map(i => blank(i, k))

const holdsDish = (o: Meal | undefined, m: { name: string }) =>
  !!o && o.state !== 'skipped' && o.items.length > 0 && dishBase(o.name) === dishBase(m.name)

/** The other meals that already hold this dish, each with its portion against this meal. */
export function initialMembers(m: Meal, others: Meal[]): Members {
  const out: Members = {}
  for (const s of slotsFor(m.slot, roleOf(m))) {
    if (s === m.slot) continue
    const o = others.find(x => x.slot === s)
    if (!holdsDish(o, m)) continue
    const a = m.items.find(i => i.grams && o!.items.some(j => j.name === i.name && j.grams))
    const b = a ? o!.items.find(j => j.name === a.name && j.grams)! : null
    const k = a && b ? Math.round((b.grams! / a.grams!) * 20) / 20 : 1
    out[s] = { k: k > 0 ? k : 1, follow: o!.state !== 'eaten' }
  }
  return out
}

/** Meals that would lose a different dish if they were made this one. */
export const wouldReplace = (o: Meal | undefined, m: { name: string }) => !!o && o.items.length > 0 && !holdsDish(o, m)

/** The meals as they will be saved: each chosen meal holds this dish at its portion. A meal already eaten with the dish is left alone. */
export function memberMeals(m: Meal, others: Meal[], members: Members): Meal[] {
  const out: Meal[] = []
  for (const s of slotsFor(m.slot, roleOf(m))) {
    const mem = members[s]
    if (!mem || s === m.slot) continue
    const base = others.find(x => x.slot === s)
    if (!mem.follow && base) { out.push(base); continue }
    const eaten = base?.state === 'eaten'
    out.push({ ...(base ?? emptyOf(m.day, s)), name: m.name, note: m.note, cook: m.cook, origin: 'you', state: eaten ? 'eaten' : 'planned',
      eatenAt: eaten ? base!.eatenAt : null, items: scaleItems(m.items, mem.k) })
  }
  return out
}

/** Planned meals that held this dish when the screen opened and were taken out: they go back to empty. Eaten meals stay. */
export function droppedMeals(m: Meal, others: Meal[], start: Members, now: Members): Meal[] {
  return slotsFor(m.slot, roleOf(m)).flatMap(s => {
    const base = others.find(x => x.slot === s)
    if (!start[s] || now[s] || !base || base.state === 'eaten') return []
    return [{ ...base, name: '', note: null, state: 'planned' as const, eatenAt: null, items: [] }]
  })
}

/** The portion that brings the day down to the ceiling: this meal and every followed meal shrink together. 1 when it already fits. */
export function fitPortion(capKcal: number, fixedKcal: number, variableKcal: number): number {
  if (variableKcal <= 0 || fixedKcal + variableKcal <= capKcal) return 1
  return Math.max(0.3, Math.floor(((capKcal - fixedKcal) / variableKcal) * 20) / 20)
}

/** All the portions in one meal: this meal's foods become the whole pan (its amounts plus every followed meal's portion); those meals leave the group. Null when there is none to add. */
export function mergeAll(items: MealItem[], members: Members): { items: MealItem[]; members: Members } | null {
  const ks = Object.values(members).reduce((t, x) => t + (x?.follow ? x.k : 0), 0)
  if (!ks) return null
  const kept: Members = {}
  for (const [s, v] of Object.entries(members)) if (v && !v.follow) kept[s as Slot] = v
  return { items: scaleItems(items, 1 + ks), members: kept }
}
