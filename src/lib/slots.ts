// The meal card's choices, decided by the time slot on the coach's V1 card (the "Reintroduction Diet, Wash-off Phase"):
// 8 AM a tablespoon of healthy fat, 10 AM / 2 PM / 6 PM a protein meal, 12 PM / 4 PM a vegetable meal, 8 PM the fibre drink.
// The options come from the coach's recipe book (src/data/coach-recipes.json) and from the older 14-day plan
// (src/data/my-recipes.json). Nothing is stored: the card asks for the options and applies the one picked.
import type { Slot } from './core.ts'
import { nutrition } from './meals.ts'
import { DISHES, kcalOf, servingFor, type Dish } from './recipes.ts'
import { SERVINGS, FATS, VEHICLES, build, choicesFor, roleOf, type Built, type Line } from './choices.ts'

export type Grid = 'fat' | 'protein' | 'veg' | 'fibre'
const GRID: [string, Grid][] = [['08:00', 'fat'], ['10:00', 'protein'], ['12:00', 'veg'], ['14:00', 'protein'], ['16:00', 'veg'], ['18:00', 'protein'], ['20:00', 'fibre']]
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/** The two meals that share one dish, cooked once and eaten twice: 12 and 2 PM (lunch, and the 2 PM dish card), 4 and 6 PM (the 4 PM card, and the 6 PM dish card). */
export const PARTNER: Record<string, Slot> = { lunch: 'snack5', snack5: 'lunch', snack3: 'snack6', snack6: 'snack3' }
/** A dish's name as shown: the coach's portion suffix is an internal scaling detail, never shown. */
export const plain = (name: string) => name.replace(/\s*\([\d.]+ serving\)\s*/g, '').trim()
export const dishBase = (name: string) => name.replace(/\s*\([\d.]+ serving\)\s*/g, '').trim().toLowerCase()

/** The slot a meal is picked from: its time, except that a vegetable dish is always a vegetable-meal pick (it sits at the same time as its whey shake, as its own card). */
export function gridFor(meal: { name: string; items: { name: string }[] }, time: string | null | undefined, slot?: string): Grid | null {
  const role = roleOf(meal)
  return role === 'dish' || (slot && ['snack5', 'snack6'].includes(slot) && role !== 'protein') ? 'veg' : gridOf(time)
}

/** Which slot of the coach's day a planned time belongs to: the nearest of the seven, within 45 minutes, else none. */
export function gridOf(time: string | null | undefined): Grid | null {
  if (!time) return null
  const best = GRID.map(([t, g]) => ({ d: Math.abs(mins(t) - mins(time)), g })).sort((a, b) => a.d - b.d)[0]
  return best.d <= 45 ? best.g : null
}

type Mine = { id: string; name: string; group: 'egg' | 'soup' | 'salad' | 'airfried' | 'wheyveg' | 'wheysoup'; method: string; items: Line[] }
export const MINE: Mine[] = []
export const SHAKES: Dish[] = []
export function setMine(rows: Mine[]) { MINE.length = 0; MINE.push(...rows) }
export function setShakes(rows: Dish[]) { SHAKES.length = 0; SHAKES.push(...rows) }
export const DRINKS: Dish[] = []
export function setDrinks(rows: Dish[]) { DRINKS.length = 0; DRINKS.push(...rows) }

export type Opt = { id: string; group: string; label: string; sub: string; kcal: number; p: number; blocked: boolean; why?: 'kcal' | 'egg'; built: Built }
/** One egg-based meal a day: a choice made of egg whites is blocked once another meal that day has them. */
export const hasEgg = (items: { name: string }[]) => items.some(i => /^egg/i.test(i.name))
export type Picker = { grid: Grid; options: Opt[]; current: string; servings: Opt[] | null; second: { label: string; current: string; options: Opt[] } | null }
export const CURRENT = '__current'

const WHEY: Line = { name: 'whey isolate', grams: 30 }
const WHEY_WATER = 'Shake: mix 30 g whey isolate in 200 ml water and drink.'
const proteinOf = (items: Line[]) => Math.round(items.reduce((t, i) => t + (nutrition(i.name, i.grams)?.p ?? 0), 0))
const scaled = (items: Line[], s: number): Line[] => items.map(i => { const g = i.grams * s; return { name: i.name, grams: g < 10 ? Math.max(0.5, Math.round(g * 2) / 2) : Math.round(g) } })
const norm = (s: string) => s.toLowerCase().replace(/\s*\([\d.]+ serving\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
const servingIn = (name: string) => Number(/\(([\d.]+) serving\)/.exec(name)?.[1] ?? 1)
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/** `fixed` is the part that does not scale with the serving (the whey); `alias` is another name a planned meal may carry for the same thing. */
type Source = { id: string; group: string; name: string; sub: string; items: Line[]; method: string; scalable: boolean; fixed?: Line[]; alias?: string[] }

function sources(grid: Grid): Source[] {
  const dishes = DISHES.filter(d => d.kind !== ('shake' as string))
  if (grid === 'veg') return [
    ...dishes.filter(d => d.kind !== 'soup').map(d => ({ id: `d:${d.id}`, group: d.kind === 'dip' ? 'the coach dressings and chutneys' : 'the coach recipes', name: d.name, sub: d.kind === 'dip' ? 'dip with veg sticks' : d.kind, items: d.items, method: d.method, scalable: true })),
    ...dishes.filter(d => d.kind === 'soup').map(d => ({ id: `d:${d.id}`, group: 'the coach soups', name: d.name, sub: 'soup', items: d.items, method: d.method, scalable: true })),
    ...MINE.filter(m => m.group === 'salad' || m.group === 'soup' || m.group === 'airfried')
      .map(m => ({ id: `m:${m.id}`, group: 'My suggestions', name: m.name, sub: m.group === 'airfried' ? 'air-fried' : m.group, items: m.items, method: m.method, scalable: true })),
    ...DRINKS.map(d => ({ id: `dr:${d.id}`, group: 'the coach drinks', name: d.name, sub: 'drink', items: d.items, method: d.method, scalable: false })),
  ]
  if (grid === 'protein') return [
    { id: 'p:whey', group: 'Whey', name: 'Whey shake', sub: '1 scoop in 200 ml water', items: [WHEY], method: WHEY_WATER, scalable: false },
    { id: 'p:egg', group: 'Egg whites', name: '4 boiled egg whites', sub: '', items: [{ name: 'egg white', grams: 132 }], method: 'Boil the eggs hard, peel and eat only the whites. Salt and pepper.', scalable: false },
    ...MINE.filter(m => m.group === 'egg').map(m => ({ id: `m:${m.id}`, group: 'Egg whites', name: m.name, sub: '4 egg whites', items: m.items, method: m.method, scalable: false })),
    ...SHAKES.map(d => ({ id: `s:${d.id}`, group: 'the coach protein shakes', name: d.name, sub: 'the coach recipe', items: d.items, method: d.method, scalable: false })),
    // Every the coach dish can be the vegetable part of a protein meal: the whey stays 30 g and the serving scales the dish.
    ...dishes.filter(d => d.kind !== 'soup').map(d => ({ id: `wd:${d.id}`, group: 'Whey shake + the coach recipe', name: `Whey shake + ${d.name}`, sub: d.kind, fixed: [WHEY],
      items: d.items, method: `${WHEY_WATER}\n\n${d.method}`, scalable: true })),
    ...dishes.filter(d => d.kind === 'soup').map(d => ({ id: `ws:${d.id}`, group: 'Whey with soup', name: `${d.name} with whey`, sub: 'whey blended in', fixed: [WHEY], alias: [`Whey shake + ${d.name}`],
      items: d.items, method: `${d.method}\nThen: blend 30 g whey isolate with a little water and stir it into the warm (not boiling) soup.`, scalable: true })),
    // My own salads, soups and air-fried dishes can be the vegetable part of a whey meal too.
    ...MINE.filter(m => m.group === 'salad' || m.group === 'soup' || m.group === 'airfried').map(m => ({ id: `mw:${m.id}`, group: 'Whey shake + my suggestion', name: `Whey shake + ${m.name}`, sub: m.group === 'airfried' ? 'air-fried' : m.group, fixed: [WHEY],
      items: m.items, method: `${WHEY_WATER}\n\n${m.method}`, scalable: true })),
    ...MINE.filter(m => m.group === 'wheysoup').map(m => ({ id: `m:${m.id}`, group: 'Whey with soup', name: m.name, sub: '', items: m.items, method: m.method, scalable: false })),
    ...MINE.filter(m => m.group === 'wheyveg').map(m => ({ id: `m:${m.id}`, group: 'Whey with vegetables', name: m.name, sub: '', items: m.items, method: m.method, scalable: false })),
  ]
  return []
}

/** The picker for a meal in a slot of the coach's day. `room` is the most this meal may come to and still leave the rest of the day under the ceiling. */
export function pickerFor(meal: { name: string; items: { name: string; grams: number | null }[] }, grid: Grid, room = Infinity, eggElsewhere = false): Picker {
  const now = kcalOf(meal.items)
  const mk = (id: string, group: string, label: string, sub: string, built: Built): Opt => {
    const kcal = kcalOf(built.items)
    return { id, group, label, sub: [sub, `${kcal} kcal`, `${proteinOf(built.items)} g protein`].filter(Boolean).join(' · '), kcal, p: proteinOf(built.items), blocked: kcal > room || (eggElsewhere && hasEgg(built.items)), why: kcal > room ? 'kcal' : 'egg', built }
  }
  if (grid === 'fibre') {
    const b = build('fibre', {})
    return { grid, options: [mk('fibre', '', b.name, '', b)], current: 'fibre', servings: null, second: null }
  }
  if (grid === 'fat') {
    const cur = /^(\w+(?: \w+)?) in (.+)$/i.exec(meal.name)
    const vehicle = cur?.[2].toLowerCase() ?? VEHICLES[0]
    const fat = FATS.find(f => meal.items.some(i => i.name.toLowerCase() === f)) ?? 'ghee'
    const options = VEHICLES.map(v => mk(`v:${v}`, '', cap(v), `with ${fat}`, build('fat', { fat, vehicle: v })))
    const second = { label: 'Fat', current: fat, options: FATS.map(f => mk(`f:${f}`, '', cap(f), '', build('fat', { fat: f, vehicle }))) }
    const current = VEHICLES.includes(vehicle) ? `v:${vehicle}` : CURRENT
    if (current === CURRENT) options.unshift(mk(CURRENT, '', meal.name, 'as planned', { name: meal.name, method: '', items: meal.items.map(i => ({ name: i.name, grams: i.grams ?? 0 })) }))
    return { grid, options, current, servings: null, second }
  }
  // protein and vegetable slots
  // A card that is only a protein (whey, egg whites) is picked from protein things only: its vegetable dish is its own card beside it.
  const proteinOnly = grid === 'protein' && roleOf(meal) === 'protein'
  const wheyVeg = (id: string) => MINE.some(x => `m:${x.id}` === id && (x.group === 'wheyveg' || x.group === 'wheysoup'))
  const list = sources(grid).filter(s => !proteinOnly || !(s.id.startsWith('wd:') || s.id.startsWith('ws:') || s.id.startsWith('mw:') || wheyVeg(s.id)))
  const here = norm(meal.name)
  let current = list.find(s => norm(s.name) === here || s.alias?.some(a => norm(a) === here))?.id ?? CURRENT
  const curSrc = list.find(s => s.id === current)
  const fit = (s: Source, want: number): { items: Line[]; serving: number } => {
    if (!s.scalable) return { items: s.items, serving: 1 }
    const make = (v: number) => [...(s.fixed ?? []), ...scaled(s.items, v)]
    for (const v of [...SERVINGS].reverse().filter(v => v <= want)) { const items = make(v); if (kcalOf(items) <= room) return { items, serving: v } }
    return { items: make(SERVINGS[0]), serving: SERVINGS[0] }
  }
  const options: Opt[] = list.map(s => {
    const want = s.id === current ? servingIn(meal.name) : s.scalable ? servingFor({ items: s.items } as Dish, now - kcalOf(s.fixed ?? [])) : 1
    const { items, serving } = fit(s, want)
    const name = `${s.name}${serving === 1 ? '' : ` (${serving} serving)`}`
    return mk(s.id, s.group, s.name, [s.sub, serving === 1 ? '' : `${serving} serving`].filter(Boolean).join(' · '), { name, method: s.method, items })
  })
  for (const o of options) if (o.id === current && o.why === 'egg') o.blocked = false
  // Groups keep their order; inside a group the choices nearest in calories come first, those that do not fit last.
  const order = [...new Set(options.map(o => o.group))]
  options.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || Number(a.blocked) - Number(b.blocked) || Math.abs(a.kcal - now) - Math.abs(b.kcal - now))
  if (current === CURRENT) options.unshift({ id: CURRENT, group: '', label: meal.name, sub: [`${now} kcal`, `${proteinOf(meal.items as Line[])} g protein`, 'as planned'].join(' · '), kcal: now, p: proteinOf(meal.items as Line[]), blocked: false,
    built: { name: meal.name, method: '', items: meal.items.map(i => ({ name: i.name, grams: i.grams ?? 0 })) } })
  let servings: Opt[] | null = null
  if (curSrc?.scalable) servings = SERVINGS.map(v => ({ s: v, items: [...(curSrc.fixed ?? []), ...scaled(curSrc.items, v)] })).filter(x => x.s === servingIn(meal.name) || kcalOf(x.items) <= room)
    .map(x => mk(`sv:${x.s}`, '', String(x.s), '', { name: `${curSrc.name}${x.s === 1 ? '' : ` (${x.s} serving)`}`, method: curSrc.method, items: x.items }))
  return { grid, options, current, servings, second: null }
}

/** For a meal whose time is not on the coach's grid: the picker from what the meal contains, in the same shape. */
export function pickerFromContent(meal: { name: string; items: { name: string; grams: number | null }[] }, room = Infinity): Picker | null {
  const c = choicesFor(meal, room)
  if (!c) return null
  const opt = (o: { id: string; label: string; sub: string; kcal: number; p: number; blocked: boolean; sel: any }): Opt => {
    const built = o.id === CURRENT ? { name: meal.name, method: '', items: meal.items.map(i => ({ name: i.name, grams: i.grams ?? 0 })) } : build(c.role, o.sel)
    return { id: o.id, group: '', label: o.label, sub: [o.sub, `${o.kcal} kcal`, `${o.p} g protein`].filter(Boolean).join(' · '), kcal: o.kcal, p: o.p, blocked: o.blocked, built }
  }
  const servings = (c.role === 'dish' || c.role === 'combo') && c.current !== CURRENT
    ? SERVINGS.map(v => ({ id: `sv:${v}`, label: String(v), sub: '', kcal: 0, p: 0, blocked: false, sel: { ...c.sel, serving: v } })).filter(o => o.sel.serving === c.sel.serving || kcalOf(build(c.role, o.sel).items) <= room).map(opt) : null
  return { grid: c.role === 'fat' ? 'fat' : c.role === 'fibre' ? 'fibre' : c.role === 'protein' ? 'protein' : 'veg', options: c.main.map(opt), current: c.current, servings,
    second: c.second ? { label: c.second.label, current: c.second.current, options: c.second.choices.map(opt) } : null }
}
