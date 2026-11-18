// Turns a spoken or typed sentence ("2 egg whites and 150 g paneer") into foods with amounts.
// Used for Siri's "Log what I ate": the sentence is queued while the app is closed and parsed when it opens.
import { countedAs } from './servings.ts'
import { lookup, searchFoods } from './foods.ts'

export type Spoken = { name: string; grams: number | null; ml: number | null }

const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
const FILLER = /\b(i|had|ate|eaten|have|my|some|the|of|for|about|around|approximately|just|also|today|now)\b/gi
const UNIT = '(?:g|gm|gms|gram|grams|ml|millilitres?|milliliters?)'

/** One piece of the sentence: an amount (grams, millilitres or a count) and a food name. */
function piece(seg: string): Spoken | null {
  let s = ` ${seg.toLowerCase().replace(/\s+/g, ' ').trim()} `
  let grams: number | null = null, ml: number | null = null, count: number | null = null
  const u = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})\\b`).exec(s)
  if (u) {
    const n = Number(u[1].replace(',', '.'))
    if (/^m/.test(u[2])) ml = n; else grams = n
    s = s.replace(u[0], ' ')
  } else {
    const c = /\b(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\b/.exec(s)
    if (c) { count = WORDS[c[1]] ?? Number(c[1]); s = s.replace(c[0], ' ') }
  }
  const name = s.replace(FILLER, ' ').replace(/\s+/g, ' ').trim()
  if (name.length < 2) return null
  const food = searchFoods(name, 1)[0] ?? (lookup(name) ? name : name)
  if (grams == null && ml == null && count != null) {
    const c = countedAs(food) ?? countedAs(name)
    grams = c ? count * c.each : null
  }
  return { name: food, grams, ml }
}

/** Foods and amounts in a sentence. Pieces are split on "and", "with", "plus" and commas. */
export function parseSpoken(text: string): Spoken[] {
  return text.split(/\s*(?:,|\band\b|\bwith\b|\bplus\b)\s*/i).map(piece).filter((x): x is Spoken => !!x)
}
