import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSpoken } from '../src/lib/spoken.ts'

test('grams and ml are read from the sentence', () => {
  const r = parseSpoken('I had 150 g paneer and 200 ml buttermilk')
  assert.equal(r.length, 2)
  assert.equal(r[0].grams, 150)
  assert.match(r[0].name, /paneer/i)
  assert.equal(r[1].ml, 200)
})

test('a count of egg whites becomes grams', () => {
  const r = parseSpoken('three egg whites')
  assert.equal(r.length, 1)
  assert.match(r[0].name, /egg white/i)
  assert.equal(r[0].grams, 99)
})

test('commas, "with" and "plus" split foods; filler words are dropped', () => {
  const r = parseSpoken('I ate 100 g carrot, 50 g raw mango plus 3 g ghee')
  assert.deepEqual(r.map(x => x.grams), [100, 50, 3])
})

test('an empty sentence gives nothing', () => {
  assert.deepEqual(parseSpoken('  '), [])
})
