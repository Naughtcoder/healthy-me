// Meal prep for a day or a few days: every ingredient of the meals still to eat, added up across meals and sorted by what you do with it,
// then the cooking steps meal by meal in time order. Pure, like builder.ts. Only planned meals cooked at home count; eaten and skipped ones are done.
import { dayRows, mealTime } from './builder.ts'
import { dishBase } from './slots.ts'
import { clock, type Plan } from './core.ts'
import { lookup } from './foods.ts'
import { recipeFor } from './choices.ts'
import type { Meal } from './meals.ts'

export type PrepLine = { name: string; grams: number; uses: string[] }
export type PrepCook = {
  day: string; slot: string; time: string; name: string; steps: string[]; items: { name: string; grams: number | null }[]
  /** Set when one dish is cooked once for two or more meals of the day: when each is eaten and how much of it, and how many servings to cook in all. */
  batch?: { eats: { time: string; serving: number }[]; servings: number }
}
export type PrepList = { cut: PrepLine[]; weigh: PrepLine[]; spice: PrepLine[]; cooks: PrepCook[]; meals: number; noAmounts: number }

/** Spices, salt, oils, ghee, stock and acids: measured into a small bowl, not weighed out or cut. */
const SPICE = /seeds?$|powder|peppercorn|paste|masala|salt|hing|asafoetida|curry leaves|bay leaf|star anise|cloves?$|cardamom|cinnamon|kalonji|jeera|oil$|ghee|butter|vinegar|juice|^pepper$|turmeric|amchur|oregano|herbs?$|stock|olives?$|ginger|garlic|jaggery/i
/** Vegetables and fruit that need washing and cutting. The food table decides too; these names cover what it does not list. */
const CUT = /beans|zucchini|pumpkin|gourd|cabbage|cauliflower|broccoli|carrot|cucumber|tomato|onion|shallot|capsicum|spinach|palak|methi|lettuce|mushroom|radish|beetroot|okra|bhindi|brinjal|eggplant|peas|corn|celery|coriander leaves|mint|kale|sprouts|lauki|tinda|turai|drumstick|raw mango|amla|gooseberry|tulsi|wheat grass|leek|asparagus|bok choy|pak choi|fennel|cress|rocket|arugula|moringa|sorrel|dill|parsley|avocado/i
/** Weighed out as they are: protein, whey, seeds that are a food, dairy, grains. */
const PLAIN_WEIGH = /egg|whey|paneer|tofu|chia|psyllium|flax|curd|yogurt|yoghurt|milk|chicken|fish|prawn|almond|walnut|oats|besan|quinoa|rice|dal$|lentil|chana|moong|rajma/i

export function kindOf(name: string, grams: number): 'cut' | 'weigh' | 'spice' {
  if (PLAIN_WEIGH.test(name)) return 'weigh'
  if (SPICE.test(name)) return 'spice'
  if (CUT.test(name) || lookup(name)?.group === 'veg') return 'cut'
  return grams <= 6 ? 'spice' : 'weigh'
}

/** The steps of a recipe as separate lines, without their numbers. */
export function stepsOf(note: string | null | undefined): string[] {
  return (note ?? '').split(/\n+/).map(s => s.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean)
}

export function prepList(plan: Plan, meals: Meal[]): PrepList {
  const days = [...new Set(meals.map(m => m.day))].sort()
  const multi = days.length > 1
  const cooks: PrepCook[] = []
  const bag = new Map<string, PrepLine & { kind: 'cut' | 'weigh' | 'spice' }>()
  let noAmounts = 0, count = 0
  for (const day of days) {
    const ofDay = meals.filter(m => m.day === day)
    for (const r of dayRows(plan, ofDay)) {
      const m = r.meal
      if (!m || m.state !== 'planned' || !m.cook || !m.items.length) continue
      count++
      const time = mealTime(plan, m)
      const label = `${multi ? `${day.slice(8)}/${day.slice(5, 7)} ` : ''}${clock(time)} ${m.name.replace(/\s*\(.*?serving\)/i, '')}`
      if (m.items.some(i => !i.grams)) noAmounts++
      for (const i of m.items) {
        if (!i.grams) continue
        const key = i.name.trim().toLowerCase()
        const cur = bag.get(key) ?? { name: i.name.trim(), grams: 0, uses: [], kind: kindOf(i.name, i.grams) }
        cur.grams += i.grams
        if (!cur.uses.includes(label)) cur.uses.push(label)
        bag.set(key, cur)
      }
      const steps = stepsOf(m.note ?? recipeFor(m))
      cooks.push({ day, slot: r.slot, time, name: m.name, steps, items: m.items.map(i => ({ name: i.name, grams: i.grams })) })
    }
  }
  // The same dish in two meals of a day is cooked once: one entry at the first time, with the amounts added up and each meal's share listed.
  const merged: PrepCook[] = []
  for (const c of cooks) {
    const twin = /^whey shake$/i.test(c.name.trim()) ? undefined : merged.find(x => x.day === c.day && dishBase(x.name) === dishBase(c.name))
    const serving = Number(/\(([\d.]+) serving\)/.exec(c.name)?.[1] ?? 1)
    if (!twin) { merged.push({ ...c, items: c.items.map(i => ({ ...i })) }); continue }
    twin.batch ??= { eats: [{ time: twin.time, serving: Number(/\(([\d.]+) serving\)/.exec(twin.name)?.[1] ?? 1) }], servings: 0 }
    twin.batch.eats.push({ time: c.time, serving })
    for (const i of c.items) { const same = twin.items.find(x => x.name.toLowerCase() === i.name.toLowerCase()); if (same) same.grams = (same.grams ?? 0) + (i.grams ?? 0); else twin.items.push({ ...i }) }
  }
  for (const c of merged) if (c.batch) c.batch.servings = Math.round(c.batch.eats.reduce((t, e) => t + e.serving, 0) * 100) / 100
  const pick = (k: 'cut' | 'weigh' | 'spice') => [...bag.values()].filter(l => l.kind === k).map(({ kind: _k, ...l }) => ({ ...l, grams: Math.round(l.grams * 10) / 10 })).sort((a, b) => b.grams - a.grams)
  return { cut: pick('cut'), weigh: pick('weigh'), spice: pick('spice'), cooks: merged, meals: count, noAmounts }
}

/** A recipe as a message for someone else cooking it (WhatsApp): what it is for, the amounts to use, and the steps. One cook for two meals says so and gives the added-up amounts. */
export type CookCard = { name: string; items: { name: string; grams: number | null }[]; steps: string[]; eats?: { time: string; serving: number }[]; servings?: number }
export function cookText(c: CookCard): string {
  const title = c.name.replace(/\s*\([\d.]+ serving\)/g, '').trim()
  const times = (c.eats ?? []).map(e => clock(e.time))
  const batch = times.length > 1
  const list = times.length > 2 ? `${times.slice(0, -1).join(', ')} and ${times[times.length - 1]}` : times.join(' and ')
  const g = (n: number) => `${Math.round(n * 10) / 10} g`
  return [
    batch ? `${title}: cook once for the ${list} meals` : title,
    '',
    batch ? `Ingredients (the total for all ${times.length} meals):` : 'Ingredients:',
    ...c.items.filter(i => i.grams).map(i => `- ${i.name}, ${g(i.grams!)}`),
    ...(c.steps.length ? ['', 'How to cook:', ...c.steps.map((x, i) => `${i + 1}. ${x}`), '', 'Use the amounts in the ingredient list above. If a step gives a different amount, the list is right.'] : []),
  ].join('\n')
}
export const cooksText = (heading: string, cooks: CookCard[]) => [heading, ...cooks.map(c => `\n----\n${cookText(c)}`)].join('\n')
