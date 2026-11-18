// A meal plan as a CSV file: one row per food.
//   day,slot,meal,food,grams
// slot may also be snack3 or snack4, for a day with seven meals (V1). time (optional, 24-hour
// HH:MM) puts a meal at its own time of day, for example 14:00.
//   1,breakfast,Egg-white bhurji,Egg white,200
// day is 1, 2, 3 ... (day 1 lands on the date you pick). slot is breakfast,
// snack1, lunch, snack2 or dinner ("morning snack" and "evening snack" work too).
// meal names the meal; rows with the same day, slot and meal are one meal.
// method (optional) is how to cook the meal, shown on the meal; one row per meal is enough.
// grams may be empty. Extra columns are ignored, so a Google Sheets export works as is.
import type { MenuDay, MenuMeal } from './vision'

const SLOTS: Record<string, MenuMeal['slot']> = {
  breakfast: 'breakfast', snack1: 'snack1', 'morning snack': 'snack1', lunch: 'lunch',
  snack2: 'snack2', 'evening snack': 'snack2', dinner: 'dinner', snack3: 'snack3', snack4: 'snack4', snack5: 'snack5', snack6: 'snack6',
}

/** Splits CSV text into rows of cells, handling quotes, doubled quotes, commas or newlines inside quotes, and CRLF. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(x => x.trim())) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some(x => x.trim())) rows.push(row)
  return rows
}

export type CsvPlan = { days: MenuDay[]; problems: string[] }

/** A meal plan CSV as numbered days of meals, plus a plain-language list of rows that could not be used. */
export function parseMealCsv(text: string): CsvPlan {
  const rows = csvRows(text)
  const problems: string[] = []
  if (!rows.length) return { days: [], problems: ['The file is empty.'] }
  const head = rows[0].map(h => h.trim().toLowerCase())
  const col = (...names: string[]) => head.findIndex(h => names.includes(h))
  const iDay = col('day'), iSlot = col('slot', 'meal slot'), iMeal = col('meal', 'meal name'), iFood = col('food', 'item'), iGrams = col('grams', 'g', 'amount'), iMethod = col('method', 'how', 'steps'), iTime = col('time', 'at')
  const missing = [['day', iDay], ['slot', iSlot], ['food', iFood]].filter(([, i]) => i === -1).map(([n]) => n)
  if (missing.length) return { days: [], problems: [`The first row needs these columns: ${missing.join(', ')}. Use day, slot, meal, food, grams.`] }

  const byDay = new Map<number, Map<string, MenuMeal>>()
  rows.slice(1).forEach((r, k) => {
    const line = k + 2
    const day = Number((r[iDay] ?? '').trim())
    const slot = SLOTS[(r[iSlot] ?? '').trim().toLowerCase()]
    const food = (r[iFood] ?? '').trim()
    if (!Number.isInteger(day) || day < 1 || day > 60) return void problems.push(`Row ${line}: day must be a whole number from 1 to 60.`)
    if (!slot) return void problems.push(`Row ${line}: slot "${(r[iSlot] ?? '').trim()}" is not breakfast, snack1, lunch, snack2, dinner, snack3, snack4, snack5 or snack6.`)
    const tRaw = iTime === -1 ? '' : (r[iTime] ?? '').trim()
    if (tRaw && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(tRaw)) return void problems.push(`Row ${line}: time "${tRaw}" is not a 24-hour time like 14:00.`)
    if (!food) return void problems.push(`Row ${line}: the food is empty.`)
    const gRaw = iGrams === -1 ? '' : (r[iGrams] ?? '').trim()
    const g = gRaw === '' ? null : Number(gRaw)
    if (g !== null && !(g > 0 && g < 5000)) return void problems.push(`Row ${line}: grams "${gRaw}" is not a number between 1 and 4999.`)
    const meal = iMeal === -1 ? '' : (r[iMeal] ?? '').trim()
    const meals = byDay.get(day) ?? new Map<string, MenuMeal>()
    byDay.set(day, meals)
    const key = `${slot}|${meal}`
    const m = meals.get(key) ?? { slot, name: meal, items: [] }
    meals.set(key, m)
    m.items.push({ name: food, grams: g })
    const how = iMethod === -1 ? '' : (r[iMethod] ?? '').trim()
    if (how && !m.method) m.method = how
    if (tRaw && !m.time) m.time = tRaw.padStart(5, '0')
  })
  const days: MenuDay[] = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, meals]) => ({
    day, meals: [...meals.values()].map(m => ({ ...m, name: m.name || m.items.map(i => i.name).join(', ') })),
  }))
  if (!days.length && !problems.length) problems.push('No meals were found in the file.')
  return { days, problems }
}
