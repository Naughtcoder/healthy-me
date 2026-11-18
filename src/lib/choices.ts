// What a V1 meal can be instead of what is planned, for the meal card's picker.
// Every meal has a role (the morning fat, a protein, a vegetable dish, a protein with a dish,
// the fibre drink); the role decides what the picker offers. Nothing is stored: the card reads
// the meal it is given, works out the choices, and hands back the new name, method and foods.
import { nutrition } from './meals.ts'
import { DISHES, dishItems, dishOf, kcalOf, servingFor, swapGrams, type Dish } from './recipes.ts'

export type Role = 'fat' | 'protein' | 'dish' | 'combo' | 'fibre'
export type Line = { name: string; grams: number }
export type Built = { name: string; method: string; items: Line[] }
export type Sel = { dish?: string; serving?: number; protein?: 'whey' | 'egg'; vehicle?: string; fat?: string }

export const SERVINGS = [0.5, 0.75, 1, 1.25]
/** What the first-thing fat goes into (the coach: ghee, butter or coconut oil, "can go in black coffee"; green tea is on her list of 3 a day). */
export const VEHICLES = ['black coffee', 'green tea', 'black tea (no milk, no sugar)', 'warm water']
/** 1 tbsp is 13 g of each: 117, 101 and 113 kcal, the numbers on the coach's V1 card. */
export const FATS = ['ghee', 'butter', 'olive oil', 'coconut oil']
const FAT_G = 13

const PROTEIN: Record<'whey' | 'egg', { label: string; items: Line[]; method: string }> = {
  whey: { label: 'Whey shake', items: [{ name: 'whey isolate', grams: 30 }], method: 'Mix 30 g whey isolate in 200 ml water.' },
  egg: { label: '4 boiled egg whites', items: [{ name: 'egg white', grams: 132 }], method: 'Boil the eggs hard, peel and eat only the whites. Salt and pepper.' },
}
const FIBRE: Built = {
  name: 'Fibre drink (chia and husk)',
  method: 'Stir 1 tsp chia seeds (5 g) and 2 tsp psyllium husk (8 g) into 350 ml water and drink at once.',
  items: [{ name: 'chia seeds', grams: 5 }, { name: 'psyllium husk', grams: 8 }],
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const hasWord = (items: { name: string }[], re: RegExp) => items.some(i => re.test(i.name))

export function roleOf(meal: { name: string; items: { name: string }[] }): Role | null {
  const it = meal.items
  if (!it.length) return null
  if (hasWord(it, /^(chia seeds|psyllium husk)/i) && it.every(i => /^(chia seeds|psyllium husk)/i.test(i.name))) return 'fibre'
  if (it.length === 1 && FATS.includes(it[0].name.toLowerCase())) return 'fat'
  const dish = dishItems(it)
  if (!dish.length) return it.every(i => /^(whey|egg white)/i.test(i.name)) ? 'protein' : null
  return hasWord(it, /^(whey|egg white)/i) ? 'combo' : 'dish'
}

const servingIn = (name: string) => Number(/\(([\d.]+) serving\)/.exec(name)?.[1] ?? 1)
const proteinIn = (items: { name: string }[]): 'whey' | 'egg' | undefined =>
  hasWord(items, /^whey/i) ? 'whey' : hasWord(items, /^egg white/i) ? 'egg' : undefined

/** What is picked now in a meal, read from its name and foods. */
export function selectionOf(meal: { name: string; items: { name: string }[] }): Sel {
  const role = roleOf(meal)
  if (role === 'fat') return { fat: meal.items[0].name.toLowerCase(), vehicle: / in (.+)$/i.exec(meal.name)?.[1]?.toLowerCase() ?? VEHICLES[0] }
  if (role === 'protein') return { protein: proteinIn(meal.items) }
  if (role === 'dish' || role === 'combo') return { dish: dishOf(meal.name)?.id, serving: servingIn(meal.name), protein: proteinIn(meal.items) }
  return {}
}

const scaled = (d: Dish, s: number): Line[] =>
  d.items.map(i => { const g = i.grams * s; return { name: i.name, grams: g < 10 ? Math.max(0.5, Math.round(g * 2) / 2) : Math.round(g) } })

/** The meal a selection makes. */
export function build(role: Role, sel: Sel): Built {
  if (role === 'fibre') return FIBRE
  if (role === 'fat') {
    const fat = sel.fat ?? 'ghee', vehicle = sel.vehicle ?? VEHICLES[0]
    // The same kcal whichever fat: 13 g of ghee is 117 kcal, so butter is a little more and coconut oil a little more than the coach's flat tablespoon.
    const g = swapGrams('ghee', fat, FAT_G) ?? FAT_G
    return { name: `${cap(fat)} in ${vehicle}`, items: [{ name: fat, grams: g }],
      method: `Stir ${g} g ${fat} (about 1 tbsp) into a cup of ${vehicle}, first thing, on an empty stomach.` }
  }
  if (role === 'protein') { const p = PROTEIN[sel.protein ?? 'egg']; return { name: p.label, items: p.items, method: p.method } }
  const dish = DISHES.find(d => d.id === sel.dish)!, serving = sel.serving ?? 1
  const dishName = `${dish.name}${serving === 1 ? '' : ` (${serving} serving)`}`
  if (role === 'combo') {
    const p = PROTEIN[sel.protein ?? 'whey']
    return { name: `${p.label} + ${dishName}`, items: [...p.items, ...scaled(dish, serving)], method: `${p.method}\n\n${dish.method}` }
  }
  return { name: dishName, items: scaled(dish, serving), method: dish.method }
}

/** The current recipe for a meal built from the recipe library, so a meal saved earlier shows today's wording. Null when it is not one. */
export function recipeFor(meal: { name: string; items: { name: string }[] }): string | null {
  const role = roleOf(meal)
  if (role !== 'dish' && role !== 'combo') return null
  const sel = selectionOf(meal)
  return sel.dish ? build(role, sel).method : null
}

/** The id of the meal as planned, when it is not one of the recipe dishes. */
export const CURRENT = '__current'
export type Choice = { id: string; label: string; sub: string; kcal: number; p: number; sel: Sel; blocked: boolean }
const proteinOf = (items: Line[]) => Math.round(items.reduce((t, i) => t + (nutrition(i.name, i.grams)?.p ?? 0), 0))

/** The lightest version of a meal that keeps its dish: half a serving, with egg whites for the whey. Fixed meals stay as they are. */
export function lightest(meal: { name: string; items: { name: string; grams: number | null }[] }): Built | null {
  const role = roleOf(meal)
  if (role === 'dish' || role === 'combo') { const sel = selectionOf(meal); if (!sel.dish) return null; return build(role, { ...sel, serving: SERVINGS[0], protein: role === 'combo' ? 'egg' : sel.protein }) }
  return null
}
/** What a meal costs at its lightest, or what it costs now when it cannot be made lighter. */
export const minKcal = (meal: { name: string; items: { name: string; grams: number | null }[] }) => kcalOf((lightest(meal) ?? meal).items)

/** One notch lighter: the next smaller serving, then egg whites for whey. Null when there is nothing lighter. */
export function stepDown(meal: { name: string; items: { name: string; grams: number | null }[] }): Built | null {
  const role = roleOf(meal)
  if (role !== 'dish' && role !== 'combo') return null
  const sel = selectionOf(meal), serving = sel.serving ?? 1
  if (!sel.dish) return null
  const lower = [...SERVINGS].reverse().find(v => v < serving)
  if (lower != null) return build(role, { ...sel, serving: lower })
  if (role === 'combo' && sel.protein === 'whey') return build(role, { ...sel, protein: 'egg' })
  return null
}

/** The picker's list for a meal: the choices for the main part, nearest in calories first, and a small second row for the part that varies with it.
 *  `room` is the most this meal may come to without making the day impossible to finish under the ceiling; a choice above it is
 *  shrunk to a smaller serving if that helps, and marked blocked if it cannot fit. */
export function choicesFor(meal: { name: string; items: { name: string; grams: number | null }[] }, room = Infinity) {
  const role = roleOf(meal)
  if (!role) return null
  const sel = selectionOf(meal)
  const make = (id: string, label: string, sub: string, next: Sel): Choice => {
    let n = next
    if ((role === 'dish' || role === 'combo') && n.serving != null) {
      // Largest serving at or below the wanted one that fits the room.
      for (const v of [...SERVINGS].reverse().filter(v => v <= n.serving!)) { n = { ...next, serving: v }; if (kcalOf(build(role, n).items) <= room) break }
    }
    const b = build(role, n), kcal = kcalOf(b.items)
    const serving = n.serving != null ? `${n.serving === 1 ? '1 serving' : `${n.serving} serving`}` : ''
    return { id, label, sub: [serving, sub].filter(Boolean).join(' · '), kcal, p: proteinOf(b.items), sel: n, blocked: kcal > room }
  }
  let main: Choice[] = [], second: { label: string; choices: Choice[]; current: string } | null = null, current = ''
  if (role === 'fat') {
    main = VEHICLES.map(v => make(v, cap(v), `with ${sel.fat}`, { ...sel, vehicle: v })); current = sel.vehicle!
    second = { label: 'Fat', current: sel.fat!, choices: FATS.map(f => make(f, cap(f), '', { ...sel, fat: f })) }
  } else if (role === 'protein') {
    main = (['whey', 'egg'] as const).map(k => make(k, PROTEIN[k].label, '', { protein: k })); current = sel.protein ?? ''
  } else if (role === 'dish' || role === 'combo') {
    const target = kcalOf(dishItems(meal.items)), now = kcalOf(meal.items)
    main = DISHES.map(d => make(d.id, d.name, d.kind, { ...sel, dish: d.id, serving: d.id === sel.dish ? sel.serving! : servingFor(d, target) }))
      .sort((a, b) => (a.id === sel.dish ? -1 : b.id === sel.dish ? 1 : Number(a.blocked) - Number(b.blocked) || Math.abs(a.kcal - now) - Math.abs(b.kcal - now)))
    current = sel.dish ?? CURRENT
    // A meal that is not one of the recipe dishes stays as the first choice, as planned; the dishes follow.
    if (!sel.dish) main.unshift({ id: CURRENT, label: meal.name, sub: 'as planned', kcal: now, p: proteinOf(meal.items as Line[]), sel, blocked: false })
    else if (role === 'combo') second = { label: 'Protein', current: sel.protein ?? 'whey', choices: (['whey', 'egg'] as const).map(k => make(k, PROTEIN[k].label, '', { ...sel, protein: k })) }
  }
  return { role, sel, main, current, second }
}
