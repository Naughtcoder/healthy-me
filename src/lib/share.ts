// Text to send to people: the family or cook (a day's menu with raw weights)
// and the coach (the morning weight and yesterday's food, in the order they ask for).
import { addDays, at, clock, prepFor, SLOT_NAME, type DayEvent } from './core'
import { dayRows } from './builder'
import { amountLabel } from './servings'
import type { MealItem } from './meals'
import { doneOn, dosesOn, getMeta, meds, mealsOn, phaseOn, plan, targetsOn, waterOn, weightOn } from './db'
import { healthConnected, healthFor } from './health'
import { updateText, type Sleep } from './update'

const pretty = (day: string) => at(day, '12:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })
const shortDay = (day: string) => at(day, '12:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
const item = (i: MealItem) => `${i.name}${i.grams ? ` ${amountLabel(i.name, i.grams)}` : i.ml ? ` ${i.ml} ml` : ''}`
const prepLine = (e: DayEvent) => (e.items ?? []).map(i => `${i.name} ${i.amount ?? ''}`.trim()).join(', ')

/** A day's meals with cooked weights, then what to cook and soak, with raw weights. */
export function menuText(day: string) {
  const meals = mealsOn(day)
  const lines = [`Meal plan for ${pretty(day)} (${phaseOn(day).name})`, '']
  for (const s of ['breakfast', 'lunch', 'dinner'] as const) {
    const m = meals.find(x => x.slot === s)
    const what = !m ? 'not planned' : !m.cook ? `${m.name || 'out'}, not cooked at home` : m.items.length ? m.items.map(item).join(', ') : m.name || 'not planned'
    lines.push(`${SLOT_NAME[s]}: ${what}`)
  }
  const prep = [...prepFor(plan, addDays(day, -1), {}).filter(e => e.key === 'p:evening' || e.key === 'p:soak').map(e => ({ e, when: `The evening before, ${clock(e.time)}` })),
    ...prepFor(plan, day, {}).map(e => ({ e, when: clock(e.time) }))]
  if (prep.length) {
    lines.push('', 'Cooking, raw weights:')
    for (const { e, when } of prep) lines.push(`${when}, ${e.title.toLowerCase()}: ${prepLine(e)}`)
  }
  lines.push('', 'Weights for meals are cooked.')
  return lines.join('\n')
}

/** The morning update for the coach: today's weight, yesterday in numbers (steps, protein, calories, water),
 *  last night's sleep, then the food, drinks and supplements. Missing amounts are said, not guessed. */
export async function coachUpdate(day: string) {
  const y = addDays(day, -1)
  const w = weightOn(day)
  let steps: number | null = null, sleep: Sleep | null = null
  if (healthConnected()) {
    const [hy, ht] = await Promise.all([healthFor(y).catch(() => null), healthFor(day).catch(() => null)])
    steps = hy?.steps != null ? Math.round(hy.steps) : null
    sleep = ht?.sleep ?? null
  }
  const T = targetsOn(y)
  const done = doneOn(y)
  const names = new Map(meds().map(m => [m.id, m.name.split(' (')[0]]))
  return updateText({
    todayLabel: shortDay(day), yesterdayLabel: shortDay(y),
    weightKg: w ? w.kg : null,
    meals: dayRows(plan, mealsOn(y)).flatMap(r => r.meal ? [r.meal] : []),
    waterMl: waterOn(y), steps, sleep,
    proteinTarget: T.proteinG, kcalMax: T.kcalMax, kcalMin: T.kcalMin,
    waterTargetMl: plan.waterTargetMl, stepGoal: T.steps ? Number(getMeta('stepGoal') ?? 8000) : null,
    drinks: [done.has('drink:fibre') && 'fibre drink', (done.has('drink:salt1') || done.has('drink:salt2')) && `salt drink ${[done.has('drink:salt1'), done.has('drink:salt2')].filter(Boolean).length}x`].filter(Boolean) as string[],
    doses: dosesOn(y).map(d => ({ name: names.get(d.med_id) ?? d.med_id, status: d.status as 'taken' | 'skipped', at: d.at })),
  })
}
