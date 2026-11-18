// The morning update for the coach: five numbers up top, sleep, then one item per line.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { updateText, type UpdateInput } from '../src/lib/update.ts'
import type { Meal, MealItem } from '../src/lib/meals.ts'

const it = (name: string, grams: number, kcal: number, p: number): MealItem => ({ name, grams, ml: null, at: null, p, kcal })
const meal = (slot: Meal['slot'], eatenAt: string, items: MealItem[]): Meal =>
  ({ day: '2026-11-07', slot, name: '', state: 'eaten', eatenAt, cook: true, note: null, origin: 'plan', items })

const base = (patch: Partial<UpdateInput> = {}): UpdateInput => ({
  todayLabel: 'Sun 8 Nov', yesterdayLabel: 'Sat 7 Nov', weightKg: 83.1,
  meals: [
    meal('breakfast', '08:01', [it('ghee', 13, 117, 0)]),
    meal('snack1', '10:20', [it('egg white', 132, 69, 14)]),
    meal('snack2', '14:54', [it('whey isolate', 30, 121, 27), it('cucumber', 150, 23, 1)]),
  ],
  waterMl: 3000, steps: 6412,
  sleep: { asleepMin: 400, deepMin: 70, remMin: 85, awakeMin: 20, bed: new Date(2026, 10, 7, 23, 30), wake: new Date(2026, 10, 8, 6, 10) },
  proteinTarget: 60, kcalMax: 850, kcalMin: null, waterTargetMl: 3000, stepGoal: null,
  drinks: ['fibre drink'],
  doses: [{ name: 'Vitamin D3', status: 'taken', at: '09:27' }, { name: 'Multivitamin', status: 'taken', at: '09:27' }, { name: 'Omega-3 1000 mg', status: 'skipped', at: null }],
  ...patch,
})

test('the five numbers come first, one per line, then sleep', () => {
  const s = updateText(base()).split('\n')
  assert.equal(s[0], 'Update for the coach · Sun 8 Nov')
  assert.equal(s[2], 'Weight: 83.1 kg, this morning on an empty stomach')
  assert.equal(s[3], 'Steps: 6,412')
  assert.equal(s[4], 'Protein: 42 g (target 60 g)')
  assert.equal(s[5], 'Calories: 330 kcal (limit 850)')
  assert.equal(s[6], 'Water: 3.0 L (target 3.0 L)')
  assert.equal(s[7], 'Sleep: 6 h 40 min last night')
})

test('the sleep detail says bed time, wake time and the stages', () => {
  assert.match(updateText(base()), /Sleep last night\nIn bed 11:30 pm, up 6:10 am\nAsleep 6 h 40 min, deep 1 h 10 min, REM 1 h 25 min, awake 20 min/)
})

test('each meal is a heading with its time and numbers, and every food has its own line', () => {
  const s = updateText(base())
  assert.match(s, /Food on Sat 7 Nov\n\n8:01 am · Breakfast · 117 kcal, 0 g protein\n  ghee 13 g\n\n10:20 am · Morning snack · 69 kcal, 14 g protein\n  4 egg whites\n\n2:54 pm · /)
  assert.match(s, /  whey isolate 30 g\n  cucumber 150 g/)
})

test('supplements are grouped by the time taken, and skipped ones are named', () => {
  const s = updateText(base())
  assert.match(s, /Supplements\n9:27 am: Vitamin D3, Multivitamin\nSkipped: Omega-3 1000 mg/)
  assert.match(s, /Drinks: fibre drink/)
})

test('missing things are said plainly, not left out or guessed', () => {
  const s = updateText(base({ weightKg: null, steps: null, sleep: null, meals: [] }))
  assert.match(s, /Weight: not logged yet\nSteps: not available/)
  assert.match(s, /Sleep: no data from the watch/)
  assert.doesNotMatch(s, /Sleep last night/)
})

test('a food with no numbers says protein and calories are at least what is shown', () => {
  const s = updateText(base({ meals: [meal('lunch', '13:00', [{ ...it('dal', 150, 0, 0), kcal: null, p: null }])] }))
  assert.match(s, /had no numbers/)
})
