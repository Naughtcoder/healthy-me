// The "Today's summary" text: what it says about meals, medicines and the week.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summaryText, type SummaryInput } from '../src/lib/summary.ts'
import { medGroups, type Med } from '../src/lib/core.ts'
import type { Meal } from '../src/lib/meals.ts'

const med = (patch: Partial<Med>): Med => ({ id: 'x', name: 'X', dose: '1 tablet', times: ['09:45'], start: '2026-09-29', active: true, ...patch })
const meal = (patch: Partial<Meal>): Meal =>
  ({ day: '2026-10-30', slot: 'breakfast', name: '', state: 'planned', eatenAt: null, cook: true, note: null, origin: 'plan', items: [], ...patch })

const base = (patch: Partial<SummaryInput> = {}): SummaryInput => ({
  now: new Date(2026, 9, 30, 21, 52), today: '2026-10-30', phase: 'Clean eating', programmeDay: 9,
  meals: [], water: 2250, waterTarget: 3000, weight: { day: '2026-10-28', kg: 84.5 },
  meds: [], doses: [], week: [], ...patch,
})

test('medicines fall into the same three lists as the Meds tab', () => {
  const all = [
    med({ id: 'd3', name: 'Vitamin D3' }),
    med({ id: 'htp', name: '5-HTP', start: '2026-10-31' }),
    med({ id: 'omega', name: 'Milk omega', start: '2026-10-30' }),
    med({ id: 'old', name: 'Old course', end: '2026-10-28' }),
    med({ id: 'off', name: 'Switched off', active: false }),
  ]
  const g = medGroups(all, '2026-10-30')
  assert.deepEqual(g.now.map(m => m.id), ['d3', 'omega'])
  assert.deepEqual(g.later.map(m => m.id), ['htp'])
  assert.deepEqual(g.stopped.map(m => m.id), ['old', 'off'])
})

test('each dose today shows taken, skipped or not logged', () => {
  const s = summaryText(base({
    meds: [med({ id: 'd3', name: 'Vitamin D3', times: ['09:45', '20:30'] })],
    doses: [{ med_id: 'd3', time: '09:45', status: 'taken' }],
  }))
  assert.match(s, /- Vitamin D3: 1 tablet at 9:45 am, 8:30 pm\. Today: 9:45 am taken, 8:30 pm not logged/)
})

test('medicines starting later carry their start date, and stopped ones say why', () => {
  const s = summaryText(base({ meds: [
    med({ id: 'htp', name: '5-HTP 100 mg', dose: '1 capsule', times: ['16:30'], start: '2026-10-31' }),
    med({ id: 'old', name: 'Old course', end: '2026-10-28' }),
    med({ id: 'off', name: 'Switched off', active: false }),
  ] }))
  assert.match(s, /Medicines, starting later\n- 5-HTP 100 mg: 1 capsule at 4:30 pm, from 2026-10-31/)
  assert.match(s, /- Old course: 1 tablet at 9:45 am, ended 2026-10-28/)
  assert.match(s, /- Switched off: 1 tablet at 9:45 am, switched off/)
  assert.match(s, /Medicines, taking now\n- None/)
})

test('meals list each eaten item with its numbers, and say when they are unknown', () => {
  const s = summaryText(base({ meals: [
    meal({ state: 'eaten', eatenAt: '09:40', items: [
      { name: 'Egg whites, boiled', grams: 100, ml: null, at: null, p: 11, kcal: 52, source: 'list' },
      { name: 'Mystery chutney', grams: 30, ml: null, at: null, p: null, kcal: null, source: null },
    ] }),
    meal({ slot: 'snack2', state: 'skipped' }),
  ] }))
  assert.match(s, /- Breakfast, eaten 9:40 am:\n {4}Egg whites, boiled, 100 g, 52 kcal, 11 g protein\n {4}Mystery chutney, 30 g, numbers unknown/)
  assert.match(s, /- Evening snack, skipped/)
  assert.match(s, /Eaten so far: 52 kcal, 11 g protein \(1 item with unknown numbers\)/)
})

test('meals keep the day order they are given, planned items show amounts without numbers, and an added snack its time', () => {
  const s = summaryText(base({ meals: [
    meal({ slot: 'breakfast', state: 'skipped' }),
    meal({ slot: 'snack3', name: 'Isopure shake', time: '16:00' }),
    meal({ slot: 'dinner', name: 'Paneer tikka', items: [{ name: 'Paneer tikka', grams: 150, ml: null, at: null, p: null, kcal: null, source: null }] }),
  ] }))
  assert.match(s, /- Breakfast, skipped\n- Snack, planned for 4:00 pm \(Isopure shake\)\n- Dinner, planned \(Paneer tikka\):\n {4}Paneer tikka, 150 g\n/)
})

test('the header and the week read plainly, with no weight shown as such', () => {
  const s = summaryText(base({ weight: null, week: [
    { day: '2026-10-29', kg: 84.4, kcal: 1240.4, p: 88.6, water: 3000 },
    { day: '2026-10-30', kg: null, kcal: 0, p: 0, water: 2250 },
  ] }))
  assert.match(s, /^Healthy Me summary\nWritten: /)
  assert.match(s, /Day: 2026-10-30, Clean eating, programme day 9/)
  assert.match(s, /Weight: none logged/)
  assert.match(s, /Water: 2,250 of 3,000 ml/)
  assert.match(s, /- 2026-10-29: 84\.4 kg, 1,240 kcal, 89 g protein, 3,000 ml water\n- 2026-10-30: no weight, 0 kcal, 0 g protein, 2,250 ml water$/)
})
