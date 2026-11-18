import { test } from 'node:test'
import assert from 'node:assert/strict'
import { amountOf, canonical, cardOf, numbersToDigits, parseDish } from '../src/lib/dish.ts'

const SAID = 'Hey I made spinach onion sag today with 160 grams of palak, 90 grams of onions and 22 and a half ml of ghee with about half a teaspoon of turmeric, half a teaspoon of salt and half a teaspoon of amchur'

test('spoken fractions become digits', () => {
  assert.equal(numbersToDigits('22 and a half ml'), '22.5 ml')
  assert.equal(numbersToDigits('half a teaspoon of salt'), '0.5 teaspoon of salt')
  assert.equal(numbersToDigits('1/2 tsp'), '0.5 tsp')
})

test('palak is spinach, onions is onion', () => {
  assert.equal(canonical('palak'), 'spinach')
  assert.equal(canonical('onions'), 'onion')
})

test('ghee in ml is weighed, spices in teaspoons are weighed', () => {
  assert.deepEqual(amountOf('ghee', 22.5, 'ml'), { grams: 20.5, ml: null })
  assert.deepEqual(amountOf('salt', 0.5, 'teaspoon'), { grams: 3, ml: null })
  assert.deepEqual(amountOf('turmeric', 0.5, 'teaspoon'), { grams: 1.3, ml: null })
  assert.deepEqual(amountOf('water', 200, 'ml'), { grams: null, ml: 200 })
})

test('the whole sentence becomes a dish with six ingredients', () => {
  const d = parseDish(SAID)
  assert.equal(d.name, 'Spinach onion sag')
  assert.deepEqual(d.items.map(i => [i.name, i.grams]), [['Spinach', 160], ['Onion', 90], ['Ghee', 20.5], ['Turmeric', 1.3], ['Salt', 3], ['Amchur', 1.3]])
})

test('the card adds up protein, kcal, carbs and fat, and names what it cannot count', () => {
  const c = cardOf(parseDish(SAID).items)
  assert.deepEqual(c.missing, [])
  assert.ok(c.kcal > 200 && c.kcal < 330, String(c.kcal))
  assert.ok(c.p > 4 && c.p < 8, String(c.p))
  assert.ok(c.fat > 18 && c.fat < 25, String(c.fat))
  const odd = cardOf(parseDish('I made zorblax with 100 g zorblat').items)
  assert.deepEqual(odd.missing, ['Zorblat'])
})

test('splitting a dish in 3 gives three equal portions that add back up', async () => {
  const { scaleItems } = await import('../src/lib/group.ts')
  const { asMealItems } = await import('../src/lib/dish.ts')
  const items = asMealItems(parseDish(SAID).items)
  const part = scaleItems(items, 1 / 3)
  assert.equal(part.length, items.length)
  const whole = cardOf(items), third = cardOf(part.map(i => ({ name: i.name, grams: i.grams, ml: i.ml })))
  assert.ok(Math.abs(third.kcal * 3 - whole.kcal) <= 6, `${third.kcal * 3} vs ${whole.kcal}`)
  assert.ok(Math.abs(third.p * 3 - whole.p) <= 0.6)
})

test('percent splits scale each portion and add back to the whole', async () => {
  const { scaleItems } = await import('../src/lib/group.ts')
  const { asMealItems } = await import('../src/lib/dish.ts')
  const items = asMealItems(parseDish(SAID).items)
  const whole = cardOf(items)
  for (const shares of [[67, 33], [50, 30, 20], [40, 30, 20, 10]]) {
    assert.equal(shares.reduce((a, b) => a + b, 0), 100)
    const kcal = shares.reduce((a, s) => a + cardOf(scaleItems(items, s / 100).map(i => ({ name: i.name, grams: i.grams, ml: i.ml }))).kcal, 0)
    assert.ok(Math.abs(kcal - whole.kcal) <= 4, `${shares}: ${kcal} vs ${whole.kcal}`)
  }
})

import { saidIn } from '../src/lib/dish.ts'
test('a food the person never said is not accepted from the model', () => {
  const t = 'I made cauliflower sabzi with 274 g cauliflower, 12 g ghee, salt and turmeric'
  assert.equal(saidIn(t, 'cauliflower'), true)
  assert.equal(saidIn(t, 'Cauliflower with spinach'), false)
  assert.equal(saidIn(t, 'spinach'), false)
  assert.equal(saidIn('160 grams of palak', 'spinach'), true)
})

import { allowance } from '../src/lib/dish.ts'
test('how much ghee the dish can have for a calorie target, the carrot staying fixed', () => {
  const d = parseDish('I made gajar sabzi with 243 g carrot, 1 tablespoon ghee, half a teaspoon of turmeric, salt and half a teaspoon of amchur')
  assert.deepEqual(d.items.map(i => i.name), ['Carrot', 'Ghee', 'Turmeric', 'Salt', 'Amchur'])
  const a = allowance(d.items, 230, 'Ghee')!
  assert.ok(a.fits && a.grams > 8 && a.grams < 16, JSON.stringify(a))
  assert.ok(Math.abs(a.kcal - 230) <= 6)
  assert.equal(allowance(d.items, 60, 'Ghee')!.fits, false)
  assert.equal(allowance(d.items, 230, 'Zorblax'), null)
})

test('the ghee allowance also comes in millilitres, and only for fats', () => {
  const d = parseDish('I made gajar sabzi with 243 g carrot and 1 tablespoon ghee')
  const a = allowance(d.items, 230, 'Ghee')!
  assert.ok(a.ml != null && Math.abs(a.ml - a.grams / 0.91) < 0.1, JSON.stringify(a))
  assert.equal(allowance(d.items, 230, 'Carrot')!.ml, null)
})
