// What is inside a medicine, in plain words. The brand list (src/data/india-drugs.db)
// gives each brand's ingredients as text like "Vitamin D3 (1000IU) + Calcium (500mg)".
// This file splits that text and explains each ingredient. No dosing advice here:
// the dose is always the coach's and the strip's.

export type Ingredient = { name: string; strength?: string }

/** "Vitamin C  (500mg) +  Zinc (10mg)" -> two ingredients. */
export function splitContains(text: string | null | undefined): Ingredient[] {
  if (!text) return []
  return text.split(/\s\+\s|\s*\+\s*(?=[A-Za-z])/).map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(.*?)\s*\(([^()]*\d[^()]*|NA)\)\s*$/)
    if (!m) return { name: s }
    return m[2] === 'NA' ? { name: m[1].trim() } : { name: m[1].trim(), strength: m[2].replace(/\s+/g, ' ').trim() }
  })
}

/** Joins ingredients back into the same text form. */
export const joinContains = (list: Ingredient[]) =>
  list.map(i => i.strength ? `${i.name} (${i.strength})` : i.name).join(' + ')

/** What a photo of a strip gave back, in the brand list's form: "Coenzyme Q10 USP"
 *  and "300 mg" become "Coenzyme Q10 (300mg)", "2,000 IU" becomes "2000IU" so
 *  doses add up, and excipients are dropped. */
export function fromStrip(items: { name: string; amount: string }[]) {
  return joinContains(items
    .map(i => ({ name: i.name.replace(/\s+/g, ' ').replace(/\s+(IP|BP|USP|Ph\.? ?Eur)\.?$/i, '').trim(), amount: i.amount.trim() }))
    .filter(i => i.name && !/excipient|q\.?s\.?$|colou?r|flavou?r|capsule shell/i.test(i.name) && !/^q\.?s\.?$/i.test(i.amount))
    .map(i => {
      const unit = i.amount.match(/^([\d.,]+)\s*(mg|mcg|µg|g|iu)$/i)
      const strength = unit ? `${unit[1].replace(/,/g, '')}${unit[2].replace('µg', 'mcg')}` : i.amount.replace(/\s+/g, ' ')
      return strength ? { name: i.name, strength } : { name: i.name }
    }))
}

// Other spellings of one ingredient, all mapped to the key used in NOTES.
const ALIAS: Record<string, string> = {
  'cholecalciferol': 'vitamin d3', 'vitamin d': 'vitamin d3', 'vit d3': 'vitamin d3', 'cyanocobalamin': 'methylcobalamin', 'vitamin b12': 'methylcobalamin', 'mecobalamin': 'methylcobalamin', 'vitamin b6 (pyridoxine)': 'vitamin b6', 'pyridoxine': 'vitamin b6', 'pyridoxal-5-phosphate': 'vitamin b6', 'thiamine(vitamin b1)': 'vitamin b1', 'thiamine': 'vitamin b1', 'vitamin b1 (thiamine)': 'vitamin b1', 'ascorbic acid': 'vitamin c', 'vitamin c (ascorbic acid)': 'vitamin c', 'docosahexanoic acid(dha)': 'omega-3', 'docosahexaenoic acid': 'omega-3', 'dha': 'omega-3', 'eicosapentaenoic acid': 'omega-3', 'epa': 'omega-3', 'fish oil': 'omega-3', 'omega 3 fatty acids': 'omega-3', 'ferrous ascorbate': 'iron', 'elemental iron': 'iron', 'ferrous fumarate': 'iron', 'ferrous sulphate': 'iron', 'ferrous bisglycinate': 'iron', 'carbonyl iron': 'iron', 'iron sucrose': 'iron', 'calcium carbonate': 'calcium', 'calcium citrate': 'calcium', 'calcium citrate malate': 'calcium', 'magnesium citrate': 'magnesium', 'magnesium oxide': 'magnesium', 'magnesium glycinate': 'magnesium', 'magnesium bisglycinate': 'magnesium', 'nicotinamide': 'niacinamide', 'niacin': 'niacinamide', 'vitamin b3': 'niacinamide', 'riboflavin': 'vitamin b2', 'vitamin b2 (riboflavin)': 'vitamin b2'
}

// One or two plain sentences: what it is and what it is usually given for.
const NOTES: Record<string, string> = {
  'vitamin d3': 'Vitamin D. Helps the body take in calcium for bones and supports muscles and immunity. Most Indians are low in it. Weekly 60,000 IU sachets or capsules are common.',
  'methylcobalamin': 'Vitamin B12. Needed for nerves and for making red blood cells. Vegetarians are often low in it because it comes mostly from animal foods.',
  'vitamin b6': 'Vitamin B6. Helps the body use protein and make brain chemicals; supports nerves.',
  'vitamin b1': 'Vitamin B1 (thiamine). Helps turn food into energy; supports nerves.',
  'vitamin b2': 'Vitamin B2 (riboflavin). Helps turn food into energy. Can turn urine bright yellow, which is harmless.',
  'niacinamide': 'Vitamin B3. Helps turn food into energy; used on skin too.',
  'biotin': 'Vitamin B7. Used by the body for hair, skin and nails and to turn food into energy.',
  'vitamin c': 'Vitamin C. An antioxidant that supports immunity and skin, and helps the body absorb iron.',
  'iron': 'Iron. Needed to make haemoglobin, which carries oxygen in the blood. Given for anaemia. Can cause dark stools and constipation.',
  'calcium': 'Calcium. The main mineral in bones and teeth. Best taken apart from iron tablets, since they block each other.',
  'magnesium': 'Magnesium. A mineral for muscles, nerves, sleep and bowel movement. Some forms work as a mild laxative.',
  'omega-3': 'Omega-3 fats (DHA and EPA), usually from fish or algae oil. Support the heart, brain and triglyceride levels.',
  'psyllium': 'Isabgol husk. Soluble fibre that softens stool and eases constipation. Take with plenty of water.',
}

/** The key an ingredient name is filed under. */
export function ingredientKey(name: string) {
  const k = name.toLowerCase().replace(/\s+/g, ' ').replace(/\s*\(\s*/g, ' (').trim()
  if (NOTES[k]) return k
  if (ALIAS[k]) return ALIAS[k]
  const bare = k.replace(/\s*\(.*\)\s*$/, '').trim()
  return NOTES[bare] ? bare : ALIAS[bare] ?? bare
}

/** A plain-words note for one ingredient, or null when there is none yet. */
export const noteFor = (name: string) => NOTES[ingredientKey(name)] ?? null

/** Ingredients that appear more than once across these medicines, with the
 *  daily total when every strength is in the same unit. Catches two tablets
 *  that both carry the same ingredient. */
export function overlaps(meds: { name: string; contains?: string | null; perDay: number }[]) {
  const by = new Map<string, { label: string; names: string[]; amount: number | null; unit: string | null }>()
  for (const m of meds) for (const i of splitContains(m.contains)) {
    const k = ingredientKey(i.name)
    const s = i.strength?.match(/^([\d.]+)\s*(mg|mcg|g|iu)$/i)
    const e = by.get(k) ?? { label: i.name, names: [], amount: 0, unit: s ? s[2].toLowerCase() : null }
    e.names.push(m.name)
    if (s && e.amount != null && e.unit === s[2].toLowerCase()) e.amount += Number(s[1]) * m.perDay
    else e.amount = null
    by.set(k, e)
  }
  return [...by].filter(([, e]) => e.names.length > 1).map(([key, e]) => ({ key, label: e.label, names: e.names, perDay: e.amount != null && e.unit ? `${+e.amount.toFixed(2)} ${e.unit}` : null }))
}
