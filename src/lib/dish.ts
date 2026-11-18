// "I made spinach onion sag with 160 g palak, 90 g onions and 22 and a half ml of ghee, half a
// teaspoon of turmeric ..." -> a dish name and its ingredients in grams, ready for a meal card.
// This is the plain, offline reader. vision.ts readDish() asks the model first; its answer goes
// through the same amount conversion (toItems), and this reader is the fallback and the check.
import { lookup, macrosOf, searchFoods } from './foods.ts'
import { nutrition, type MealItem } from './meals.ts'

export type DishItem = { name: string; grams: number | null; ml: number | null }
export type Dish = { name: string; items: DishItem[] }
/** One amount as said: a number and the unit it was said in. */
export type Said = { food: string; amount: number | null; unit: string }

const ALIAS: Record<string, string> = {
  palak: 'spinach', sag: 'spinach', saag: 'spinach', methi: 'fenugreek leaves', pyaz: 'onion', pyaaz: 'onion', haldi: 'turmeric',
  jeera: 'cumin seeds', cumin: 'cumin seeds', mirch: 'pepper', 'black pepper': 'pepper', dhania: 'coriander leaves', coriander: 'coriander leaves',
  'amchoor': 'amchur', 'mango powder': 'amchur', 'dry mango powder': 'amchur', 'turmeric powder': 'turmeric', 'haldi powder': 'turmeric',
  'lemon': 'lemon juice', 'lime': 'lime juice', 'cauliflower florets': 'cauliflower', 'green beans': 'french beans', beans: 'french beans',
  'cottage cheese': 'paneer', 'clarified butter': 'ghee', oil: 'olive oil', 'cooking oil': 'olive oil',
}
const OILS = /\b(ghee|oil|butter)\b/i
const UNIT_RE = '(kg|kilograms?|g|gm|gms|grams?|ml|millilitres?|milliliters?|litres?|liters?|tsp|teaspoons?|tbsp|tablespoons?|cups?|katoris?|bowls?|pinch(?:es)?|handfuls?)'

/** Grams in one teaspoon, by what it is. Spices are light, salt and sugar heavier, fats in between. */
export function teaspoonGrams(name: string): number {
  if (/\bsalt\b/i.test(name)) return 6
  if (/\bsugar|jaggery\b/i.test(name)) return 4
  if (OILS.test(name)) return 4.5
  if (/\b(turmeric|amchur|pepper|hing|garam masala|chaat masala|powder)\b/i.test(name)) return 2.5
  if (/\bseeds?\b/i.test(name)) return 3
  return 3
}

/** Spoken numbers to digits: "half a teaspoon", "22 and a half ml", "one and a half", "1/2". */
export function numbersToDigits(s: string): string {
  let t = ` ${s.toLowerCase()} `
  t = t.replace(/(\d+(?:\.\d+)?)\s+and\s+a\s+half\b/g, (_m, n) => ` ${Number(n) + 0.5} `)
  t = t.replace(/\b(one|a)\s+and\s+a\s+half\b/g, ' 1.5 ')
  t = t.replace(/\b(\d+)\s*\/\s*(\d+)\b/g, (_m, a, b) => ` ${Number(a) / Number(b)} `)
  t = t.replace(/\b(half|a half)\s+(?:a|an|of a)?\s*/g, ' 0.5 ')
  t = t.replace(/\b(a quarter|quarter|one quarter)\s+(?:of\s+)?(?:a\s+)?/g, ' 0.25 ')
  t = t.replace(/\b(three quarters?)\s+(?:of\s+)?(?:a\s+)?/g, ' 0.75 ')
  const W: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
  t = t.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b(?=\s+(?:tsp|teaspoons?|tbsp|tablespoons?|cups?|katoris?|bowls?|pinch|handfuls?|g|grams?|ml)\b)/g, (_m, w) => ` ${W[w]} `)
  return t.replace(/\s+/g, ' ').trim()
}

const NOISE = /\b(hey|claude|i|we|have|had|just|made|cooked|prepared|today|yesterday|tonight|this morning|for lunch|for dinner|for breakfast|about|around|approximately|roughly|some|the|my|used|using|added|put|in it)\b/gi

/** The dish's name and the ingredient phrases, from one sentence. */
function split(text: string): { name: string; parts: string[] } {
  const t = numbersToDigits(text.replace(/[.!?]+(\s|$)/g, '$1').replace(/(\d),(\d{3})\b/g, '$1$2'))
  const m = /\b(?:made|cooked|prepared|had|ate|eaten)\s+(?:a|an|some|the)?\s*(.+?)\s+(?:today\s+|just now\s+|for \w+\s+)?(?:with|using|from|which has|that has|containing)\b\s*(.*)$/i.exec(t)
  const rawName = m ? m[1] : ''
  const rest = m ? m[2] : t
  const name = rawName.replace(NOISE, ' ').replace(/\s+/g, ' ').trim()
  const parts = rest.split(/\s*(?:,|\band\b|\bwith\b|\bplus\b|\balong with\b)\s*/i).map(x => x.trim()).filter(Boolean)
  return { name, parts }
}

/** One ingredient phrase: "160 grams of palak", "0.5 teaspoon of turmeric", "an onion". */
function ingredient(seg: string): Said | null {
  let s = ` ${seg.toLowerCase()} `
  if (/\bsorry\b/.test(s)) s = ` ${s.slice(s.indexOf('sorry') + 5)} `
  s = s.replace(NOISE, ' ').replace(/\s+/g, ' ')
  const u = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${UNIT_RE}\\b`).exec(s)
  let amount: number | null = null, unit = 'piece'
  if (u) { amount = Number(u[1].replace(',', '.')); unit = u[2]; s = s.replace(u[0], ' ') }
  else {
    const c = /\b(\d+(?:\.\d+)?)\b/.exec(s)
    if (c) { amount = Number(c[1]); s = s.replace(c[0], ' ') }
  }
  const food = s.replace(/\b(of|a|an|and|about|little|pinch|bit|more|extra)\b/g, ' ').replace(/[^a-z0-9 &'-]/g, ' ').replace(/\s+/g, ' ').trim()
  if (food.length < 2) return null
  return { food, amount, unit }
}

/** The best known name for what was said: aliases (palak is spinach), plural to singular, then the food tables. */
export function canonical(said: string): string {
  const k = said.toLowerCase().trim()
  if (ALIAS[k]) return ALIAS[k]
  const sing = k.endsWith('ies') ? `${k.slice(0, -3)}y` : k.replace(/(?<!s)s$/, '')
  for (const c of [k, sing]) {
    if (ALIAS[c]) return ALIAS[c]
    if (lookup(c) && !lookup(c)!.guessed) return c
  }
  const hit = searchFoods(sing, 1)[0]
  return hit ?? k
}

/** An amount said in some unit, as grams or millilitres. Oils and ghee in millilitres become grams (0.91 g a ml), so the numbers match the table. */
export function amountOf(food: string, amount: number | null, unit: string): { grams: number | null; ml: number | null } {
  if (amount == null) return { grams: null, ml: null }
  const u = unit.toLowerCase()
  const tsp = teaspoonGrams(food)
  if (/^(kg|kilogram)/.test(u)) return { grams: amount * 1000, ml: null }
  if (/^(g|gm|gms|gram)/.test(u)) return { grams: amount, ml: null }
  if (/^(ml|millilit)/.test(u)) return OILS.test(food) ? { grams: Math.round(amount * 0.91 * 10) / 10, ml: null } : { grams: null, ml: amount }
  if (/^(l|lit)/.test(u)) return { grams: null, ml: amount * 1000 }
  if (/^(tsp|teaspoon)/.test(u)) return { grams: Math.round(amount * tsp * 10) / 10, ml: null }
  if (/^(tbsp|tablespoon)/.test(u)) return { grams: Math.round(amount * tsp * 3 * 10) / 10, ml: null }
  if (/^cup/.test(u)) return { grams: amount * 200, ml: null }
  if (/^(katori|bowl)/.test(u)) return { grams: amount * (u.startsWith('bowl') ? 250 : 150), ml: null }
  if (/^pinch/.test(u)) return { grams: Math.round(amount * 0.4 * 10) / 10, ml: null }
  if (/^handful/.test(u)) return { grams: amount * 30, ml: null }
  // A bare count ("2 onions"): a typical size.
  const each = /onion/.test(food) ? 100 : /tomato/.test(food) ? 100 : /garlic/.test(food) ? 3 : /chilli|chili/.test(food) ? 5 : /egg white/.test(food) ? 33 : /egg/.test(food) ? 50 : /lemon|lime/.test(food) ? 45 : null
  return { grams: each ? amount * each : null, ml: null }
}

/** Said amounts to meal ingredients, merging a food said twice. */
export function toItems(said: Said[]): DishItem[] {
  const out: DishItem[] = []
  for (const s of said) {
    const name = canonical(s.food)
    const a = amountOf(name, s.amount, s.unit)
    const same = out.find(o => o.name.toLowerCase() === name.toLowerCase())
    if (same) { same.grams = a.grams == null ? same.grams : (same.grams ?? 0) + a.grams; same.ml = a.ml == null ? same.ml : (same.ml ?? 0) + a.ml }
    else out.push({ name: name.charAt(0).toUpperCase() + name.slice(1), ...a })
  }
  return out
}

const titled = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s

/** The offline reader: name and ingredients from the sentence as typed or spoken. */
export function parseDish(text: string): Dish {
  const { name, parts } = split(text)
  const said = parts.map(ingredient).filter((x): x is Said => !!x)
  return { name: titled(name) || 'My dish', items: toItems(said) }
}

export type DishCard = {
  items: (DishItem & { p: number | null; kcal: number | null; carb: number | null; fat: number | null; unknown: boolean })[]
  p: number; kcal: number; carb: number; fat: number
  /** Foods the tables have no numbers for: the totals leave them out. */
  missing: string[]
}
/** What the dish adds up to. Carbohydrate and fat are estimates from the macro table; an ingredient missing there is named, not guessed. */
export function cardOf(items: DishItem[]): DishCard {
  const rows = items.map(i => {
    const n = nutrition(i.name, i.grams, i.ml)
    const m = macrosOf(i.name.toLowerCase(), i.grams)
    return { ...i, p: n?.p ?? null, kcal: n?.kcal ?? null, carb: m ? m.carb : null, fat: m ? m.fat : null, unknown: !n }
  })
  const sum = (k: 'p' | 'kcal' | 'carb' | 'fat') => Math.round(rows.reduce((a, r) => a + (r[k] ?? 0), 0) * 10) / 10
  return { items: rows, p: sum('p'), kcal: Math.round(sum('kcal')), carb: sum('carb'), fat: sum('fat'), missing: rows.filter(r => r.unknown).map(r => r.name) }
}

/** The dish as meal ingredients, ready for a meal card. */
export const asMealItems = (items: DishItem[]): MealItem[] =>
  items.map(i => ({ name: i.name, grams: i.grams, ml: i.ml, at: null, p: null, kcal: null, source: null }))

/** True when a name the model gave is something the person actually said: every word of it (or the word's alias, palak for spinach) is in the text. Keeps a model from adding a food nobody mentioned. */
export function saidIn(text: string, name: string): boolean {
  const t = ` ${text.toLowerCase()} `
  const words = name.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2 && !['with', 'and', 'the', 'fresh', 'chopped', 'powder'].includes(w))
  if (!words.length) return false
  return words.every(w => {
    const stem = w.replace(/(ies|es|s)$/, '')
    const aliases = Object.entries(ALIAS).filter(([, v]) => v.includes(w) || v.includes(stem)).map(([k]) => k)
    return [w, stem, ...aliases].some(x => x.length > 2 && t.includes(x))
  })
}

export type Allowance = {
  /** Grams of the adjustable ingredient that bring the dish to the target; 0 when the rest alone is already over. */
  grams: number
  /** The same in teaspoons, to the nearest half. */
  tsp: number
  /** The same in millilitres for ghee, oil and butter (0.91 g a ml); null for anything else. */
  ml: number | null
  /** What the dish comes to with that amount. */
  kcal: number
  /** What everything else in the dish comes to. */
  rest: number
  /** False when the other ingredients already use up the target, so no amount fits. */
  fits: boolean
}
/** How much of one ingredient (ghee, say) the dish can have so that all of it comes to `target` kcal, the other ingredients staying as they are. Null when the ingredient has no numbers. */
export function allowance(items: DishItem[], target: number, adjust: string): Allowance | null {
  const per = nutrition(adjust, 100, null)
  if (!per || per.kcal <= 0) return null
  const k = per.kcal / 100
  const rest = items.filter(i => i.name !== adjust).reduce((t, i) => t + (nutrition(i.name, i.grams, i.ml)?.kcal ?? 0), 0)
  const need = target - rest
  if (need <= 0) return { grams: 0, tsp: 0, ml: null, kcal: Math.round(rest), rest: Math.round(rest), fits: false }
  const raw = need / k
  const grams = Math.round(raw * 10) / 10   // a tenth of a gram
  const tsp = Math.round((grams / teaspoonGrams(adjust)) * 2) / 2
  const ml = OILS.test(adjust) ? Math.round((grams / 0.91) * 10) / 10 : null
  return { grams, tsp, ml, kcal: Math.round(rest + grams * k), rest: Math.round(rest), fits: true }
}
