// The morning update sent to the coach: this morning's weight, then yesterday in numbers
// (steps, protein, calories, water, sleep), then the food and supplements, one thing per line.
// Pure, so it is tested off the phone; share.ts gathers the numbers.
import { clock, SLOT_NAME } from './core.ts'
import { dayTotals, type Meal, type MealItem } from './meals.ts'
import { amountLabel } from './servings.ts'

export type Sleep = { asleepMin: number; deepMin: number; remMin: number; awakeMin: number; bed: Date; wake: Date }
export type UpdateInput = {
  /** "Sun 8 Nov" and "Sat 7 Nov". */
  todayLabel: string
  yesterdayLabel: string
  weightKg: number | null
  /** Yesterday's meals in the order of the day. */
  meals: Meal[]
  waterMl: number
  steps: number | null
  /** Last night's sleep, null when the watch has none. */
  sleep: Sleep | null
  proteinTarget: number | null
  kcalMax: number | null
  kcalMin: number | null
  waterTargetMl: number | null
  stepGoal: number | null
  drinks: string[]
  doses: { name: string; status: 'taken' | 'skipped'; at: string | null }[]
}

const n = (x: number) => Math.round(x).toLocaleString('en-IN')
const litres = (ml: number) => `${(ml / 1000).toFixed(1)} L`
const hm = (min: number) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min` }
const at = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase()

/** "ghee 13 g", but "4 egg whites" and "2 rotis", which already say what they are. */
const item = (i: MealItem) => {
  if (!i.grams && !i.ml) return `${i.name} (amount not noted)`
  const a = i.grams ? amountLabel(i.name, i.grams) : `${i.ml} ml`
  return a.endsWith(' g') || a.endsWith(' ml') ? `${i.name} ${a}` : a
}

function foodLines(meals: Meal[]) {
  const out: string[] = []
  for (const m of meals) {
    if (m.state === 'skipped') { out.push(`${SLOT_NAME[m.slot]}: skipped`, ''); continue }
    if (m.state !== 'eaten') { if (['breakfast', 'lunch', 'dinner'].includes(m.slot)) out.push(`${SLOT_NAME[m.slot]}: not logged`, ''); continue }
    const t = dayTotals([m])
    const nums = m.items.length && !t.unknown ? ` · ${n(t.kcal)} kcal, ${n(t.p)} g protein` : ''
    out.push(`${m.eatenAt ? `${clock(m.eatenAt)} · ` : ''}${SLOT_NAME[m.slot]}${nums}`)
    out.push(...(m.items.length ? m.items.map(i => `  ${item(i)}`) : [`  ${m.name || 'Food'} (amounts not noted)`]), '')
  }
  return out
}

export function updateText(s: UpdateInput): string {
  const t = dayTotals(s.meals)
  const food = foodLines(s.meals)
  const kcalNote = s.kcalMax ? ` (limit ${n(s.kcalMax)})` : s.kcalMin ? ` (at least ${n(s.kcalMin)})` : ''
  const lines = [
    `Update for the coach · ${s.todayLabel}`,
    '',
    `Weight: ${s.weightKg != null ? `${s.weightKg.toFixed(1)} kg, this morning on an empty stomach` : 'not logged yet'}`,
    `Steps: ${s.steps != null ? `${n(s.steps)}${s.stepGoal ? ` (goal ${n(s.stepGoal)})` : ''}` : 'not available'}`,
    `Protein: ${n(t.p)} g${s.proteinTarget ? ` (target ${n(s.proteinTarget)} g)` : ''}`,
    `Calories: ${n(t.kcal)} kcal${kcalNote}`,
    `Water: ${litres(s.waterMl)}${s.waterTargetMl ? ` (target ${litres(s.waterTargetMl)})` : ''}`,
    `Sleep: ${s.sleep ? `${hm(s.sleep.asleepMin)} last night` : 'no data from the watch'}`,
    '(Steps, protein, calories and water are for yesterday.)',
  ]
  if (t.unknown) lines.push(`(${t.unknown} food item${t.unknown === 1 ? '' : 's'} had no numbers, so protein and calories are at least this much.)`)
  if (s.sleep) {
    const z = s.sleep
    lines.push('', 'Sleep last night',
      `In bed ${at(z.bed)}, up ${at(z.wake)}`,
      `Asleep ${hm(z.asleepMin)}${z.deepMin ? `, deep ${hm(z.deepMin)}` : ''}${z.remMin ? `, REM ${hm(z.remMin)}` : ''}${z.awakeMin ? `, awake ${hm(z.awakeMin)}` : ''}`)
  }
  if (food.length) lines.push('', `Food on ${s.yesterdayLabel}`, '', ...food.slice(0, -1))
  if (s.drinks.length) lines.push('', `Drinks: ${s.drinks.join(', ')}`)
  if (s.doses.length) {
    const taken = new Map<string, string[]>()
    for (const d of s.doses.filter(x => x.status === 'taken')) { const k = d.at ? clock(d.at) : 'time not noted'; taken.set(k, [...(taken.get(k) ?? []), d.name]) }
    const skipped = s.doses.filter(x => x.status === 'skipped').map(x => x.name)
    lines.push('', 'Supplements', ...[...taken].map(([k, v]) => `${k}: ${v.join(', ')}`), ...(skipped.length ? [`Skipped: ${skipped.join(', ')}`] : []))
  }
  return lines.join('\n')
}
