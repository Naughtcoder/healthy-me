import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matches } from '../src/lib/search.ts'

test('kobi and gobi find cauliflower, fry finds roasts and tawa dishes', () => {
  assert.ok(matches('Mashed cauliflower', 'kobi'))
  assert.ok(matches('Cauliflower tawa fry', 'gobi fry'))
  assert.ok(matches('Roasted cauliflower', 'cauliflower fry'))
  assert.ok(!matches('Mashed cauliflower', 'paneer'))
})
test('palak finds spinach dishes', () => { assert.ok(matches('Spinach soup', 'palak')) })

import { rank } from '../src/lib/search.ts'
test('names that start with what you typed come first', () => {
  assert.ok(rank('Cauliflower tawa fry', 'cauli') < rank('Mashed cauliflower', 'cauli'))
  assert.ok(rank('Mashed cauliflower', 'cauli') < rank('Spinach soup', 'palak'))
  assert.equal(rank('Spinach soup', 'soup spinach'), 1)
})
