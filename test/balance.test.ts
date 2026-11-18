import { test } from 'node:test'
import assert from 'node:assert/strict'
import { balanceDay, kindOf, mealKcal } from '../src/lib/budget.ts'
import type { Meal } from '../src/lib/meals.ts'

const it = (name: string, grams: number) => ({ name, grams, ml: null, at: null, p: null, kcal: null, source: null })
const meal = (slot: Meal['slot'], items: ReturnType<typeof it>[], state: Meal['state'] = 'planned'): Meal =>
  ({ day: '2026-11-16', slot, name: slot, state, eatenAt: null, cook: true, note: null, origin: 'you', items })
const day = () => [
  meal('lunch', [it('cauliflower', 200), it('ghee', 15)]),
  meal('snack3', [it('spinach', 200), it('ghee', 10)]),
  meal('snack1', [it('whey isolate', 30)]),
]

test('keeping vegetables fixed, balancing moves only the ghee', () => {
  const m = day(), before = m.reduce((t, x) => t + mealKcal(x), 0)
  const r = balanceDay(m, before - 60, new Set(['cauliflower', 'spinach', 'whey isolate']))
  assert.ok(r.reached, JSON.stringify(r.rows))
  const g = r.meals.flatMap(x => x.items)
  assert.ok(g.some(i => i.name === 'ghee'))
  assert.equal(r.meals.find(x => x.slot === 'lunch')!.items[0].grams, 200)
  assert.ok(r.meals.find(x => x.slot === 'lunch')!.items[1].grams! < 15)
  assert.equal(r.meals.find(x => x.slot === 'snack1'), undefined)
})

test('eaten meals are never touched and count towards the target', () => {
  const m = [...day(), meal('dinner', [it('ghee', 20)], 'eaten')]
  const r = balanceDay(m, 700, new Set(['whey isolate']))
  assert.ok(!r.meals.some(x => x.slot === 'dinner'))
  assert.equal(r.rows.find(x => x.slot === 'dinner')!.eaten, true)
})

test('everything locked says there is nothing to adjust', () => {
  const r = balanceDay(day(), 100, new Set(['cauliflower', 'spinach', 'ghee', 'whey isolate']))
  assert.equal(r.reached, false); assert.equal(r.why, 'nothing'); assert.equal(r.meals.length, 0)
})

test('ingredients are sorted into fats, protein and the rest', () => {
  assert.equal(kindOf('Ghee'), 'fat'); assert.equal(kindOf('Whey isolate'), 'protein'); assert.equal(kindOf('Cauliflower'), 'veg')
})

import { flexSplit } from '../src/lib/budget.ts'
test('the coffee fat, whey and egg whites are fixed; only the dish meals count as flexible', () => {
  const m = [
    meal('breakfast', [it('ghee', 13)]),
    meal('snack1', [it('egg white', 130)]),
    meal('lunch', [it('cauliflower', 200), it('ghee', 10)]),
    meal('snack5', [it('whey isolate', 30), it('spinach', 150)]),
  ]
  const f = flexSplit(m, 850)
  assert.ok(f.fixed > 0 && f.flex > 0)
  assert.equal(f.room, 850 - f.fixed); assert.equal(f.left, 850 - f.fixed - f.flex)
  const r = balanceDay(m, 300, new Set())
  assert.equal(r.meals.find(x => x.slot === 'breakfast'), undefined)
  assert.equal(r.meals.find(x => x.slot === 'snack1'), undefined)
  const mixed = r.meals.find(x => x.slot === 'snack5')!
  assert.equal(mixed.items.find(i => i.name === 'whey isolate')!.grams, 30)
})

import { dishShare } from '../src/lib/budget.ts'
test('each dish meal gets a fixed share: the ceiling less the fixed foods, over four', () => {
  const m = (slot: string, name: string, items: [string, number][], state: 'planned' | 'eaten' = 'planned') =>
    ({ day: '2026-11-16', slot, name, state, eatenAt: null, cook: true, note: null, origin: 'you', items: items.map(([n, g]) => ({ name: n, grams: g, ml: null, at: null, p: null, kcal: null, source: null })) }) as never
  const day = [
    m('breakfast', 'Ghee in black coffee', [['Ghee', 13]], 'eaten'),
    m('snack1', '4 boiled egg whites', [['Egg white', 132]]),
    m('snack2', 'Whey shake', [['Whey isolate', 30]]),
    m('dinner', 'Whey shake', [['Whey isolate', 30]]),
    m('snack4', 'Fibre drink (chia and husk)', [['Chia seeds', 5], ['Psyllium husk', 8]]),
    m('lunch', 'Carrot dish', [['Carrot', 400], ['Ghee', 40]]),
  ]
  const a = dishShare(day, 850)!, b = dishShare(day.slice(0, 5), 850)!
  assert.equal(a.each, b.each)   // the dish meals' own contents do not move it
  assert.ok(a.fixed > 400 && a.fixed < 520, String(a.fixed))
  assert.equal(a.each, Math.floor((850 - a.fixed) / 4))
  assert.equal(dishShare(day, null), null)
})
