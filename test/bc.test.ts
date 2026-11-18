// One test per BC table in drafts/at-health-meal-entry-bc-spec-2026-10-26.md:
// for each cause, the variant it produces.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actions, amountMode, amountText, headerText, mealRow, ruleBadge, showsTime, sourceNote, totalsBar, weightCard } from '../src/lib/bc.ts'
import type { Meal, MealItem } from '../src/lib/meals.ts'

const item = (name: string, grams: number | null = null, ml: number | null = null, source: string | null = null): MealItem =>
  ({ name, grams, ml, at: null, p: null, kcal: null, source })
const meal = (patch: Partial<Meal>): Meal =>
  ({ day: '2026-10-26', slot: 'lunch', name: '', state: 'planned', eatenAt: null, cook: true, note: null, origin: 'you', items: [], ...patch })

test('Amount Entry: grams by default, a count for rotis, ml for drinks, whey stays grams', () => {
  assert.equal(amountMode(item('Okra fry', 150)).mode, 'grams')
  assert.deepEqual(amountText(item('Jowar roti, 2', 80)), '2 rotis')
  assert.equal(amountMode(item('Buttermilk', null, 250)).mode, 'ml')
  assert.equal(amountText(item('Buttermilk', null, 250)), '250 ml')
  assert.equal(amountMode(item('Whey protein shake, unflavoured', 30)).mode, 'grams')
  assert.equal(amountText(item('Okra fry')), 'add amount')
  assert.equal(amountMode(item('Milk thistle')).mode, 'grams')
})

test('Source Note: nothing for your list, a label for every other source', () => {
  assert.equal(sourceNote(item('Okra fry')), null)
  assert.equal(sourceNote(item('Broccoli, raw', null, null, 'usda-foundation')), 'USDA')
  assert.equal(sourceNote(item('Something', null, null, 'cofid')), 'UK table')
  assert.equal(sourceNote(item('Brand bar', null, null, 'off')), 'From the packet')
  assert.equal(sourceNote(item('Chicken thing')), 'A guess from the name')
  assert.equal(sourceNote(item('Zxqv')), 'Not counted: not in any list')
})

test('Rule Badge: none when allowed, grey for new, amber otherwise, with the phase it returns in', () => {
  assert.equal(ruleBadge({ level: 'ok', why: [], tests: [] }), null)
  assert.equal(ruleBadge({ level: 'new', why: ['New in V2: paneer'], tests: ['paneer'] })!.tone, 'grey')
  assert.equal(ruleBadge({ level: 'notyet', why: ['Dairy: back in V2'], tests: [] })!.text, 'Not yet: back in V2')
  assert.equal(ruleBadge({ level: 'out', why: ['Wheat (gluten)'], tests: [] })!.text, 'Not allowed: wheat')
  assert.equal(ruleBadge({ level: 'ask', why: ['Eggs in V1: ask the coach'], tests: [] })!.tone, 'amber')
})

test('Header: the time when eaten, skipped when skipped', () => {
  assert.equal(headerText('lunch', 'Mon 26 Oct', 'planned', null), 'Lunch · Mon 26 Oct')
  assert.equal(headerText('lunch', 'Mon 26 Oct', 'eaten', '13:15'), 'Lunch · Mon 26 Oct · eaten 1:15 pm')
  assert.equal(headerText('lunch', 'Mon 26 Oct', 'skipped', null), 'Lunch · Mon 26 Oct · skipped')
})

test('Totals Bar: no food, exact, or at least with how many amounts are missing', () => {
  assert.equal(totalsBar([], 0, 60, 0, 850, []).line, 'No food yet')
  assert.equal(totalsBar([item('Paneer', 100)], 25, 60, 98, 850, []).line, '25 g protein · 98 kcal')
  assert.equal(totalsBar([item('Paneer', 100), item('Okra fry')], 25, 60, 98, null, []).line, 'At least 25 g protein · 1 amount missing')
  assert.equal(totalsBar([], 25, 60, 98, 850, []).day, 'day 25 of 60 g · 98 of at least 850 kcal')
})

test('Action: past days offer Eaten only; eaten offers Save and back to planned', () => {
  assert.deepEqual(actions('planned', 'today'), { primary: ['save-plan', 'eaten'], link: 'skip' })
  assert.deepEqual(actions('planned', 'past'), { primary: ['eaten'], link: 'skip' })
  assert.deepEqual(actions('eaten', 'past'), { primary: ['save'], link: 'back-to-planned' })
  assert.deepEqual(actions('skipped', 'today'), { primary: ['save-plan', 'eaten'], link: 'unskip' })
})

test('Time: shown before the first save, except a planned main meal on a later day', () => {
  assert.equal(showsTime('planned', 'today', false), true)
  assert.equal(showsTime('planned', 'past', false), true)
  assert.equal(showsTime('eaten', 'today', false), true)
  assert.equal(showsTime('planned', 'future', false), false)
  assert.equal(showsTime('planned', 'future', true), true)
})

test('Meal Row: every variant in the table', () => {
  assert.deepEqual(mealRow('snack1', undefined), { kind: 'link', text: '+ Morning snack' })
  const none = mealRow('breakfast', undefined)
  assert.ok(none.kind === 'row' && none.title === 'Plan breakfast' && none.tick === null)
  const named = mealRow('lunch', meal({ name: 'Paneer bhurji', items: [item('Paneer bhurji')] }))
  assert.ok(named.kind === 'row' && named.detail === 'Amounts not filled in yet' && named.tick === 'open' && named.titleTone === 'planned')
  const planned = mealRow('lunch', meal({ name: 'Paneer', items: [item('Paneer', 160)] }))
  assert.ok(planned.kind === 'row' && planned.detail === 'About 40 g protein planned')
  const eaten = mealRow('lunch', meal({ name: 'Paneer', state: 'eaten', eatenAt: '13:15', items: [{ ...item('Paneer', 100), p: 25, kcal: 98 }] }))
  assert.ok(eaten.kind === 'row' && eaten.label === 'Lunch · 1:15 pm' && eaten.detail === '25 g protein, 98 kcal' && eaten.tick === 'done')
  const part = mealRow('lunch', meal({ name: 'x', state: 'eaten', items: [{ ...item('Paneer', 100), p: 25, kcal: 98 }, item('Okra fry')] }))
  assert.ok(part.kind === 'row' && part.detail === 'At least 25 g protein, amounts missing')
  const skipped = mealRow('dinner', meal({ state: 'skipped' }))
  assert.ok(skipped.kind === 'row' && skipped.title === 'Skipped' && skipped.tick === 'skipped')
  const out = mealRow('lunch', meal({ name: 'Office', cook: false }))
  assert.ok(out.kind === 'row' && out.label === 'Lunch · not cooked at home')
})

test('Weight Card: field, typed, from the scale, editing, and no yesterday', () => {
  assert.deepEqual(weightCard(null, { kg: 86.2 }, false), { kind: 'field', hint: '86.2', editing: false, value: '' })
  assert.deepEqual(weightCard({ kg: 85.8, source: 'you' }, { kg: 86.2 }, false), { kind: 'value', kg: '85.8 kg', from: 'typed', change: '−0.4 since yesterday' })
  assert.equal((weightCard({ kg: 86, source: 'health' }, { kg: 86.2 }, false) as any).from, 'scale')
  assert.deepEqual(weightCard({ kg: 86, source: 'health' }, null, true), { kind: 'field', hint: '86.0', editing: true, value: '86.0' })
  assert.equal((weightCard({ kg: 86, source: 'you' }, null, false) as any).change, null)
})

test('Name: follows the foods unless you typed your own', async () => {
  const { nameField } = await import('../src/lib/bc.ts')
  assert.equal(nameField(meal({ name: 'Paneer, Okra fry', items: [item('Paneer'), item('Okra fry')] })), '')
  assert.equal(nameField(meal({ name: 'Paneer bhurji', items: [item('Paneer'), item('Okra fry')] })), 'Paneer bhurji')
  assert.equal(nameField(meal({ name: '', items: [] })), '')
})
