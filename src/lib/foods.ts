// The food library the meal builder works from. Every dish in the plan is here,
// plus a few more that fit clean eating. Protein and kcal are per 100 g cooked,
// rounded estimates from Indian food tables (IFCT), good enough to balance a
// day, not to count to the gram.
import type { Recipe } from './core'
import { modernName } from './names.ts'

export type Group = 'base' | 'protein' | 'veg' | 'side' | 'snack'
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type Food = {
  name: string; group: Group; meals: Meal[]
  grams: number                 // a normal portion, cooked
  p: number; kcal: number       // per 100 g
  office?: boolean              // a South Indian office canteen usually has it
  pairs?: string[]              // sides that go with a base
  recipe?: Recipe               // raw amounts, for foods the plan file has no recipe for
  nonveg?: boolean              // meat or fish: hidden for vegetarians
  source?: string               // where numbers from outside this list came from: usda-sr, cofid, off and so on
}

const B: Meal[] = ['breakfast'], L: Meal[] = ['lunch'], BL: Meal[] = ['breakfast', 'lunch']
const D: Meal[] = ['dinner'], LD: Meal[] = ['lunch', 'dinner'], ALL: Meal[] = ['breakfast', 'lunch', 'dinner']
const GRAVY = ['Pepper rasam, no dal', 'Jeera rasam, no dal', 'Garlic rasam, no dal', 'Buttermilk curry', 'Tamarind curry']

export const FOODS: Food[] = [
  // carb bases
  { name: 'Rice, cooked', group: 'base', meals: L, grams: 150, p: 2.7, kcal: 130, office: true, pairs: GRAVY },
  { name: 'Lemon rice', group: 'base', meals: L, grams: 180, p: 3, kcal: 165, office: true },
  { name: 'Coconut rice', group: 'base', meals: L, grams: 180, p: 3, kcal: 180 },
  { name: 'Tomato rice', group: 'base', meals: L, grams: 180, p: 3, kcal: 160, office: true },
  { name: 'Curd rice', group: 'base', meals: L, grams: 200, p: 3.5, kcal: 130, office: true,
    recipe: { per: 200, raw: [['Rice', 45, 'g'], ['Curd', 100, 'g']] } },
  { name: 'Quinoa, cooked', group: 'base', meals: L, grams: 150, p: 4.4, kcal: 120, pairs: GRAVY },
  { name: 'Foxtail millet, cooked', group: 'base', meals: L, grams: 150, p: 3.5, kcal: 120, pairs: GRAVY,
    recipe: { per: 150, raw: [['Foxtail millet', 50, 'g']] } },
  { name: 'Jowar roti, 2', group: 'base', meals: L, grams: 80, p: 8, kcal: 250 },
  { name: 'Bajra or jowar roti, 2', group: 'base', meals: L, grams: 80, p: 8, kcal: 250 },
  { name: 'Poha without peanuts', group: 'base', meals: B, grams: 150, p: 3, kcal: 160 },
  { name: 'Oats porridge in water with almond milk', group: 'base', meals: B, grams: 250, p: 2.5, kcal: 70, pairs: ['Berries', 'Walnuts and seeds'] },
  { name: 'Ragi dosa, 2', group: 'base', meals: B, grams: 160, p: 4, kcal: 170, pairs: ['Coconut chutney', 'Ginger chutney'] },
  { name: 'Sprouted moong dosa, 2', group: 'base', meals: B, grams: 180, p: 9, kcal: 160, pairs: ['Ginger chutney', 'Coconut chutney'] },
  { name: 'Appam or rice dosa, 2', group: 'base', meals: B, grams: 150, p: 2, kcal: 150, pairs: ['Vegetable stew in coconut milk', 'Coconut chutney'] },
  { name: 'Chia pudding in water and coconut milk', group: 'base', meals: B, grams: 200, p: 4, kcal: 130, pairs: ['Berries', 'Walnuts and seeds'] },
  { name: 'Quinoa upma with vegetables', group: 'base', meals: B, grams: 200, p: 4, kcal: 140 },
  { name: 'Sabudana khichdi without peanuts', group: 'base', meals: B, grams: 150, p: 0.5, kcal: 180,
    recipe: { per: 150, raw: [['Sabudana', 60, 'g'], ['Potato', 40, 'g']] } },

  // proteins
  // The coach's V1 protein: unflavoured whey isolate, one 30 g scoop in water.
  { name: 'Whey protein shake, unflavoured', group: 'protein', meals: ALL, grams: 30, p: 87, kcal: 403 },
  { name: 'Egg whites', group: 'protein', meals: B, grams: 100, p: 11, kcal: 52 },
  { name: 'Egg whites, boiled', group: 'protein', meals: BL, grams: 100, p: 11, kcal: 52 },
  { name: 'Boiled egg whites, 4, tossed with pepper and onion', group: 'protein', meals: D, grams: 160, p: 10, kcal: 55 },
  // the owner's paneer, from its label: 200 g = 50 g protein, 195 kcal.
  { name: 'Paneer (my brand)', group: 'protein', meals: ALL, grams: 120, p: 25, kcal: 98, office: false },
  { name: 'Paneer', group: 'protein', meals: ALL, grams: 120, p: 25, kcal: 98 },
  { name: 'Paneer bhurji', group: 'protein', meals: LD, grams: 150, p: 15, kcal: 260 },
  { name: 'Paneer tikka', group: 'protein', meals: LD, grams: 150, p: 18, kcal: 280, office: true },
  { name: 'Paneer and vegetable skewers', group: 'protein', meals: D, grams: 200, p: 12, kcal: 200 },
  { name: 'Palak paneer', group: 'protein', meals: LD, grams: 200, p: 9, kcal: 170, office: true },
  { name: 'Paneer and vegetable stew in coconut milk', group: 'protein', meals: D, grams: 250, p: 8, kcal: 160 },
  { name: 'Grilled paneer and feta salad', group: 'protein', meals: D, grams: 220, p: 12, kcal: 210 },
  { name: 'Sprouted moong subji', group: 'protein', meals: LD, grams: 150, p: 7, kcal: 110 },
  { name: 'Sprouted kabuli chana curry', group: 'protein', meals: L, grams: 150, p: 7, kcal: 150 },
  { name: 'Sprouted rajma curry', group: 'protein', meals: L, grams: 150, p: 7, kcal: 140 },
  { name: 'Hung curd', group: 'protein', meals: ALL, grams: 150, p: 9, kcal: 100,
    recipe: { per: 150, raw: [['Curd, strained overnight', 300, 'g']], overnight: true } },
  { name: 'Curd', group: 'protein', meals: BL, grams: 150, p: 3.5, kcal: 60, office: true },

  // meat, fish and whole eggs: only offered to non-vegetarians (see DIET in core)
  { name: 'Grilled chicken', group: 'protein', meals: LD, grams: 150, p: 27, kcal: 190, nonveg: true, office: true },
  { name: 'Chicken curry, no cream', group: 'protein', meals: LD, grams: 200, p: 14, kcal: 160, nonveg: true, office: true },
  { name: 'Tandoori chicken', group: 'protein', meals: LD, grams: 200, p: 25, kcal: 180, nonveg: true, office: true },
  { name: 'Grilled fish', group: 'protein', meals: LD, grams: 150, p: 22, kcal: 130, nonveg: true },
  { name: 'Fish curry, coconut', group: 'protein', meals: LD, grams: 200, p: 12, kcal: 150, nonveg: true, office: true },
  { name: 'Prawns, sautéed', group: 'protein', meals: LD, grams: 150, p: 20, kcal: 120, nonveg: true },
  { name: 'Mutton curry', group: 'protein', meals: L, grams: 150, p: 18, kcal: 230, nonveg: true },
  { name: 'Chicken keema, no peas', group: 'protein', meals: LD, grams: 150, p: 18, kcal: 200, nonveg: true },

  // vegetables
  { name: 'Beans sabzi', group: 'veg', meals: L, grams: 120, p: 2, kcal: 70, office: true },
  { name: 'Carrot and beans sabzi', group: 'veg', meals: L, grams: 120, p: 1.8, kcal: 70, office: true },
  { name: 'Cabbage coconut sabzi', group: 'veg', meals: L, grams: 120, p: 2, kcal: 80, office: true },
  { name: 'Okra fry', group: 'veg', meals: L, grams: 150, p: 2, kcal: 90, office: true },
  { name: 'Coconut vegetable curry', group: 'veg', meals: L, grams: 150, p: 2.5, kcal: 110, office: true },
  { name: 'Cauliflower roast', group: 'veg', meals: LD, grams: 150, p: 2.5, kcal: 90 },
  { name: 'Sautéed mixed vegetables', group: 'veg', meals: LD, grams: 200, p: 2, kcal: 70 },
  { name: 'Mushrooms and spinach, sautéed', group: 'veg', meals: D, grams: 200, p: 3.5, kcal: 60 },
  { name: 'Stir-fried broccoli and beans', group: 'veg', meals: D, grams: 200, p: 3, kcal: 60 },
  { name: 'Roasted vegetables', group: 'veg', meals: D, grams: 200, p: 2, kcal: 70 },
  { name: 'Roasted capsicum and onion', group: 'veg', meals: D, grams: 150, p: 1.2, kcal: 50 },
  { name: 'Carrot salad', group: 'veg', meals: L, grams: 100, p: 1, kcal: 45 },
  { name: 'Cucumber salad', group: 'veg', meals: LD, grams: 150, p: 0.7, kcal: 20 },
  { name: 'Raw salad', group: 'veg', meals: LD, grams: 150, p: 1, kcal: 25, office: true },
  { name: 'Clear soup', group: 'veg', meals: D, grams: 250, p: 1, kcal: 25 },
  { name: 'Clear vegetable soup', group: 'veg', meals: D, grams: 250, p: 1, kcal: 25 },
  { name: 'Tomato and vegetable soup, no cornflour', group: 'veg', meals: D, grams: 250, p: 1, kcal: 35 },

  { name: 'Dondakaya (tindora) fry', group: 'veg', meals: LD, grams: 120, p: 1.5, kcal: 80, office: true },
  { name: 'Vankaya (brinjal) curry', group: 'veg', meals: LD, grams: 120, p: 1.5, kcal: 80, office: true },
  { name: 'Beetroot sabzi', group: 'veg', meals: LD, grams: 100, p: 1.6, kcal: 70 },
  { name: 'Onion and tomato masala', group: 'veg', meals: LD, grams: 150, p: 1.3, kcal: 45 },

  // sides that go with a base
  { name: 'Pepper rasam, no dal', group: 'side', meals: L, grams: 200, p: 0.5, kcal: 20, office: true },
  { name: 'Jeera rasam, no dal', group: 'side', meals: L, grams: 200, p: 0.5, kcal: 20 },
  { name: 'Garlic rasam, no dal', group: 'side', meals: L, grams: 200, p: 0.5, kcal: 20 },
  { name: 'Buttermilk curry', group: 'side', meals: L, grams: 150, p: 1.5, kcal: 60, office: true },
  { name: 'Tamarind curry', group: 'side', meals: L, grams: 150, p: 1, kcal: 60 },
  { name: 'Vegetable stew in coconut milk', group: 'side', meals: B, grams: 150, p: 1.5, kcal: 90 },
  { name: 'Coconut chutney', group: 'side', meals: B, grams: 40, p: 2, kcal: 200 },
  { name: 'Ginger chutney', group: 'side', meals: B, grams: 30, p: 1, kcal: 120 },
  { name: 'Berries', group: 'side', meals: B, grams: 50, p: 0.7, kcal: 50 },
  { name: 'Walnuts and seeds', group: 'side', meals: B, grams: 15, p: 18, kcal: 600 },
  { name: 'Cucumber raita', group: 'side', meals: L, grams: 100, p: 3, kcal: 55, office: true },
  { name: 'Buttermilk', group: 'side', meals: L, grams: 250, p: 1.5, kcal: 20, office: true },
  { name: 'Homemade pickle', group: 'side', meals: L, grams: 10, p: 1, kcal: 150 },

  // snacks, one at a time
  { name: 'Roasted makhana', group: 'snack', meals: ['snack'], grams: 25, p: 9.7, kcal: 350 },
  { name: 'Almonds and walnuts', group: 'snack', meals: ['snack'], grams: 20, p: 18, kcal: 620 },
  { name: 'Sprouted moong sundal', group: 'snack', meals: ['snack'], grams: 100, p: 7, kcal: 110 },
  { name: 'Cucumber and carrot sticks', group: 'snack', meals: ['snack'], grams: 150, p: 0.8, kcal: 30 },
  { name: 'Walnuts', group: 'snack', meals: ['snack'], grams: 15, p: 15, kcal: 650 },
  { name: 'Herbal tea, plain', group: 'snack', meals: ['snack'], grams: 200, p: 0, kcal: 2 },
  { name: 'Salted lime water', group: 'snack', meals: ['snack'], grams: 300, p: 0, kcal: 5 },
  // The coach's daily drinks (24 Oct): about 5 g chia and 5 g psyllium husk in water.
  { name: 'Fibre drink (chia and psyllium husk)', group: 'snack', meals: ['snack'], grams: 260, p: 0.4, kcal: 15 },
]

const BY_NAME = new Map(FOODS.map(f => [f.name.toLowerCase(), f]))

/** Best guesses for food typed by hand: first match wins. */
const GUESS: [RegExp, Group, number, number][] = [
  [/chicken/i, 'protein', 20, 180], [/fish|prawn|shrimp|salmon|tuna/i, 'protein', 18, 140], [/mutton|lamb|goat|keema/i, 'protein', 18, 230],
  [/paneer/i, 'protein', 15, 260], [/egg white/i, 'protein', 11, 52], [/sprout/i, 'protein', 7, 120],
  [/hung curd|greek/i, 'protein', 9, 100], [/raita|curd/i, 'protein', 3.5, 60], [/buttermilk|mor\b/i, 'side', 1.5, 20],
  [/rasam|soup/i, 'side', 0.7, 25], [/kuzhambu|stew|curry|gravy/i, 'side', 1.5, 80], [/chutney/i, 'side', 2, 150],
  // Word starts only: "protien shake" once matched roti and counted 200 g of shake as 500 kcal.
  [/\b(rice|biryani|pulao)/i, 'base', 3, 140], [/quinoa/i, 'base', 4.4, 120], [/millet/i, 'base', 3.5, 120],
  [/\b(roti|bhakri)/i, 'base', 8, 250], [/dosa|appam|pesarattu|puttu|idiyappam/i, 'base', 3, 160],
  [/poha|upma|oats|sabudana/i, 'base', 3, 140], [/makhana/i, 'snack', 9.7, 350], [/almond|walnut|seed|nuts?\b/i, 'snack', 18, 600],
  [/salad|poriyal|thoran|sabzi|subji|fry|roast|sautéed|vegetable|beans|cabbage|okra|bhindi|spinach|palak|mushroom|broccoli|cauliflower|carrot|cucumber|gourd/i, 'veg', 2, 70],
]

// ---- foods from the open tables and from barcodes -------------------------------------

type WorldRow = [name: string, source: string, id: string, kcal: number, p: number, carb: number | null, fat: number | null, fibre: number | null]
let WORLD_ROWS: WorldRow[] = []
let WORLD = new Map<string, WorldRow>()
/** Loads the open food tables (src/data/world-foods.json). db.ts does this at start-up. */
export function setWorldFoods(rows: unknown[][]) {
  WORLD_ROWS = rows as WorldRow[]
  WORLD = new Map(WORLD_ROWS.map(r => [r[0].toLowerCase(), r]))
}
const asFood = (r: WorldRow): Food => ({ name: r[0], group: 'side', meals: [], grams: 100, p: r[4], kcal: r[3], source: r[1] })
/** Foods added on this phone, such as packets read from a barcode. db.ts fills this at start-up. */
const EXTRA = new Map<string, Food>()
export function addExtraFoods(xs: Food[]) { for (const f of xs) EXTRA.set(f.name.toLowerCase(), f) }

/** Protein and kcal per 100 g or ml, from what a label gives for some amount
 *  (100 g, or one 31 g scoop). Null unless all three are there and make sense. */
export function per100(n: { amount: number | null; protein: number | null; kcal: number | null }): { p: number; kcal: number } | null {
  const { amount, protein, kcal } = n
  if (amount == null || !(amount > 0) || protein == null || !(protein >= 0) || kcal == null || !(kcal >= 0)) return null
  const f = 100 / amount
  return { p: Math.round(protein * f * 10) / 10, kcal: Math.round(kcal * f) }
}

/** The amount a nutrition column is for, read from its heading as printed:
 *  "Per serving (31 g)" is 31 g, "Per 100 ml" is 100 ml. Empty when the heading
 *  gives no weight ("Per scoop"), so the model's own amount stands. */
export function columnAmount(heading: string): { amount?: number; unit?: 'g' | 'ml' } {
  const m = /(\d+(?:[.,]\d+)?)\s*(g|gm|grams?|ml)\b/i.exec(heading)
  if (!m) return {}
  return { amount: Number(m[1].replace(',', '.')), unit: m[2].toLowerCase() === 'ml' ? 'ml' : 'g' }
}

/** Names that contain the typed text, from the open tables and this phone's own foods: shortest names first. */
export function searchFoods(q: string, limit = 8): string[] {
  const t = q.trim().toLowerCase()
  if (t.length < 2) return []
  const words = t.split(/\s+/)
  const hit = (n: string) => { const l = n.toLowerCase(); return words.every(w => l.includes(w)) }
  const out = [...EXTRA.values()].map(f => f.name).filter(hit)
  for (const r of WORLD_ROWS) { if (out.length >= 200) break; if (hit(r[0])) out.push(r[0]) }
  return out.sort((a, b) => a.length - b.length).slice(0, limit)
}
export const worldCount = () => WORLD_ROWS.length

/** What the library knows about a food name: foods added on the phone first (so
 *  numbers typed from a label win), then this list, then the open tables, and
 *  only then a best guess from the name. */
export function lookup(name: string): (Food & { guessed?: boolean }) | null {
  name = modernName(name)
  const key = name.trim().toLowerCase()
  const own = EXTRA.get(key), listed = BY_NAME.get(key)
  // A listed food keeps its usual amount and group; only the numbers are his.
  if (own) return listed ? { ...listed, p: own.p, kcal: own.kcal, source: own.source } : own
  if (listed) return listed
  const raw = RAW.get(key)
  if (raw) return { name, group: 'side', meals: [], grams: 100, p: raw[0], kcal: raw[1], source: 'usda-sr' }
  const w = WORLD.get(key)
  if (w) return asFood(w)
  // Any way of typing whey or a protein shake means the scoop of the V1 whey, not a guess or a dairy by-product.
  if (/\b(whey|protein powder|protein shake)\b/i.test(name)) { const f = BY_NAME.get('whey protein shake, unflavoured')!; return { ...f, name } }
  for (const [re, group, p, kcal] of GUESS) if (re.test(name)) return { name, group, meals: ['breakfast', 'lunch', 'dinner'], grams: 100, p, kcal, guessed: true }
  return null
}

/** Carbohydrate and fat in grams per 100 g for the foods in the recipes (USDA FoodData Central values, rounded). Used for the day card only. */
const MACROS: Record<string, [number, number]> = {
  amchur: [66, 3], salt: [0, 0], water: [0, 0], paneer: [1.2, 20.8], tomato: [3.9, 0.2], 'apple cider vinegar': [1, 0], asparagus: [4, 0.1], avocado: [8.5, 14.7], basil: [2.7, 0.6], 'bay leaf': [75, 8.4], beetroot: [9.6, 0.2], 'bok choy': [2.2, 0.2],
  broccoli: [6.6, 0.4], 'brussels sprouts': [9, 0.3], butter: [0.1, 81], cabbage: [5.8, 0.1], cardamom: [68, 6.7], 'carom seeds': [38, 25], carrot: [9.6, 0.2], cauliflower: [5, 0.3],
  celery: [3, 0.2], 'chaat masala': [46, 6], 'chia seeds': [42, 31], cinnamon: [81, 1.2], cloves: [66, 13], 'coconut oil': [0, 100], 'coriander leaves': [3.7, 0.5], 'coriander powder': [55, 17],
  'coriander seeds': [55, 17], cucumber: [3.6, 0.1], 'cumin powder': [44, 22], 'cumin seeds': [44, 22], 'curry leaves': [19, 1], 'egg white': [0.7, 0.2], 'fennel seeds': [52, 15],
  'fenugreek seeds': [58, 6.4], 'french beans': [7, 0.2], 'garam masala': [50, 15], garlic: [33, 0.5], ghee: [0, 100], ginger: [18, 0.8], 'ginger garlic paste': [20, 1], gooseberry: [10, 0.3],
  hing: [68, 1.1], kalonji: [44, 22], 'lemon juice': [6.9, 0.2], lettuce: [2.9, 0.2], 'lime juice': [8.4, 0.1], mint: [8, 0.7], 'mint powder': [8, 0.7], 'mixed herbs': [50, 6],
  'mustard oil': [0, 100], 'mustard seeds': [28, 36], 'olive oil': [0, 100], olives: [3.8, 10.7], onion: [9.3, 0.1], oregano: [69, 4.3], parsley: [6.3, 0.8], pepper: [64, 3.3],
  peppercorns: [64, 3.3], 'psyllium husk': [85, 0.6], 'raw mango': [15, 0.4], 'sesame oil': [0, 100], 'shahi jeera': [44, 22], shallots: [17, 0.1], spinach: [3.6, 0.4], 'spring onion': [7.3, 0.2],
  'star anise': [50, 16], tulsi: [2.7, 0.6], turmeric: [67, 10], 'vegetable stock': [0.8, 0.1], vinegar: [0, 0], 'wheat grass': [3, 0.3], 'whey isolate': [3, 1.5], 'white pumpkin': [3.4, 0.1], zucchini: [3.1, 0.3],
}
/** Carbohydrate and fat in grams for an amount of a food, or null when the food is not in the table. */
export function macrosOf(name: string, grams: number | null): { carb: number; fat: number } | null {
  const m = MACROS[name.trim().toLowerCase()]
  if (!m || grams == null) return null
  return { carb: (m[0] * grams) / 100, fat: (m[1] * grams) / 100 }
}

/** Foods on the coach's V1 (detox) list, per 100 g or one scoop: the coach's own numbers (their flash cards and "V1 Diet List"). */
const RAW = new Map<string, [number, number]>(Object.entries({
  'egg white': [12.1, 56], 'whey isolate': [87, 403], 'chia seeds': [20, 420], 'psyllium husk': [2, 88],
  'ghee': [0, 900], 'olive oil': [0, 880], 'butter': [0.9, 780], 'coconut oil': [0, 870], 'sesame oil': [0, 920],
  'cabbage': [1.3, 25], 'onion': [1.1, 40], 'spring onion': [1.8, 32], 'olives': [0.8, 116], 'carrot': [0.9, 41], 'beetroot': [1.6, 43],
  'cauliflower': [1.9, 25], 'broccoli': [2.8, 34], 'cucumber': [0.7, 15], 'celery': [0.7, 14], 'french beans': [1.8, 24],
  'spinach': [2.9, 23], 'avocado': [2, 160], 'lettuce': [1.4, 14], 'zucchini': [1.2, 20], 'asparagus': [2.2, 20],
  'raw mango': [0.5, 60], 'gooseberry': [0.9, 44], 'tulsi': [3.2, 23], 'wheat grass': [2, 21], 'white pumpkin': [0.4, 17], 'bok choy': [1.5, 13], 'brussels sprouts': [3.4, 43],
  'ginger': [1.8, 80], 'garlic': [6.4, 149], 'salt': [0, 0], 'water': [0, 0], 'paneer': [18, 265], 'tomato': [0.9, 18],
  // Seasonings and extras the the coach recipe cards use: USDA per 100 g.
  'mustard oil': [0, 884], 'shallots': [2.5, 72], 'parsley': [3, 36], 'basil': [3.2, 23], 'mint': [3.3, 44], 'coriander leaves': [2.1, 23], 'curry leaves': [6.1, 108], 'lime juice': [0.4, 25], 'apple cider vinegar': [0, 22], 'vinegar': [0, 18], 'turmeric': [9.7, 312], 'cumin seeds': [17.8, 375], 'mustard seeds': [26, 508], 'fennel seeds': [15.8, 345], 'fenugreek seeds': [23, 323], 'kalonji': [16, 345], 'carom seeds': [15.5, 305], 'pepper': [10.4, 251], 'hing': [4, 297], 'garam masala': [10, 330], 'coriander powder': [12, 298], 'coriander seeds': [12.4, 298], 'amchur': [6, 335], 'chaat masala': [5, 250], 'bay leaf': [7.6, 313], 'cloves': [6, 274], 'cinnamon': [4, 247], 'cardamom': [11, 311], 'star anise': [17.6, 337], 'mixed herbs': [9, 265], 'oregano': [9, 265], 'ginger garlic paste': [3, 100], 'shahi jeera': [17.8, 375], 'cumin powder': [17.8, 375], 'lemon juice': [0.4, 22], 'peppercorns': [10.4, 251], 'vegetable stock': [0.3, 5], 'mint powder': [3.3, 44],
}))

/** Raw amounts for library foods the plan has no recipe for. */
export const FOOD_RECIPES: Record<string, Recipe> =
  Object.fromEntries(FOODS.filter(f => f.recipe).map(f => [f.name, f.recipe!]))
