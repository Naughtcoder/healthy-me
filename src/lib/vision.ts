// Photos read by an open-source model (Qwen3-VL 8B) on your own Modal
// account: a plate (what is on it, and how much) and a restaurant menu (which
// dishes fit the rules). The server sleeps when idle; the first photo after a
// quiet spell takes about 30 seconds while it wakes, later ones about 5.
// See vision-server/server.py. Only the photo leaves the phone.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { columnAmount, lookup } from './foods'
import { toGrams } from './servings'

const URL = 'https://your-workspace--vision-serve.modal.run/v1/chat/completions'
// Set at build time from .env.local (not in git). The server refuses requests without it.
const KEY = process.env.EXPO_PUBLIC_VISION_KEY ?? ''
export const visionReady = () => KEY.length > 0

export const RULES = 'Clean-eating phase of a coach-led diet. Not allowed: wheat or anything with atta, maida or rava; milk (curd, buttermilk, ghee, butter, paneer and unprocessed cheese are fine); sugar, jaggery, honey or sweets; fruit except berries; dry fruit; dal, lentils, sambar, chole or rajma unless sprouted; idli, dosa, vada or anything made from urad dal batter (ragi, neer, jowar and sprouted moong dosa are fine); soy; corn or cornflour; peanuts and cashews; egg yolk (egg whites only); packaged or instant food; tender coconut. Rice, millets, quinoa, vegetables, paneer, egg whites and other nuts and seeds are fine. No carbs after 6 pm. Vegetarian apart from egg whites.'

/** A photo shrunk to 1024 px wide, as base64 JPEG, small enough to send quickly. */
export async function prepare(uri: string) {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: 1024 }).renderAsync()
  const out = await ref.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true })
  return out.base64!
}

const TIMED_OUT = 'No answer after two minutes. The reading server may be busy. Try again in a few minutes, or type it in.'

/** One read, stopped after two minutes: Modal can hold a request with no
 *  answer while it waits for a free GPU, and the app should say so rather
 *  than spin forever. */
async function ask<T>(image: string | null, prompt: string, schema: object, maxTokens = 700): Promise<T> {
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), 120_000)
  try { return await send<T>(image, prompt, schema, maxTokens, stop.signal) }
  finally { clearTimeout(timer) }
}

async function send<T>(image: string | null, prompt: string, schema: object, maxTokens: number, signal: AbortSignal): Promise<T> {
  if (!KEY) throw new Error('Photo reading is not set up in this build.')
  // The server sleeps when idle and answers 503 for the first several seconds
  // while it wakes, so keep asking for up to about a minute before giving up.
  let http: Response | null = null
  for (let i = 0; i < 12; i++) {
    try {
      http = await fetch(URL, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        temperature: 0.1, max_tokens: maxTokens,
        response_format: { type: 'json_schema', json_schema: { name: 'answer', schema } },
        messages: [{ role: 'user', content: [
          ...(image ? [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } }] : []),
          { type: 'text', text: prompt },
        ] }],
      }),
    })
    } catch {
      throw new Error(signal.aborted ? TIMED_OUT : 'No connection. Try again when you are online.')
    }
    if (http.status !== 503) break
    await new Promise(r => setTimeout(r, 5000))
  }
  if (!http) throw new Error('No answer came back. Try again.')
  if (http.status === 503) throw new Error('The reading server is still waking up. Try again in a minute.')
  if (http.status === 401) throw new Error('The photo server refused this app. The key needs updating.')
  if (http.status === 429 || http.status === 402) throw new Error('This month\'s free photo credit is used up. It resets next month.')
  if (!http.ok) throw new Error(`That could not be read (error ${http.status}). Try again.`)
  const res = await http.json().catch(() => { throw new Error(signal.aborted ? TIMED_OUT : 'No answer came back. Try again.') })
  const text = res?.choices?.[0]?.message?.content
  if (!text) throw new Error('No answer came back. Try again.')
  return JSON.parse(text) as T
}

const UNITS = ['piece', 'small bowl', 'large bowl', 'cup', 'tablespoon', 'plate', 'glass']
const UNIT_KEY: Record<string, string> = { 'small bowl': 'katori', 'large bowl': 'bowl' }

/** The food-list name for a dish, only when it is the same food. Anything
 *  looser (sharing one word, like "dal" and "rasam, no dal") would hide rule
 *  breaks, so the model's own name is kept and the rules check reads it. */
function match(dish: string) {
  const exact = lookup(dish)
  return exact && !exact.guessed ? exact.name : dish.charAt(0).toUpperCase() + dish.slice(1)
}

export type PlateItem = { name: string; grams: number; seen: string; count: number; unit: string }
/** What is on the plate: each dish once, matched to the food list where possible,
 *  with grams worked out from the counted servings (models count better than they weigh). */
export async function readPlate(image: string) {
  const out = await ask<{ items: { dish: string; count: number; unit: string }[] }>(image,
    'Identify each separate dish or food visible in this photo of a meal, using the specific Indian dish name where you recognise it, in English or Hindi only (never Tamil, Malayalam, Marathi or other regional names: say sabzi, not poriyal or thoran). Give each dish once. For each, estimate the amount as a count and a unit: "piece" for countable items such as rotis, papads, dosas, egg whites or paneer cubes; "small bowl" for a katori; "cup" for a mound of rice; "tablespoon" for chutney or pickle; "glass" for a drink. Answer in JSON.',
    {
      type: 'object', additionalProperties: false, required: ['items'],
      properties: { items: { type: 'array', maxItems: 10, items: {
        type: 'object', additionalProperties: false, required: ['dish', 'count', 'unit'],
        properties: { dish: { type: 'string' }, count: { type: 'number' }, unit: { type: 'string', enum: UNITS } },
      } } },
    })
  // Small models sometimes repeat one dish down the list: keep the first of each.
  const seen = new Set<string>(), items: PlateItem[] = []
  for (const x of out.items) {
    const name = match(x.dish)
    if (seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    items.push({ name, seen: x.dish, count: x.count, unit: x.unit, grams: toGrams(name, x.count, UNIT_KEY[x.unit] ?? x.unit) })
  }
  return items
}

export type MenuDish = { name: string; verdict: 'yes' | 'no' | 'ask'; why: string }
/** Every dish on a menu photo, marked as fitting the rules, not fitting, or depending on how it is made. */
export async function readMenu(image: string, afterCutoff: boolean) {
  const out = await ask<{ dishes: MenuDish[] }>(image,
    `This is a photo of a restaurant menu. The diner follows these rules: ${RULES}${afterCutoff ? ' It is now after 6 pm, so any dish that is mainly rice, roti, millet or another carb is a no.' : ''} For each dish printed on the menu, give its name as printed, a verdict ("yes" fits, "no" does not, "ask" depends on how it is made), and a reason under 15 words. For "ask", say what to ask the waiter. Answer in JSON.`,
    {
      type: 'object', additionalProperties: false, required: ['dishes'],
      properties: { dishes: { type: 'array', maxItems: 40, items: {
        type: 'object', additionalProperties: false, required: ['name', 'verdict', 'why'],
        properties: { name: { type: 'string' }, verdict: { type: 'string', enum: ['yes', 'no', 'ask'] }, why: { type: 'string' } },
      } } },
    })
  const seen = new Set<string>()
  return out.dishes.filter(d => !seen.has(d.name.toLowerCase()) && seen.add(d.name.toLowerCase()))
}

/** One column of the nutrition table: its heading as printed, how much it is
 *  for, and the protein and kcal in that much. */
export type LabelNumbers = { heading: string; amount: number | null; unit: 'g' | 'ml'; protein: number | null; kcal: number | null }
export type Label = { product: string; ingredients: string[]; nutrition: LabelNumbers }
/** The product name, every ingredient printed on a packet's label, and its
 *  protein and calories as printed (the per-100 column when there is one).
 *  The amount comes from the column heading when it says one: on a test
 *  label the model read "Per serving (31 g)" and still answered 100. */
export async function readLabel(image: string): Promise<Label> {
  const out = await ask<Label>(image,
    'This is a photo of a food packet. Give the product name, and list every ingredient printed in its ingredients list, one per item, in the order printed and in English (translate if the label is in another language), including anything in brackets as its own item (for example "Edible vegetable oil (palm oil)" gives "Edible vegetable oil" and "palm oil"). If no ingredients list is visible, return an empty list. Then read the nutrition table: use the per 100 g (or per 100 ml) column if one is printed, otherwise the per serving or per scoop column. Copy that column\'s heading exactly as printed (for example "Per 100 g" or "Per serving (31 g)"), then give the amount that column is for (100, or the serving size in grams or ml), its unit (g or ml), the protein in grams and the energy in kcal (if only kJ is printed, divide by 4.184). Use an empty heading and null for anything not printed. Answer in JSON.',
    {
      type: 'object', additionalProperties: false, required: ['product', 'ingredients', 'nutrition'],
      properties: {
        product: { type: 'string' }, ingredients: { type: 'array', maxItems: 60, items: { type: 'string' } },
        nutrition: { type: 'object', additionalProperties: false, required: ['heading', 'amount', 'unit', 'protein', 'kcal'], properties: {
          heading: { type: 'string' }, amount: { type: ['number', 'null'] }, unit: { type: 'string', enum: ['g', 'ml'] },
          protein: { type: ['number', 'null'] }, kcal: { type: ['number', 'null'] },
        } },
      },
    })
  return { ...out, nutrition: { ...out.nutrition, ...columnAmount(out.nutrition.heading) } }
}

export type Strip = { product: string; ingredients: { name: string; amount: string }[] }
/** The product name and the active ingredients in one dose, from a photo of a
 *  medicine or supplement strip, box or bottle. */
export function readStrip(image: string) {
  return ask<Strip>(image,
    'This is a photo of a medicine or supplement: a strip, box, bottle or its label. Give the product name as printed, with its strength when printed (for example "Vitamin D3 1000"). Then list each active ingredient in one tablet, capsule, sachet or dose, from the composition panel ("Each capsule contains" or "Composition"), in the order printed. For each give its common English name without IP, BP or USP (for example "Coenzyme Q10", "Vitamin E (dl-Alpha Tocopheryl Acetate)"), and the amount with its unit as printed (for example "300 mg", "2000 IU", "10 billion CFU"), or an empty string when no amount is printed. Leave out excipients, colours, flavours, the capsule shell and anything marked q.s. If no composition is visible, return an empty list. Answer in JSON.',
    {
      type: 'object', additionalProperties: false, required: ['product', 'ingredients'],
      properties: { product: { type: 'string' }, ingredients: { type: 'array', maxItems: 30, items: {
        type: 'object', additionalProperties: false, required: ['name', 'amount'],
        properties: { name: { type: 'string' }, amount: { type: 'string' } },
      } } },
    }, 900)
}

export type RxItem ={ name: string; dose: string; times: string[]; withFood: string; days: number | null; everyDays: number; note: string }
const RX_FOOD = ['empty stomach', 'before food', 'with breakfast', 'with lunch', 'with dinner', 'after food', 'at bedtime']
/** Every medicine or supplement on a medicine list, from a photo or from pasted text. */
export async function readMedicineList(input: { image?: string; text?: string }) {
  const prompt = `${input.text ? `Here is a medicine list as text:\n"""${input.text.slice(0, 6000)}"""\n` : 'This is a photo of a medicine list. '}List every medicine or supplement on it. For each give: its name as written (with strength, for example "Vitamin D3 60,000 IU"); the dose to take each time (for example "1 capsule"); the clock times to take it as 24-hour HH:MM. Indian medicine lists write "1-0-1" for morning-afternoon-night: each number above 0 is one time (morning 08:00, afternoon 13:30, night 21:00), so "1-0-1" is two times, 08:00 and 21:00; use a stated clock time when there is one. When to take it relative to food, using one of: ${RX_FOOD.join(', ')}. The number of days to take it, converting weeks to days ("x 8 weeks" is 56) and months to 30 days; null when no duration is written. How often in days: 1 for daily, 7 for once a week, 2 for alternate days. Any other instruction as a short note. Answer in JSON.`
  const out = await ask<{ items: RxItem[] }>(input.image ?? null, prompt, {
    type: 'object', additionalProperties: false, required: ['items'],
    properties: { items: { type: 'array', maxItems: 30, items: {
      type: 'object', additionalProperties: false, required: ['name', 'dose', 'times', 'withFood', 'days', 'everyDays', 'note'],
      properties: {
        name: { type: 'string' }, dose: { type: 'string' },
        times: { type: 'array', maxItems: 4, items: { type: 'string', pattern: '^[0-2][0-9]:[0-5][0-9]$' } },
        withFood: { type: 'string', enum: RX_FOOD }, days: { type: ['integer', 'null'] }, everyDays: { type: 'integer', minimum: 1, maximum: 31 }, note: { type: 'string' },
      },
    } } },
  }, 2500)
  const seen = new Set<string>()
  return out.items.filter(i => i.name.trim() && !seen.has(i.name.toLowerCase()) && seen.add(i.name.toLowerCase()))
}

export type MenuMeal = { slot: 'breakfast' | 'snack1' | 'lunch' | 'snack2' | 'dinner' | 'snack3' | 'snack4' | 'snack5' | 'snack6'; name: string; method?: string; time?: string; items: { name: string; grams: number | null }[] }
export type MenuDay = { day: number; meals: MenuMeal[] }
const SLOT_WORDS = ['breakfast', 'morning snack', 'lunch', 'evening snack', 'dinner'] as const
const SLOT_OF: Record<string, MenuMeal['slot']> = { breakfast: 'breakfast', 'morning snack': 'snack1', lunch: 'lunch', 'evening snack': 'snack2', dinner: 'dinner' }
/** A coach's meal plan, from a photo or pasted text, as numbered days of meals. */
export async function readMealPlan(input: { image?: string; text?: string }) {
  const prompt = `${input.text ? `Here is a diet meal plan as text:\n"""${input.text.slice(0, 8000)}"""\n` : 'This is a photo of a diet meal plan. '}List every day in it in order, numbering the days from 1 (if the plan is by weekday, Monday is 1; if it is one day to repeat, give just day 1). For each day list each meal as one of: ${SLOT_WORDS.join(', ')}. For each meal give a short name for the meal and its foods, each with the amount in grams only when grams or ml are written (null otherwise). A count such as "3 egg whites" or "2 rotis" stays in the food name with grams null. Answer in JSON.`
  const out = await ask<{ days: { day: number; meals: { meal: string; name: string; foods: { food: string; grams: number | null }[] }[] }[] }>(input.image ?? null, prompt, {
    type: 'object', additionalProperties: false, required: ['days'],
    properties: { days: { type: 'array', maxItems: 31, items: {
      type: 'object', additionalProperties: false, required: ['day', 'meals'],
      properties: { day: { type: 'integer', minimum: 1, maximum: 31 }, meals: { type: 'array', maxItems: 6, items: {
        type: 'object', additionalProperties: false, required: ['meal', 'name', 'foods'],
        properties: { meal: { type: 'string', enum: [...SLOT_WORDS] }, name: { type: 'string' }, foods: { type: 'array', maxItems: 10, items: {
          type: 'object', additionalProperties: false, required: ['food', 'grams'],
          properties: { food: { type: 'string' }, grams: { type: ['integer', 'null'] } },
        } } },
      } } },
    } } },
  }, 4000)
  return out.days.map((d): MenuDay => ({ day: d.day, meals: d.meals.map(m => ({ slot: SLOT_OF[m.meal] ?? 'lunch', name: m.name, items: m.foods.map(f => ({ name: f.food, grams: f.grams })) })) }))
}

export type DishRead = { name: string; items: { food: string; amount: number | null; unit: string }[] }
const DISH_UNITS = ['g', 'ml', 'teaspoon', 'tablespoon', 'cup', 'katori', 'piece', 'pinch']
/** A dish said or typed in one go ("I made palak sabzi with 160 g spinach, 90 g onion, 22 ml ghee and half a teaspoon of turmeric"): its name and each ingredient with the amount and unit as said. dish.ts turns units into grams. */
export async function readDish(text: string): Promise<DishRead> {
  const prompt = `Someone describes a dish they cooked, spoken or typed (it may have speech mistakes or corrections):\n"""${text.slice(0, 1500)}"""\nGive the dish name using only words they said (if they gave none, name it after its main ingredient) and every ingredient they named, never adding one they did not say, with the amount as said: a number (0.5 for "half") and a unit from: ${DISH_UNITS.join(', ')}. Use null amount when none was said. Include oil, ghee, salt and spices. Answer in JSON.`
  return ask<DishRead>(null, prompt, {
    type: 'object', additionalProperties: false, required: ['name', 'items'],
    properties: { name: { type: 'string' }, items: { type: 'array', maxItems: 25, items: {
      type: 'object', additionalProperties: false, required: ['food', 'amount', 'unit'],
      properties: { food: { type: 'string' }, amount: { type: ['number', 'null'] }, unit: { type: 'string', enum: DISH_UNITS } },
    } } },
  }, 900)
}
