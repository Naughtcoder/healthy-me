// The plain-text read-out behind the "Today's summary" Shortcuts action. The
// app writes it into the App Group with the widget data; the action hands it to
// Shortcuts, which saves it to a file on iCloud Drive. Pure, so it is tested
// off the phone. Plain words and one line per thing, so it reads in any editor.
import { clock, medGroups, SLOT_NAME, type Med } from './core.ts'
import { dayTotals, type Meal, type MealItem } from './meals.ts'

export type SummaryInput = {
  now: Date
  today: string
  phase: string
  programmeDay: number | null
  /** In the order of the day (builder's dayRows). */
  meals: Meal[]
  water: number
  waterTarget: number
  weight: { day: string; kg: number } | null
  meds: Med[]
  doses: { med_id: string; time: string; status: 'taken' | 'skipped' }[]
  /** Oldest first, today included. */
  week: { day: string; kg: number | null; kcal: number; p: number; water: number }[]
}

const n = (x: number) => Math.round(x).toLocaleString('en-IN')

const amount = (i: MealItem) => i.grams ? `${i.grams} g` : i.ml ? `${i.ml} ml` : ''

/** Numbers are frozen in only when a meal is eaten, so a planned item shows its amount alone. */
function itemLine(i: MealItem, eaten: boolean) {
  const nums = !eaten ? '' : i.kcal != null && i.p != null ? `${n(i.kcal)} kcal, ${Math.round(i.p)} g protein` : 'numbers unknown'
  return [i.name, amount(i), nums].filter(Boolean).join(', ')
}

function mealLines(m: Meal) {
  const head = m.state === 'eaten' ? `eaten${m.eatenAt ? ` ${clock(m.eatenAt)}` : ''}` : `${m.state}${m.time ? ` for ${clock(m.time)}` : ''}`
  const name = m.name ? ` (${m.name})` : ''
  if (m.state === 'skipped' || !m.items.length) return [`- ${SLOT_NAME[m.slot]}, ${head}${name}`]
  return [`- ${SLOT_NAME[m.slot]}, ${head}${name}:`, ...m.items.map(i => `    ${itemLine(i, m.state === 'eaten')}`)]
}

function medLine(m: Med, s: SummaryInput, part: 'now' | 'later' | 'stopped') {
  const times = m.times.map(clock).join(', ')
  const base = `- ${m.name}: ${m.dose} at ${times}`
  if (part === 'later') return `${base}, from ${m.start}`
  if (part === 'stopped') return `${base}, ${m.active ? `ended ${m.end}` : 'switched off'}`
  const today = m.times.map(t => {
    const d = s.doses.find(x => x.med_id === m.id && x.time === t)
    return `${clock(t)} ${d ? d.status : 'not logged'}`
  }).join(', ')
  return `${base}. Today: ${today}`
}

export function summaryText(s: SummaryInput): string {
  const t = dayTotals(s.meals)
  const g = medGroups(s.meds, s.today)
  const written = s.now.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  const lines = [
    'Healthy Me summary',
    `Written: ${written}`,
    `Day: ${s.today}, ${s.phase}${s.programmeDay ? `, programme day ${s.programmeDay}` : ''}`,
    `Weight: ${s.weight ? `${s.weight.kg} kg on ${s.weight.day}` : 'none logged'}`,
    `Water: ${n(s.water)} of ${n(s.waterTarget)} ml`,
    `Eaten so far: ${n(t.kcal)} kcal, ${Math.round(t.p)} g protein${t.unknown ? ` (${t.unknown} item${t.unknown === 1 ? '' : 's'} with unknown numbers)` : ''}`,
    '',
    'Meals',
    ...(s.meals.length ? s.meals.flatMap(mealLines) : ['- None planned or logged']),
    '',
    'Medicines, taking now',
    ...(g.now.length ? g.now.map(m => medLine(m, s, 'now')) : ['- None']),
  ]
  if (g.later.length) lines.push('', 'Medicines, starting later', ...g.later.map(m => medLine(m, s, 'later')))
  if (g.stopped.length) lines.push('', 'Medicines, stopped', ...g.stopped.map(m => medLine(m, s, 'stopped')))
  lines.push('', 'Last 7 days', ...s.week.map(d =>
    `- ${d.day}: ${d.kg != null ? `${d.kg} kg` : 'no weight'}, ${n(d.kcal)} kcal, ${Math.round(d.p)} g protein, ${n(d.water)} ml water`))
  return lines.join('\n')
}
