// Cook once, eat twice: 12 and 2 PM share one dish, 4 and 6 PM share one dish.
// Days set before the pairing existed can hold two different dishes; this lines them up, keeping the earlier meal's pick.
import { fitDay } from './budget.ts'
import { roleOf } from './choices.ts'
import { dishBase } from './slots.ts'
import type { Meal } from './meals.ts'

/** [kept, follows]: the later meal of each pair takes the earlier meal's dish. */
const PAIRS: [string, string][] = [['lunch', 'snack5'], ['snack3', 'snack6']]

/** The meals of one day that change so each pair is one dish, then the day refitted to `cap`. Only planned dish meals move; eaten or skipped stay. */
export function alignPairs(meals: Meal[], cap: number): Meal[] {
  const day = meals.map(m => ({ ...m }))
  const changed = new Set<string>()
  for (const [a, b] of PAIRS) {
    const x = day.find(m => m.slot === a), y = day.find(m => m.slot === b)
    if (!x || !y) continue
    if (x.state !== 'planned' || y.state !== 'planned' || roleOf(x) !== 'dish' || roleOf(y) !== 'dish') continue
    const key = (m: Meal) => JSON.stringify(m.items.filter(i => i.name.trim()).map(i => [i.name, i.grams]).sort())
    if (!x.items.some(i => i.name.trim()) || (dishBase(x.name) === dishBase(y.name) && key(x) === key(y))) continue
    y.name = x.name; y.note = x.note
    y.items = x.items.map(i => ({ name: i.name, grams: i.grams, ml: i.ml, at: null, p: null, kcal: null, source: null }))
    y.origin = 'you'
    changed.add(b)
  }
  if (!changed.size) return []
  const fit = fitDay(day, cap)
  const out = new Map(day.filter(m => changed.has(m.slot)).map(m => [m.slot, m]))
  if (fit.meals.length) for (const f of fit.meals) {
    const cur = day.find(m => m.slot === f.slot)
    // A refit that changes a meal the person did not touch is kept too, so the day still comes to the ceiling.
    if (cur && JSON.stringify(cur.items) !== JSON.stringify(f.items)) out.set(f.slot, { ...f, origin: changed.has(f.slot) ? 'you' : f.origin })
  }
  return [...out.values()]
}
