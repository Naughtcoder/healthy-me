import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Meal } from '../src/lib/meals.ts'
import type { Slot } from '../src/lib/core.ts'
import { droppedMeals, fitPortion, initialMembers, memberMeals, mergeAll, scaleItems, slotsFor, wouldReplace } from '../src/lib/group.ts'

const it = (name: string, grams: number) => ({ name, grams, ml: null, at: null, p: null, kcal: null, source: null })
const meal = (slot: Slot, name: string, items: ReturnType<typeof it>[], state: Meal['state'] = 'planned', eatenAt: string | null = null): Meal =>
  ({ day: '2026-11-13', slot, name, state, eatenAt, cook: true, note: null, origin: 'you', items })
const MANGO = 'Raw mango stir fry'
const mangoItems = () => [it('raw mango', 117), it('coconut oil', 4)]

test('portions scale every amount and drop blank rows', () => {
  const s = scaleItems([it('raw mango', 100), it('', 5), it('coconut oil', 3)], 1.5)
  assert.deepEqual(s.map(i => [i.name, i.grams]), [['raw mango', 150], ['coconut oil', 4.5]])
})

test('meals that already hold the dish are found with their portion; eaten ones do not follow', () => {
  const m = meal('snack3', MANGO, mangoItems())
  const others = [meal('snack6', MANGO, [it('raw mango', 58.5), it('coconut oil', 2)], 'eaten', '18:00'), meal('lunch', 'Gajar sabji', [it('carrot', 130)])]
  const r = initialMembers(m, others)
  assert.deepEqual(Object.keys(r), ['snack6'])
  assert.equal(r.snack6!.k, 0.5)
  assert.equal(r.snack6!.follow, false)
})

test('choosing three meals gives each the same amounts; a half portion halves them', () => {
  const m = meal('snack3', MANGO, mangoItems())
  const out = memberMeals(m, [], { snack6: { k: 1, follow: true }, lunch: { k: 0.5, follow: true } })
  const by = Object.fromEntries(out.map(x => [x.slot, x]))
  assert.equal(by.snack6.items[0].grams, 117)
  assert.equal(by.lunch.items[0].grams, 58.5)
  assert.ok(out.every(x => x.name === MANGO && x.state === 'planned'))
})

test('a meal already eaten with the dish is left exactly as logged', () => {
  const m = meal('snack3', MANGO, mangoItems())
  const eaten = meal('snack6', MANGO, [it('raw mango', 60)], 'eaten', '18:05')
  const [x] = memberMeals(m, [eaten], { snack6: { k: 1, follow: false } })
  assert.equal(x, eaten)
})

test('replacing an eaten meal with another dish keeps it eaten, at its time, with this dish', () => {
  const m = meal('snack3', MANGO, mangoItems())
  const old = meal('snack6', 'Carrots, Cucumber', [it('carrot', 100), it('cucumber', 100)], 'eaten', '20:08')
  assert.equal(wouldReplace(old, m), true)
  const [x] = memberMeals(m, [old], { snack6: { k: 1, follow: true } })
  assert.equal(x.state, 'eaten'); assert.equal(x.eatenAt, '20:08'); assert.equal(x.name, MANGO)
  assert.equal(wouldReplace(undefined, m), false)
})

test('taking a planned meal out empties it; an eaten one stays', () => {
  const m = meal('snack3', MANGO, mangoItems())
  const others = [meal('snack6', MANGO, mangoItems()), meal('lunch', MANGO, mangoItems(), 'eaten', '12:10')]
  const start = initialMembers(m, others)
  const gone = droppedMeals(m, others, start, {})
  assert.deepEqual(gone.map(x => x.slot), ['snack6'])
  assert.equal(gone[0].items.length, 0)
})

test('fit shrinks to the ceiling in steps of 5 percent, and leaves a day that fits alone', () => {
  assert.equal(fitPortion(850, 700, 100), 1)
  const k = fitPortion(850, 700, 300)
  assert.ok(k < 1 && 700 + 300 * k <= 850, `${k}`)
  assert.equal(fitPortion(850, 1000, 100), 0.3)
})

test('a vegetable dish can go to six meals (10 AM to 8 PM); the shake and the egg and whey meals have three of their own', () => {
  assert.deepEqual(slotsFor('snack6', 'dish'), ['snack1', 'lunch', 'snack5', 'snack2', 'snack3', 'snack6', 'dinner', 'snack4'])
  assert.deepEqual(slotsFor('dinner', 'combo'), ['snack1', 'snack2', 'dinner'])
  assert.deepEqual(slotsFor('breakfast', 'fat'), [])
  assert.ok(slotsFor('dinner', 'dish').includes('dinner') && slotsFor('dinner', 'dish').includes('snack6'))
  const shake = meal('dinner', 'C-protein shake', [it('whey isolate', 30), it('carrot', 40)])
  const out = memberMeals(shake, [], { snack2: { k: 1, follow: true } })
  assert.equal(out[0].slot, 'snack2'); assert.equal(out[0].name, 'C-protein shake')
})

test('both portions in one meal: amounts add up, the followed meals leave, an eaten one stays', () => {
  const r = mergeAll(mangoItems(), { snack6: { k: 1, follow: true }, lunch: { k: 0.5, follow: true }, snack5: { k: 1, follow: false } })!
  assert.equal(r.items[0].grams, 292.5)
  assert.deepEqual(Object.keys(r.members), ['snack5'])
  assert.equal(mergeAll(mangoItems(), {}), null)
})
