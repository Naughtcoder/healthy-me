// Turning what a vision model sees into grams. Small models count servings far
// better than they guess weights, so the model reports "2 roti" or "1 katori"
// and these tables convert. Weights are typical home portions, cooked.

/** Grams in one of each serving unit, for anything without its own entry below. */
export const UNIT_GRAMS: Record<string, number> = {
  katori: 150,        // a small steel bowl of dal, sabzi, curd or rasam
  bowl: 250,          // a large bowl or soup bowl
  cup: 200,           // 1 measuring cup of cooked rice or similar
  ladle: 100,         // one serving-spoon pour
  tablespoon: 15,
  teaspoon: 5,
  plate: 300,         // a full plate of one dish, like poha or upma
  glass: 250,         // buttermilk, water
  piece: 50,          // a cube, a slice, a pakora-sized piece
  handful: 30,
}

/** Foods whose own unit is clearer than a bowl. Matched on the name. */
const PIECES: [RegExp, number][] = [
  [/roti|chapati|phulka|bhakri/i, 40],
  [/paratha/i, 80],
  [/dosa|pesarattu|uttapam/i, 80],
  [/idli/i, 45],
  [/appam/i, 60],
  [/egg white/i, 33],            // one large egg's white
  [/egg/i, 50],
  [/paneer tikka|skewer/i, 25],  // one cube
  [/papad/i, 10],
]

/** Grams for a count of servings of a food. */
export function toGrams(name: string, count: number, unit: string) {
  const u = unit.toLowerCase().replace(/e?s$/, '')
  const piece = PIECES.find(([re]) => re.test(name))
  const each = ['piece', 'number', 'whole', 'slice', 'cube'].includes(u) && piece ? piece[1]
    : UNIT_GRAMS[u] ?? (piece ? piece[1] : 100)
  return Math.max(5, Math.round((each * count) / 5) * 5)
}

export const UNITS = Object.keys(UNIT_GRAMS)

/** Foods you count rather than weigh: egg whites, rotis, dosas. Grams are kept
 *  underneath (the day's numbers need them), but the screens show the count.
 *  Mixed dishes that only contain eggs ("tossed with pepper") are weighed. */
const COUNTED: [RegExp, number, string, string][] = [
  [/egg whites?/i, 33, 'egg white', 'egg whites'],
  [/\b(roti|chapati|phulka|bhakri)s?\b/i, 40, 'roti', 'rotis'],
  [/pesarattu/i, 90, 'pesarattu', 'pesarattus'],
  [/\bdosas?\b/i, 80, 'dosa', 'dosas'],
  [/\bappams?\b/i, 60, 'appam', 'appams'],
]
export function countedAs(name: string) {
  if (/tossed|with|curry|bhurji|subji/i.test(name)) return null
  const c = COUNTED.find(([re]) => re.test(name))
  return c ? { each: c[1], one: c[2], many: c[3] } : null
}
/** "3 egg whites" for counted foods, "150 g" for the rest. */
export function amountLabel(name: string, grams: number | null | undefined) {
  if (!grams) return ''
  const c = countedAs(name)
  if (!c) return `${grams} g`
  const n = Math.max(1, Math.round(grams / c.each))
  return `${n} ${n === 1 ? c.one : c.many}`
}
