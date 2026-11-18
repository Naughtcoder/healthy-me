// The behavioural components of the meal screen and the parts of Today that
// share them (spec: drafts/at-health-meal-entry-bc-spec-2026-10-26.md). Each
// function takes the causes and returns the one variant to draw. Screens only
// draw what these return, so the rules live here and the tests check them.
import { clock, isExtra, SLOT_NAME, type Slot } from './core.ts'
import { lookup } from './foods.ts'
import { countedAs } from './servings.ts'
import { dayTotals, nutrition, type Meal, type MealItem } from './meals.ts'
import type { Verdict } from './rules.ts'

// ---- Amount Entry BC ---------------------------------------------------------------------

export type AmountMode =
  | { mode: 'grams'; value: number | null }
  | { mode: 'count'; n: number; one: string; many: string; each: number }
  | { mode: 'ml'; value: number | null }

const DRINK = /\b(tea|coffee|buttermilk|lassi|juice|water|drink|milk(?! thistle)|chaas)\b/i
const POWDER = /\b(whey|protein powder|scoop)\b/i
export const isDrink = (name: string) => DRINK.test(name) && !POWDER.test(name)

/** Count for rotis and eggs, ml for drinks, grams for the rest. */
export function amountMode(it: Pick<MealItem, 'name' | 'grams' | 'ml'>): AmountMode {
  const c = countedAs(it.name)
  if (c) return { mode: 'count', n: it.grams ? Math.max(0, Math.round(it.grams / c.each)) : 0, one: c.one, many: c.many, each: c.each }
  if (isDrink(it.name)) return { mode: 'ml', value: it.ml ?? it.grams ?? null }
  return { mode: 'grams', value: it.grams ?? null }
}
/** True when the amount still needs filling in. */
export const amountEmpty = (it: Pick<MealItem, 'name' | 'grams' | 'ml'>) => {
  const a = amountMode(it)
  return a.mode === 'count' ? a.n === 0 : a.value == null
}
/** The choices the picker offers, as [label, amount]. */
export const PICKS: Record<'grams' | 'ml', [string, number][]> = {
  grams: [['1 katori', 150], ['1 cup', 200], ['1 bowl', 250], ['1 tbsp', 15]],
  ml: [['1 glass', 250], ['1 cup', 200]],
}
/** The amount written out: "2 rotis", "150 g", "250 ml", or "add amount". */
export function amountText(it: Pick<MealItem, 'name' | 'grams' | 'ml'>) {
  const a = amountMode(it)
  if (a.mode === 'count') return a.n ? `${a.n} ${a.n === 1 ? a.one : a.many}` : 'add amount'
  return a.value == null ? 'add amount' : `${a.value} ${a.mode === 'ml' ? 'ml' : 'g'}`
}

// ---- Source Note BC ------------------------------------------------------------------------

/** Where an item's numbers come from, or null for your own list. */
export function sourceNote(it: Pick<MealItem, 'name' | 'source'>): string | null {
  const src = it.source ?? (() => { const f = lookup(it.name); return f ? (f.guessed ? 'guess' : f.source ?? 'list') : 'none' })()
  if (src === 'list' || src === 'moved') return null
  if (src.startsWith('usda')) return 'USDA'
  if (src === 'cofid') return 'UK table'
  if (src === 'off' || src === 'label') return 'From the packet'
  if (src === 'you') return 'Your numbers'
  if (src === 'guess') return 'A guess from the name'
  return 'Not counted: not in any list'
}

// ---- Rule Badge BC ---------------------------------------------------------------------------

export type Badge = { text: string; tone: 'grey' | 'amber'; why: string }
/** Nothing when allowed; otherwise a short badge, grey for a new food, amber for the rest. Never red. */
export function ruleBadge(v: Verdict): Badge | null {
  const why = v.why.join('. ')
  switch (v.level) {
    case 'ok': return null
    case 'new': return { text: 'New: today\'s test food', tone: 'grey', why }
    case 'ask': return { text: 'Ask the coach', tone: 'amber', why }
    case 'notyet': {
      const back = v.why.map(w => /back in (V\d)/.exec(w)?.[1]).find(Boolean)
      return { text: back ? `Not yet: back in ${back}` : 'Not yet', tone: 'amber', why }
    }
    case 'out': return { text: `Not allowed${v.why[0] ? `: ${v.why[0].split(' (')[0].toLowerCase()}` : ''}`, tone: 'amber', why }
  }
}

// ---- Header BC -------------------------------------------------------------------------------

export function headerText(slot: Slot, dayLabel: string, state: Meal['state'], eatenAt: string | null) {
  const base = `${SLOT_NAME[slot]} · ${dayLabel}`
  if (state === 'eaten') return eatenAt ? `${base} · eaten ${clock(eatenAt)}` : `${base} · eaten`
  if (state === 'skipped') return `${base} · skipped`
  return base
}

// ---- Totals Bar BC ---------------------------------------------------------------------------

export type TotalsBar = { line: string; day: string; warn: string[] }
/** This meal's numbers, then the day with everything eaten and planned. */
export function totalsBar(items: MealItem[], dayP: number, targetP: number, dayKcal: number, kcalMin: number | null, warn: string[], kcalMax: number | null = null): TotalsBar {
  const day = `day ${dayP} of ${targetP} g${kcalMax ? ` · ${dayKcal} of ${kcalMax} kcal max` : kcalMin ? ` · ${dayKcal} of at least ${kcalMin} kcal` : ''}`
  if (!items.length) return { line: 'No food yet', day, warn }
  let p = 0, kcal = 0, missing = 0
  for (const i of items) {
    const n = nutrition(i.name, i.grams, i.ml)
    if (!n) { missing++; continue }
    p += n.p; kcal += n.kcal
  }
  p = Math.round(p); kcal = Math.round(kcal)
  const line = missing
    ? `At least ${p} g protein · ${missing} amount${missing === 1 ? '' : 's'} missing`
    : `${p} g protein · ${kcal} kcal`
  return { line, day, warn }
}

// ---- Action BC -------------------------------------------------------------------------------

export type Actions = { primary: ('save-plan' | 'eaten' | 'save')[]; link: 'skip' | 'unskip' | 'back-to-planned' }
/** The buttons at the bottom. Past days offer Eaten only. */
export function actions(state: Meal['state'], when: 'past' | 'today' | 'future'): Actions {
  if (state === 'eaten') return { primary: ['save'], link: 'back-to-planned' }
  if (state === 'skipped') return { primary: when === 'past' ? ['eaten'] : ['save-plan', 'eaten'], link: 'unskip' }
  return { primary: when === 'past' ? ['eaten'] : ['save-plan', 'eaten'], link: 'skip' }
}
/** The time picker shows before the first save too, so "Eaten" can take a time.
 *  A planned main meal on a later day has no time of its own, so it shows none there. */
export const showsTime = (state: Meal['state'], when: 'past' | 'today' | 'future', extra: boolean) =>
  extra || state !== 'planned' || when !== 'future'

import { roleOf, type Role } from './choices.ts'
const ROLE_NAME: Record<Role, string> = { fat: 'Healthy fat', protein: 'Protein meal', dish: 'Vegetable meal', combo: 'Protein and vegetables', fibre: 'Fibre drink' }

// ---- Meal Row BC (Today) -----------------------------------------------------------------------

export type MealRowView =
  | { kind: 'link'; text: string }
  | { kind: 'row'; label: string; title: string; titleTone: 'muted' | 'planned' | 'full'; detail: string | null; tick: 'open' | 'done' | 'skipped' | null }

/** One meal on the Today list. Flags come from Rule Badge, so both screens agree. */
export function mealRow(slot: Slot, meal: Meal | undefined, plannedAt?: string): MealRowView {
  const isMain = slot === 'breakfast' || slot === 'lunch' || slot === 'dinner'
  if (!meal) return isMain
    ? { kind: 'row', label: SLOT_NAME[slot], title: `Plan ${SLOT_NAME[slot].toLowerCase()}`, titleTone: 'muted', detail: null, tick: null }
    : { kind: 'link', text: `+ ${SLOT_NAME[slot]}` }
  const name = meal.name.replace(/\s*\([\d.]+ serving\)\s*/g, '').trim() || meal.items.map(i => i.name).join(', ')
  // An added snack shows its own time even while planned, since no slot says when it is.
  const when = meal.state === 'eaten' ? meal.eatenAt : meal.time || plannedAt || null
  // V1 names a meal by what it is, since 'Evening snack' and 'Dinner' say nothing about the coach's 2 PM protein or 4 PM vegetables.
  const role = roleOf(meal)
  const name0 = role && (role !== 'dish' || !['breakfast', 'lunch', 'snack1'].includes(slot)) ? ROLE_NAME[role] : SLOT_NAME[slot]
  const label = `${name0}${when ? ` · ${clock(when)}` : ''}${meal.cook ? '' : ' · not cooked at home'}`
  if (meal.state === 'skipped') return { kind: 'row', label, title: 'Skipped', titleTone: 'muted', detail: null, tick: 'skipped' }
  const hasSomething = !!name
  if (meal.state === 'eaten') {
    const t = dayTotals([meal])
    const detail = !meal.items.length ? 'Amounts not filled in yet'
      : t.unknown ? `At least ${t.p} g protein, amounts missing` : `${t.p} g protein, ${t.kcal} kcal`
    return { kind: 'row', label, title: name || 'Eaten', titleTone: 'full', detail, tick: 'done' }
  }
  const allEmpty = meal.items.length > 0 && meal.items.every(amountEmpty)
  const planned = dayTotals([{ ...meal, state: 'planned' }]).plannedP
  const detail = !meal.items.length ? null : allEmpty ? 'Amounts not filled in yet' : planned ? `About ${planned} g protein planned` : null
  return { kind: 'row', label, title: name || `Plan ${SLOT_NAME[slot].toLowerCase()}`, titleTone: hasSomething ? 'planned' : 'muted', detail, tick: hasSomething ? 'open' : null }
}

// ---- Weight Card BC (Today) --------------------------------------------------------------------

export type WeightView =
  | { kind: 'field'; hint: string; editing: boolean; value: string }
  | { kind: 'value'; kg: string; from: 'typed' | 'scale'; change: string | null }

export function weightCard(w: { kg: number; source: string } | null, yesterday: { kg: number } | null, editing: boolean): WeightView {
  if (!w || editing) return { kind: 'field', hint: (yesterday?.kg ?? w?.kg ?? 86).toFixed(1), editing: !!w && editing, value: w && editing ? w.kg.toFixed(1) : '' }
  const d = yesterday ? w.kg - yesterday.kg : null
  return { kind: 'value', kg: `${w.kg.toFixed(1)} kg`, from: w.source === 'health' ? 'scale' : 'typed',
    change: d == null ? null : `${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(1)} since yesterday` }
}

// ---- Name BC -----------------------------------------------------------------------------------

/** The name to show in the field: empty when the saved name is just the foods
 *  joined up, so the field's hint follows the foods as they change. A name you
 *  typed yourself is kept. */
export const nameField = (m: Pick<Meal, 'name' | 'items'>) =>
  m.name && m.name !== m.items.map(i => i.name).join(', ') ? m.name : ''
