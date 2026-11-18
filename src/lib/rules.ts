// Whether a food is allowed on a given day, and what the day's targets are.
// One function answers "can I eat this" for every screen, so a warning, a
// suggestion and the label check can never disagree.
//
// Two rule sets:
//  - the owner's (coach: true): the coach's phase order from the 24 Oct call.
//    Food groups come back phase by phase, and a returning food is "new" until
//    he or the coach marks its test passed.
//  - Everyone else: the clean-eating rules from the the coach protocol, plus their
//    own meat setting. Unchanged from before.
import { ruleBreaks } from './core.ts'

export type Level = 'ok' | 'new' | 'ask' | 'notyet' | 'out'
export type Verdict = { level: Level; why: string[]; tests: string[] }

export const PHASE_ORDER = ['CE', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const
export type PhaseId = typeof PHASE_ORDER[number]
const idx = (p: string) => Math.max(0, PHASE_ORDER.indexOf(p as PhaseId))

/** A food family that leaves after clean eating and comes back in a later phase.
 *  `ask` means it comes back only after the coach says so. `key` names the food
 *  for its reintroduction test, so passing "paneer" covers every paneer dish. */
type Group = { name: string; back: PhaseId; ask?: boolean; words: [RegExp, string][] }

/** Word patterns with their test key: the pattern minus its regex marks ("chill?i" is "chilli"). */
const w = (...xs: string[]): [RegExp, string][] =>
  xs.map(x => [new RegExp(`\\b${x}`, 'i'), x.replace(/\(\?<?[!=][^)]*\)|\\b|\?/g, '').trim()])

// The safe-side calls recorded in spec v2, section 2.
export const GROUPS: Group[] = [
  { name: 'Dairy', back: 'V2', words: w('paneer', 'curd', 'raita', 'buttermilk', 'mor kuzhambu', 'buttermilk curry', 'cheese', 'feta', 'yogh?urt', 'kefir') },
  { name: 'Milk', back: 'V2', ask: true, words: w('milk(?! thistle)') },
  { name: 'Eggs', back: 'V1', words: w('egg') },
  { name: 'Nuts and seeds', back: 'V3', words: w('walnut', 'almond', 'pistachio', 'hazelnut', 'nuts?\\b', '(?<!cumin |mustard |fennel |fenugreek |carom |coriander |ajwain |nigella )seeds?\\b', 'makhana', 'flax', 'pumpkin seed', 'sunflower seed', 'sesame seed') },
  { name: 'Chilli', back: 'V4', words: w('chill?i') },
  { name: 'Sweet potato', back: 'V4', words: w('sweet potato') },
  { name: 'Millets', back: 'V4', words: w('millet', 'ragi', 'jowar', 'bajra', 'foxtail', 'bhakri') },
  { name: 'Tomato, brinjal, capsicum and potato', back: 'V4', ask: true, words: w('tomato', 'brinjal', 'vankaya', 'baingan', 'eggplant', 'capsicum', 'bell pepper', '(?<!sweet )potato') },
  { name: 'Rice', back: 'V5', words: w('rice', 'biryani', 'pulao', 'poha', 'appam', 'neer dosa', 'rice dosa', 'idiyappam', 'puttu', 'pongal') },
  { name: 'Quinoa', back: 'V5', words: w('quinoa') },
  { name: 'Oats and sabudana', back: 'V5', words: w('oats', 'sabudana') },
  { name: 'Fruit', back: 'V5', words: w('berry', 'berries', 'apple(?! cider)', 'banana', '(?<!raw )mango', 'orange', 'grapes?', 'papaya', 'pineapple', 'watermelon', 'melon', 'guava', 'pomegranate', 'kiwi', 'fruit') },
  { name: 'Wheat', back: 'V5', ask: true, words: w('wheat', 'atta', 'maida', 'rava', 'sooji', 'chapat?h?i', 'rotis?', 'phulka', 'paratha', 'naan', 'bread', 'pasta') },
  { name: 'Dal and pulses', back: 'V6', words: w('dal', 'daal', 'sambar', 'lentil', 'moong', 'pesarattu', 'moong dosa', 'sundal', '(?<!brussels )sprout', 'chana', 'chickpea', 'rajma', 'kidney bean', 'urad', 'toor', 'masoor', 'idli', 'dosa', 'vada', 'uttapam') },
]

// Always fine for the owner in every phase: the coach's drinks and cooking fats.
const ALWAYS = /\b(whey|protein shake|protein drink|chia|psyllium|isabgol|husk|fibre drink|fiber drink|salt drink|salted lime|lemon water|ghee|butter(?!milk)|coconut oil|sesame oil|mustard oil)\b/i
// The clean-eating rules the phase groups take over from.
const HANDLED = /^(Wheat|Milk|Fruit|Dal|Urad|Egg yolk)/

export type RuleCtx = {
  /** the owner's coach-led phases, or the plain clean-eating rules. */
  coach: boolean
  phase: string
  /** Test keys marked passed ("paneer", "rice"). */
  passed?: Set<string>
  /** The person's own rules from their coach: a word, allowed or not. These win over everything else. */
  own?: { word: string; allow: boolean }[]
}

const RANK: Record<Level, number> = { ok: 0, new: 1, ask: 2, notyet: 3, out: 4 }

/** What the rules say about one food on one day. */
export function verdict(name: string, ctx: RuleCtx): Verdict {
  const v: Verdict = { level: 'ok', why: [], tests: [] }
  const bump = (l: Level, why: string) => { if (RANK[l] > RANK[v.level]) v.level = l; if (!v.why.includes(why)) v.why.push(why) }
  // The person's own coach has the last word.
  const has = (w: string) => new RegExp(`\\b${w.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(name)
  const mine = (ctx.own ?? []).filter(r => r.word.trim() && has(r.word))
  const no = mine.find(r => !r.allow)
  if (no) { bump('out', `Your coach: no ${no.word.trim()}`); return v }
  if (mine.some(r => r.allow)) return v
  const base = ruleBreaks(name)
  if (!ctx.coach || ctx.phase === 'CE') {
    for (const r of base) bump('out', r)
    return v
  }
  // Drop negated phrases ("no dal", "without tomato") the same way ruleBreaks does.
  const n = name.replace(/\b(no|without|minus|zero)\s+[a-z]+(\s+[a-z]+)?/gi, ' ')
  for (const r of base) if (!HANDLED.test(r)) bump('out', r)
  if (/\b(yolk|whole eggs?|omelett?e)\b/i.test(n)) bump('ask', 'Egg yolk: ask the coach')
  if (ALWAYS.test(n) && !GROUPS.some(g => g.words.some(([re]) => re.test(n.replace(ALWAYS, ''))))) return v
  const p = idx(ctx.phase)
  for (const g of GROUPS) {
    const hit = g.words.find(([re]) => re.test(n))
    if (!hit) continue
    // "Chia seeds" and "husk" are the fibre drink, not the nuts-and-seeds family.
    if (g.name === 'Nuts and seeds' && /\b(chia|psyllium)\b/i.test(n) && !/\b(walnut|almond|nuts?|flax|pumpkin|sunflower|sesame seed|makhana)\b/i.test(n)) continue
    if (p < idx(g.back)) { bump('notyet', `${g.name}: back in ${g.back}`); continue }
    if (g.ask) { bump('ask', `${g.name}: ask the coach first`); continue }
    // Eggs were already eaten in clean eating; they only need the coach's word in V1.
    // Boiled egg whites are on the coach's own V1 plan, so only other egg foods need the coach's word.
    if (g.name === 'Eggs') { if (p === idx('V1') && !/\begg whites?\b/i.test(n)) bump('ask', 'Eggs in V1: ask the coach'); continue }
    const key = hit[1].toLowerCase()
    if (ctx.passed?.has(key)) continue
    bump('new', `New in ${g.back}: ${key}. One new food a day`)
    if (!v.tests.includes(key)) v.tests.push(key)
  }
  return v
}

/** Plain words for a level, for the screens. */
export const LEVEL_TEXT: Record<Level, string> = {
  ok: 'Allowed', new: 'New food: counts as today\'s test', ask: 'Ask the coach', notyet: 'Not yet', out: 'Not allowed',
}

// ---- targets ----------------------------------------------------------------------

export type Targets = {
  proteinG: number; vegG: number; carbMeals: number
  /** The coach's floor: a day should not end below this. Never a cap. */
  kcalMin: number | null
  /** the coach's V1 ceiling: a day should not go above this (the card says do not exceed 850). */
  kcalMax: number | null
  /** Whether a daily step goal applies. Activity waits until V4 for the owner. */
  steps: boolean
  /** The fibre drink once and the salt drink twice, as daily ticks. */
  drinks: boolean
}

/** The day's targets for this person and phase. `base` is what their profile
 *  and the phase file already say; the owner's phases replace it from V1. */
export function targetsFor(ctx: { coach: boolean; phase: string; weightKg: number | null; base: { proteinG: number; vegG: number; carbMeals: number; kcal: number | null } }): Targets {
  const { base } = ctx
  if (!ctx.coach) return { proteinG: base.proteinG, vegG: base.vegG, carbMeals: base.carbMeals, kcalMin: base.kcal, kcalMax: null, steps: true, drinks: false }
  const p = idx(ctx.phase)
  if (p === 0) return { proteinG: base.proteinG, vegG: base.vegG, carbMeals: base.carbMeals, kcalMin: null, kcalMax: null, steps: false, drinks: false }
  const proteinG = ctx.weightKg ? Math.round((ctx.weightKg * 0.7) / 5) * 5 : 60
  return { proteinG, vegG: base.vegG, carbMeals: p <= idx('V3') ? 0 : 2, kcalMin: p <= idx('V3') ? null : 850, kcalMax: p === idx('V1') ? 850 : null, steps: p >= idx('V4'), drinks: p <= idx('V3') }
}

/** How the owner's phases read on the Plan tab: the coach's order (24 Oct call). */
export const DOCTOR_PHASES: Record<string, { name: string; brings: string[]; about: string }> = {
  V1: { name: 'Detox', brings: [], about: 'No more than 850 kcal a day and about 0.7 g protein per kg. No carbs from food: protein from whey, and vegetables that are not tomato, brinjal, capsicum or potato. Fibre drink daily, salt drink twice, 3 litres of water. No exercise. Supplements start, one new one a day.' },
  V2: { name: 'Dairy', brings: ['Paneer', 'Curd', 'Buttermilk', 'Eggs'], about: 'Dairy comes back, one food a day. Bloating, burping or 0.5 kg up overnight means that food may not suit you.' },
  V3: { name: 'Nuts and seeds', brings: ['Nuts', 'Seeds'], about: 'Nuts and seeds come back, one a day. Fasting starts here, on a window the coach sets. The next coach call is at the V3 check-in.' },
  V4: { name: 'Chilli, sweet potato and millets', brings: ['Chilli', 'Sweet potato', 'Millets'], about: 'Activity starts. Tomato, brinjal, capsicum and potato only once the coach says so.' },
  V5: { name: 'Rice and fruit', brings: ['Rice', 'Quinoa', 'Fruit', 'Oats'], about: 'Rice, quinoa and fruit come back. Wheat only once the coach says so.' },
  V6: { name: 'Dal and pulses', brings: ['Dal', 'Pulses', 'Sprouts'], about: 'Dals and pulses come back, one a day.' },
}
