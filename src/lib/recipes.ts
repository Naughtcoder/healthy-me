// the coach's V1 vegetarian recipe cards as dishes you can swap in, and the
// vegetables that can stand in for one another when one is not in the shop.
// Grams are one serving, converted from each card's cups, spoons and counts;
// only cards whose total comes within 12% of the kcal printed on the card are
// here (test/recipes.test.ts), so a swapped dish is as accurate as the card.
import { nutrition } from './meals.ts'

export type Dish = { id: string; name: string; kind: 'veg' | 'salad' | 'soup' | 'dip' | 'drink'; page: number; cardKcal: number; method: string; items: { name: string; grams: number }[] }
/** Filled at start-up from src/data/coach-recipes.json (db.ts), the way the world food table is. */
export const DISHES: Dish[] = []
export function setDishes(rows: Dish[]) { DISHES.length = 0; DISHES.push(...rows) }

/** The parts of a meal that are not the dish: protein, the morning fat and the fibre drink stay when a dish is swapped. */
export const BASE = /^(whey|egg white|ghee|chia seeds|psyllium husk|black coffee)/i

export const kcalOf = (items: { name: string; grams: number | null }[]) =>
  Math.round(items.reduce((t, i) => t + (nutrition(i.name, i.grams)?.kcal ?? 0), 0))

/** The dish a meal is, found from its name ("Whey shake + Broccoli saag (0.75 serving)"). */
export function dishOf(mealName: string): Dish | null {
  return DISHES.filter(d => mealName.includes(d.name)).sort((a, b) => b.name.length - a.name.length)[0] ?? null
}

/** The part of a meal's items that is the dish (not whey, egg whites, ghee or the fibre drink). */
export const dishItems = <T extends { name: string }>(items: T[]) => items.filter(i => !BASE.test(i.name))

/** The serving that keeps about the same calories as what is being replaced, in quarters from half to one and a quarter. */
export function servingFor(dish: Dish, targetKcal: number) {
  const full = kcalOf(dish.items)
  if (!full || !targetKcal) return 1
  return Math.min(1.25, Math.max(0.5, Math.round((targetKcal / full) * 4) / 4))
}

const scaled = (dish: Dish, serving: number) =>
  dish.items.map(i => { const g = i.grams * serving; return { name: i.name, grams: g < 10 ? Math.max(0.5, Math.round(g * 2) / 2) : Math.round(g) } })

/** A meal with its dish replaced: the kept parts stay, the new dish's foods follow, the name and method follow the dish. */
export function swapDish<T extends { name: string; grams: number | null }>(meal: { name: string; items: T[] }, dish: Dish, serving: number) {
  const kept = meal.items.filter(i => BASE.test(i.name))
  const base = /^whey/i.test(meal.name) ? 'Whey shake + ' : ''
  const tail = /then fibre drink/i.test(meal.name) ? ', then fibre drink' : ''
  const name = `${base}${dish.name}${serving === 1 ? '' : ` (${serving} serving)`}${tail}`
  const keptFirst = kept.filter(i => !/^(chia seeds|psyllium husk)/i.test(i.name)), fibre = kept.filter(i => /^(chia seeds|psyllium husk)/i.test(i.name))
  return { name, method: dish.method, items: { before: keptFirst, dish: scaled(dish, serving), after: fibre } }
}

/** Dishes of the same kind, nearest in calories first, other than the one in the meal. */
export function alternatives(meal: { name: string; items: { name: string; grams: number | null }[] }, kindHint?: Dish['kind']) {
  const cur = dishOf(meal.name)
  const kind = cur?.kind ?? kindHint ?? 'veg'
  const target = kcalOf(dishItems(meal.items))
  return DISHES.filter(d => d.id !== cur?.id && (kind === 'soup' ? d.kind === 'soup' : d.kind !== 'soup'))
    .map(d => ({ dish: d, serving: servingFor(d, target) }))
    .sort((a, b) => Math.abs(kcalOf(scaled(a.dish, a.serving)) - target) - Math.abs(kcalOf(scaled(b.dish, b.serving)) - target))
}

/** Vegetables that can stand in for one another, same grams, when one is not available. All are on the coach's V1 list. */
const GROUPS: string[][] = [
  ['spinach', 'bok choy', 'lettuce', 'cabbage', 'celery'],
  ['broccoli', 'cauliflower', 'brussels sprouts', 'cabbage'],
  ['zucchini', 'white pumpkin', 'cucumber', 'bok choy'],
  ['carrot', 'beetroot'],
  ['french beans', 'asparagus', 'broccoli', 'zucchini'],
  ['onion', 'spring onion'],
  ['mint', 'coriander leaves', 'parsley', 'basil'],
  ['olive oil', 'ghee', 'butter', 'coconut oil', 'sesame oil', 'mustard oil'],
  ['lime juice', 'lemon juice', 'apple cider vinegar'],
]
export function substitutes(food: string): string[] {
  const k = food.trim().toLowerCase()
  return [...new Set(GROUPS.filter(g => g.includes(k)).flatMap(g => g).filter(x => x !== k))]
}

/** The fats and oils that stand in for one another, with the calories kept the same: the same kcal in a different fat means a different weight. */
const OILS = ['olive oil', 'ghee', 'butter', 'coconut oil', 'sesame oil', 'mustard oil']
const kcalPerG = (name: string) => (nutrition(name, 100)?.kcal ?? 0) / 100
/** The grams of `to` that carry the same kcal as `grams` of `from`, to the half gram. Foods that are not both fats or oils keep their grams. */
export function swapGrams(from: string, to: string, grams: number | null): number | null {
  const a = from.trim().toLowerCase(), b = to.trim().toLowerCase()
  if (grams == null || !OILS.includes(a) || !OILS.includes(b) || !kcalPerG(a) || !kcalPerG(b)) return grams
  return Math.max(0.5, Math.round((grams * kcalPerG(a) / kcalPerG(b)) * 2) / 2)
}
