// Everything lives on the phone in one SQLite file. No server, no account.
// Screens read through useDb(), which re-renders them after any write.
import * as SQLite from 'expo-sqlite'
import { useSyncExternalStore } from 'react'
import planJson from '@plan/sample-plan.json'
import phasesJson from '@plan/phases.json'
import worldJson from '../data/world-foods.json'
import recipesJson from '../data/sample-recipes.json'
import mineJson from '../data/own-recipes.json'
import { setDishes, type Dish } from './recipes'
import { setMine, setShakes, setDrinks } from './slots'
import { addExtraFoods, setWorldFoods, type Food } from './foods'
import { RENAMED } from './names.ts'
import { addDays, eventsFor, medForDay, medOn, meatFor, pauseClash, pausedOn, planForProfile, programmeDay, setMeat, shiftAfterPause, type Pause, type Med, type Override, type Overrides, type Plan, type PlanItem, type Profile, type Slot } from './core'
import { moveOldLog, OLD_SKIPPED, plannedFor, snapshot, unsnapshot, type Meal, type MealState, type OldRow } from './meals'
import { DOCTOR_PHASES, targetsFor, verdict, type RuleCtx, type Targets } from './rules'

const basePlan = planJson as unknown as Plan
/** The plan as this person sees it. Reshaped in place when their profile is
 *  saved, so every screen reading it picks up the change. */
export const plan: Plan = { ...basePlan }

setWorldFoods((worldJson as { rows: unknown[][] }).rows)
setDishes((recipesJson as { recipes: Dish[] }).recipes)
setShakes((recipesJson as { shakes: Dish[] }).shakes)
setDrinks((recipesJson as { drinks: Dish[] }).drinks)
setMine((mineJson as { recipes: any[] }).recipes)
const db = SQLite.openDatabaseSync('diet.db')

db.execSync(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS food_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL, slot TEXT NOT NULL, name TEXT NOT NULL,
  grams REAL, ml REAL, eaten_at TEXT NOT NULL, planned INTEGER NOT NULL DEFAULT 1,
  created TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS food_log_day ON food_log(day);
CREATE TABLE IF NOT EXISTS weight (day TEXT PRIMARY KEY, kg REAL NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS water (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, ml INTEGER NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS measure (day TEXT PRIMARY KEY, chest REAL, waist REAL, hip REAL);
CREATE TABLE IF NOT EXISTS meds (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, dose TEXT NOT NULL, times TEXT NOT NULL,
  with_food TEXT, start TEXT NOT NULL, end TEXT, note TEXT, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS dose_log (
  day TEXT NOT NULL, med_id TEXT NOT NULL, time TEXT NOT NULL, status TEXT NOT NULL, at TEXT NOT NULL,
  PRIMARY KEY (day, med_id, time)
);
CREATE TABLE IF NOT EXISTS done (day TEXT NOT NULL, key TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (day, key));
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS overrides (day TEXT NOT NULL, slot TEXT NOT NULL, mode TEXT NOT NULL, src TEXT, PRIMARY KEY (day, slot));
`)

// Added after the first build: a plain-words note on what each medicine is.
if (!db.getAllSync<{ name: string }>(`PRAGMA table_info(meds)`).some(c => c.name === 'about'))
  db.execSync(`ALTER TABLE meds ADD COLUMN about TEXT`)
// Added with medicine lists (24 Oct): every N days, for weekly doses.
if (!db.getAllSync<{ name: string }>(`PRAGMA table_info(meds)`).some(c => c.name === 'every'))
  db.execSync(`ALTER TABLE meds ADD COLUMN every INTEGER`)
// Added with the brand list (28 Oct): what is in it, as "Coenzyme Q10 (100mg) + ...".
if (!db.getAllSync<{ name: string }>(`PRAGMA table_info(meds)`).some(c => c.name === 'contains'))
  db.execSync(`ALTER TABLE meds ADD COLUMN contains TEXT`)

// ---- who this phone belongs to ---------------------------------------------------
const rawMeta = (k: string) => db.getFirstSync<{ v: string }>(`SELECT v FROM meta WHERE k = ?`, [k])?.v ?? null
export const profile = (): Profile | null => { const v = rawMeta('profile'); return v ? JSON.parse(v) : null }
function applyProfile(p: Profile | null) {
  if (!p) return
  Object.assign(plan, planForProfile(basePlan, p))
  if (p.owner) plan.targets = { ...basePlan.targets!, proteinG: p.proteinG || basePlan.targets?.proteinG || 60 }
  setMeat(meatFor(p))
}
applyProfile(profile())
export const isOwner = () => false


db.runSync(`DELETE FROM meds WHERE id = 'whey' OR lower(name) LIKE '%whey%'`)   // every start, so it cannot come back

export const getMeta = (k: string) => db.getFirstSync<{ v: string }>(`SELECT v FROM meta WHERE k = ?`, [k])?.v ?? null
export const setMeta = (k: string, v: string) => db.runSync(`INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, [k, v])

// ---- change notification --------------------------------------------------

let version = 0
const listeners = new Set<() => void>()
const changed = () => { version++; listeners.forEach(l => l()) }
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l) }
/** Re-renders the caller after any write, and returns the change counter. */
export const useDb = () => useSyncExternalStore(subscribe, () => version)
/** Called after any write, for things outside React (the alarms). */
export const onChange = (l: () => void) => subscribe(l)

const nowHm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

// ---- food -------------------------------------------------------------------

/** The one row a meal gets when it was skipped on purpose. */
export const SKIPPED = 'Skipped'

export type FoodRow = { id: number; day: string; slot: Slot; name: string; grams: number | null; ml: number | null; eaten_at: string; planned: number }
export const foodFor = (day: string) =>
  db.getAllSync<FoodRow>(`SELECT * FROM food_log WHERE day = ? ORDER BY eaten_at, id`, [day])

/** Replaces what is logged for one meal with this list. */
export function saveMeal(day: string, slot: Slot, eatenAt: string, rows: { name: string; grams?: number | null; ml?: number | null; planned: boolean }[]) {
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM food_log WHERE day = ? AND slot = ?`, [day, slot])
    for (const r of rows)
      db.runSync(`INSERT INTO food_log (day, slot, name, grams, ml, eaten_at, planned) VALUES (?,?,?,?,?,?,?)`,
        [day, slot, r.name, r.grams ?? null, r.ml ?? null, eatenAt, r.planned ? 1 : 0])
  })
  changed()
}
/** "Ate as planned" from an alarm: the planned items at the planned time.
 *  A snack logs its first option. Does nothing if the meal is already logged. */
export function logPlanned(day: string, slot: Slot) {
  if (db.getFirstSync(`SELECT 1 FROM food_log WHERE day = ? AND slot = ?`, [day, slot])) return
  const e = eventsFor(plan, [], day, overrides()).find(x => x.slot === slot)
  if (!e?.items?.length) return
  const items = slot.startsWith('snack') ? e.items.slice(0, 1) : e.items
  saveMeal(day, slot, e.time, items.map(i => ({ name: i.name, grams: i.grams ?? null, ml: i.ml ?? null, planned: true })))
}
export function clearMeal(day: string, slot: Slot) {
  db.runSync(`DELETE FROM food_log WHERE day = ? AND slot = ?`, [day, slot]); changed()
}

// ---- weight, water, measurements -------------------------------------------

// Set by health.ts so a weight or water typed here also lands in Apple Health.
let afterWater: ((ml: number) => void) | undefined, afterWeight: ((kg: number) => void) | undefined
export function onHealthWrites(w: (ml: number) => void, k: (kg: number) => void) { afterWater = w; afterWeight = k }

// Where a weight came from: typed in the app ('you') or read from Apple Health ('health').
if (!db.getAllSync<{ name: string }>(`PRAGMA table_info(weight)`).some(c => c.name === 'source'))
  db.execSync(`ALTER TABLE weight ADD COLUMN source TEXT NOT NULL DEFAULT 'you'`)
export type WeightRow = { day: string; kg: number; at: string; source: string }
export const weights = () => db.getAllSync<WeightRow>(`SELECT * FROM weight ORDER BY day`)
export const weightOn = (day: string) => db.getFirstSync<WeightRow>(`SELECT * FROM weight WHERE day = ?`, [day])
/** Saves a day's weight. One typed here also goes to Apple Health; one read
 *  from Apple Health keeps its own time and is not written back. */
export function setWeight(day: string, kg: number, fromHealth = false, at?: string) {
  db.runSync(`INSERT INTO weight (day, kg, at, source) VALUES (?,?,?,?) ON CONFLICT(day) DO UPDATE SET kg = excluded.kg, at = excluded.at, source = excluded.source`,
    [day, kg, at ?? nowHm(), fromHealth ? 'health' : 'you']); changed()
  if (!fromHealth) afterWeight?.(kg)
}
export const weightsSince = (day: string) => Object.fromEntries(db.getAllSync<WeightRow>(`SELECT * FROM weight WHERE day >= ?`, [day]).map(r => [r.day, r]))

export const waterOn = (day: string) =>
  db.getFirstSync<{ ml: number }>(`SELECT COALESCE(SUM(ml), 0) AS ml FROM water WHERE day = ?`, [day])?.ml ?? 0
export function addWater(day: string, ml: number) {
  db.runSync(`INSERT INTO water (day, ml, at) VALUES (?,?,?)`, [day, ml, nowHm()]); changed()
  afterWater?.(ml)
}
/** Takes back one specific top-up: the latest entry of exactly that amount. */
export function removeWater(day: string, ml: number) {
  db.runSync(`DELETE FROM water WHERE id = (SELECT MAX(id) FROM water WHERE day = ? AND ml = ?)`, [day, ml]); changed()
}
export function undoWater(day: string) {
  db.runSync(`DELETE FROM water WHERE id = (SELECT MAX(id) FROM water WHERE day = ?)`, [day]); changed()
}

export type MeasureRow = { day: string; chest: number | null; waist: number | null; hip: number | null }
export const measures = () => db.getAllSync<MeasureRow>(`SELECT * FROM measure ORDER BY day`)
export function setMeasure(day: string, m: Omit<MeasureRow, 'day'>) {
  db.runSync(`INSERT INTO measure (day, chest, waist, hip) VALUES (?,?,?,?) ON CONFLICT(day) DO UPDATE SET chest = excluded.chest, waist = excluded.waist, hip = excluded.hip`,
    [day, m.chest, m.waist, m.hip]); changed()
}

// ---- meds -------------------------------------------------------------------

type MedRow = { id: string; name: string; dose: string; times: string; with_food: string | null; start: string; end: string | null; note: string | null; about: string | null; active: number; every: number | null; contains: string | null }
const toMed = (r: MedRow): Med => ({ id: r.id, name: r.name, dose: r.dose, times: JSON.parse(r.times), withFood: r.with_food ?? undefined,
  start: r.start, end: r.end, note: r.note ?? undefined, about: r.about ?? undefined, active: !!r.active, every: r.every ?? undefined, contains: r.contains ?? undefined })
/** Whey is a meal, never a pill: it is dropped from every medicine list however it got into the table. */
const isWhey = (m: { id: string; name: string }) => m.id === 'whey' || /\bwhey\b/i.test(m.name)
export const meds = () => db.getAllSync<MedRow>(`SELECT * FROM meds ORDER BY active DESC, name`).map(toMed).filter(m => !isWhey(m))
export const med = (id: string) => { const r = db.getFirstSync<MedRow>(`SELECT * FROM meds WHERE id = ?`, [id]); return r ? toMed(r) : null }
export function saveMed(m: Med) {
  db.runSync(`INSERT INTO meds (id, name, dose, times, with_food, start, end, note, about, active, every, contains) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, dose = excluded.dose, times = excluded.times, with_food = excluded.with_food,
    start = excluded.start, end = excluded.end, note = excluded.note, about = excluded.about, active = excluded.active, every = excluded.every, contains = excluded.contains`,
    [m.id, m.name, m.dose, JSON.stringify([...m.times].sort()), m.withFood ?? null, m.start, m.end ?? null, m.note ?? null, m.about ?? null, m.active ? 1 : 0, m.every ?? null, m.contains ?? null])
  changed()
}
export function deleteMed(id: string) { db.runSync(`DELETE FROM meds WHERE id = ?`, [id]); changed() }

export type DoseStatus = 'taken' | 'skipped'
export type DoseRow = { day: string; med_id: string; time: string; status: DoseStatus; at: string }
export const dosesOn = (day: string) => db.getAllSync<DoseRow>(`SELECT * FROM dose_log WHERE day = ?`, [day])
export function setDose(day: string, medId: string, time: string, status: DoseStatus | null) {
  if (status === null) db.runSync(`DELETE FROM dose_log WHERE day = ? AND med_id = ? AND time = ?`, [day, medId, time])
  else db.runSync(`INSERT INTO dose_log (day, med_id, time, status, at) VALUES (?,?,?,?,?) ON CONFLICT(day, med_id, time) DO UPDATE SET status = excluded.status, at = excluded.at`,
    [day, medId, time, status, nowHm()])
  changed()
}

// ---- routine check-offs -------------------------------------------------------

export const doneOn = (day: string) => new Set(db.getAllSync<{ key: string }>(`SELECT key FROM done WHERE day = ?`, [day]).map(r => r.key))
export function setDone(day: string, key: string, on: boolean) {
  if (on) db.runSync(`INSERT OR IGNORE INTO done (day, key, at) VALUES (?,?,?)`, [day, key, nowHm()])
  else db.runSync(`DELETE FROM done WHERE day = ? AND key = ?`, [day, key])
  changed()
}

// ---- totals for Progress -------------------------------------------------------

export const loggedSlots = (day: string) =>
  new Set(db.getAllSync<{ slot: Slot }>(`SELECT DISTINCT slot FROM food_log WHERE day = ?`, [day]).map(r => r.slot))

// ---- meals changed ahead of time ------------------------------------------------

/** All overrides, as the core rules expect them. Small table: read it whole. */
export function overrides(): Overrides {
  const out: Overrides = {}
  // A built meal keeps its foods and grams as JSON in `src`.
  for (const r of db.getAllSync<{ day: string; slot: string; mode: Override['mode']; src: string | null }>(`SELECT * FROM overrides`))
    out[`${r.day}|${r.slot}`] = r.mode === 'custom' ? { mode: 'custom', items: JSON.parse(r.src ?? '[]') } : { mode: r.mode, from: r.src ?? undefined }
  return out
}
export function setOverride(day: string, slot: Slot, o: Override | null) {
  if (!o) db.runSync(`DELETE FROM overrides WHERE day = ? AND slot = ?`, [day, slot])
  else db.runSync(`INSERT INTO overrides (day, slot, mode, src) VALUES (?,?,?,?) ON CONFLICT(day, slot) DO UPDATE SET mode = excluded.mode, src = excluded.src`,
    [day, slot, o.mode, o.mode === 'custom' ? JSON.stringify(o.items ?? []) : o.from ?? null])
  changed()
}

// ---- added in build 5 ---------------------------------------------------------------

db.execSync(`
CREATE TABLE IF NOT EXISTS checkin (day TEXT PRIMARY KEY, energy INTEGER, bloating INTEGER, sleep INTEGER, cravings INTEGER, mood INTEGER, note TEXT, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, answer TEXT, created TEXT NOT NULL, answered TEXT);
CREATE TABLE IF NOT EXISTS shop_have (k TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS cravings (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, kind TEXT NOT NULL, passed INTEGER);
`)


export type Checkin = { day: string; energy: number | null; bloating: number | null; sleep: number | null; cravings: number | null; mood: number | null; note: string | null }
export const CHECK_KEYS = ['energy', 'bloating', 'sleep', 'cravings', 'mood'] as const
export type CheckKey = typeof CHECK_KEYS[number]
export const checkinOn = (day: string) => db.getFirstSync<Checkin>(`SELECT * FROM checkin WHERE day = ?`, [day])
export const checkins = () => db.getAllSync<Checkin>(`SELECT * FROM checkin ORDER BY day`)
export function setCheck(day: string, key: CheckKey | 'note', v: number | string | null) {
  db.runSync(`INSERT INTO checkin (day, at) VALUES (?, datetime('now')) ON CONFLICT(day) DO NOTHING`, [day])
  db.runSync(`UPDATE checkin SET ${key} = ?, at = datetime('now') WHERE day = ?`, [v, day])
  changed()
}

export type Question = { id: number; text: string; answer: string | null; created: string; answered: string | null }
export const questions = () => db.getAllSync<Question>(`SELECT * FROM questions ORDER BY answered IS NOT NULL, id`)
export function addQuestion(text: string) { db.runSync(`INSERT INTO questions (text, created) VALUES (?, datetime('now'))`, [text]); changed() }
export function answerQuestion(id: number, answer: string | null) {
  db.runSync(`UPDATE questions SET answer = ?, answered = CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END WHERE id = ?`, [answer, answer, id]); changed()
}
export function deleteQuestion(id: number) { db.runSync(`DELETE FROM questions WHERE id = ?`, [id]); changed() }

export const haveSet = (from: string) => new Set(db.getAllSync<{ k: string }>(`SELECT k FROM shop_have WHERE k LIKE ?`, [`${from}|%`]).map(r => r.k.slice(from.length + 1)))
export function setHave(from: string, name: string, on: boolean) {
  if (on) db.runSync(`INSERT OR IGNORE INTO shop_have (k) VALUES (?)`, [`${from}|${name}`])
  else db.runSync(`DELETE FROM shop_have WHERE k = ?`, [`${from}|${name}`])
  changed()
}

export type Craving = { id: number; at: string; kind: 'food' | 'smoke'; passed: number | null }
export function logCraving(kind: Craving['kind'], passed: boolean) {
  db.runSync(`INSERT INTO cravings (at, kind, passed) VALUES (datetime('now', 'localtime'), ?, ?)`, [kind, passed ? 1 : 0]); changed()
}
export const cravingsBetween = (from: string, to: string) =>
  db.getAllSync<Craving>(`SELECT * FROM cravings WHERE substr(at, 1, 10) BETWEEN ? AND ?`, [from, to])

// ---- phases -----------------------------------------------------------------------

export type Phase = { id: string; name: string; days: number | null; kcal: number | null; carbMeals: number; brings: string[]; about: string }
export const PHASES = (phasesJson as { phases: Phase[] }).phases
/** When each phase started. Clean eating starts with the plan; the rest are set on the phone. */
export const phaseStart = (id: string) => id === 'CE' ? plan.start : getMeta(`phase:${id}`)
export function setPhaseStart(id: string, day: string | null) {
  if (day) setMeta(`phase:${id}`, day); else db.runSync(`DELETE FROM meta WHERE k = ?`, [`phase:${id}`])
  changed()
}
/** The phase a day falls in: the latest one that has started by then. the owner's
 *  phases read as the coach set them out. */
export function phaseOn(day: string): Phase {
  let cur = PHASES[0]
  for (const p of PHASES) { const s = phaseStart(p.id); if (s && s <= day) cur = p }
  return phaseText(cur)
}
/** The medicines due on a day, with V1 days showing the V1 times and food words. */
export const medsOn = (day: string): Med[] => meds().filter(m => medOn(m, day)).map(m => medForDay(m, phaseOn(day).id === 'V1'))
export const phaseText = (p: Phase): Phase => isOwner() && DOCTOR_PHASES[p.id] ? { ...p, ...DOCTOR_PHASES[p.id] } : p
/** The plan with that day's phase targets applied, for the meal builder and the day balance. */
export function planFor(day: string): Plan {
  const ph = phaseOn(day)
  return { ...plan, targets: { ...(plan.targets ?? { proteinG: 60, vegG: 400, carbMeals: 2 }), kcalMax: null, carbMeals: ph.carbMeals } }
}

/** Saves set-up. A new person starts with no medicines or questions; their
 *  phase start dates begin from day 1 of their own plan. */
export function saveProfile(p: Profile) {
  setMeta('profile', JSON.stringify(p))
  applyProfile(p)
  const have = new Set(db.getAllSync<{ k: string }>(`SELECT day || '|' || slot AS k FROM meal`).map(r => r.k))
  db.withTransactionSync(() => { for (const m of plannedFor(plan, plan.days.map(d => d.date), have)) writeMeal(m) })
  changed()
}

/** Adds foods to a meal without touching what is already logged for it (a
 *  "skipped" mark is cleared). Used by the + button. */
export function addFoods(day: string, slot: Slot, eatenAt: string, rows: { name: string; grams?: number | null; ml?: number | null }[]) {
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM food_log WHERE day = ? AND slot = ? AND name = ?`, [day, slot, SKIPPED])
    for (const r of rows)
      db.runSync(`INSERT INTO food_log (day, slot, name, grams, ml, eaten_at, planned) VALUES (?,?,?,?,?,?,0)`,
        [day, slot, r.name, r.grams ?? null, r.ml ?? null, eatenAt])
  })
  changed()
}
/** Food names logged before, most recent first, for suggestions. */
export const recentFoods = (limit = 40) =>
  db.getAllSync<{ name: string }>(`SELECT name, MAX(id) AS last FROM food_log WHERE name != ? GROUP BY name ORDER BY last DESC LIMIT ?`, [SKIPPED, limit]).map(r => r.name)

// ---- meals: one record per meal (spec v2, 24 Oct) -------------------------------------
// The old food_log and overrides tables are moved here once, and kept untouched
// afterwards as a record. A copy of the whole file is saved first.

db.execSync(`
CREATE TABLE IF NOT EXISTS meal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL, slot TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL CHECK (state IN ('planned', 'eaten', 'skipped')),
  eaten_at TEXT, cook INTEGER NOT NULL DEFAULT 1, note TEXT, origin TEXT NOT NULL DEFAULT 'you',
  UNIQUE (day, slot)
);
CREATE TABLE IF NOT EXISTS meal_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id INTEGER NOT NULL REFERENCES meal(id) ON DELETE CASCADE,
  pos INTEGER NOT NULL, name TEXT NOT NULL, grams REAL, ml REAL, at TEXT,
  p REAL, kcal REAL, source TEXT
);
CREATE INDEX IF NOT EXISTS meal_item_meal ON meal_item(meal_id);
CREATE TABLE IF NOT EXISTS food_test (
  day TEXT NOT NULL, food TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT 'waiting' CHECK (result IN ('waiting', 'passed', 'failed', 'inconclusive')),
  note TEXT, at TEXT NOT NULL, PRIMARY KEY (day, food)
);
PRAGMA foreign_keys = ON;
`)
if (!db.getAllSync<{ name: string }>(`PRAGMA table_info(checkin)`).some(c => c.name === 'burping'))
  db.execSync(`ALTER TABLE checkin ADD COLUMN burping INTEGER`)
// An added snack's own planned time (build 22).
if (!db.getAllSync<{ name: string }>(`PRAGMA table_info(meal)`).some(c => c.name === 'time'))
  db.execSync(`ALTER TABLE meal ADD COLUMN time TEXT`)

type MealRow = { id: number; day: string; slot: Slot; name: string; state: MealState; eaten_at: string | null; cook: number; note: string | null; origin: string; time: string | null }
type ItemRow = { id: number; meal_id: number; pos: number; name: string; grams: number | null; ml: number | null; at: string | null; p: number | null; kcal: number | null; source: string | null }

function writeMeal(m: Meal) {
  db.runSync(`INSERT INTO meal (day, slot, name, state, eaten_at, cook, note, origin, time) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(day, slot) DO UPDATE SET name = excluded.name, state = excluded.state, eaten_at = excluded.eaten_at,
    cook = excluded.cook, note = excluded.note, origin = excluded.origin, time = excluded.time`,
    [m.day, m.slot, m.name, m.state, m.eatenAt, m.cook ? 1 : 0, m.note, m.origin, m.time ?? null])
  const id = db.getFirstSync<{ id: number }>(`SELECT id FROM meal WHERE day = ? AND slot = ?`, [m.day, m.slot])!.id
  db.runSync(`DELETE FROM meal_item WHERE meal_id = ?`, [id])
  m.items.forEach((i, pos) => db.runSync(`INSERT INTO meal_item (meal_id, pos, name, grams, ml, at, p, kcal, source) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, pos, i.name, i.grams, i.ml, i.at, i.p, i.kcal, i.source]))
}

// The move. Runs once; a second run finds schema 2 and does nothing.
if (getMeta('schema') !== '2') {
  try { db.execSync(`VACUUM INTO '${db.databasePath.replace(/diet\.db$/, 'diet-before-meals.db')}'`) } catch { /* an existing copy is fine */ }
  // Read overrides by hand so one unreadable saved meal cannot stop the move.
  const ov: Overrides = {}
  for (const r of db.getAllSync<{ day: string; slot: string; mode: Override['mode']; src: string | null }>(`SELECT * FROM overrides`)) {
    let items: PlanItem[] | undefined
    if (r.mode === 'custom') try { items = JSON.parse(r.src ?? '[]') } catch { items = undefined }
    ov[`${r.day}|${r.slot}`] = r.mode === 'custom' ? { mode: 'custom', items } : { mode: r.mode, from: r.src ?? undefined }
  }
  const old = db.getAllSync<OldRow>(`SELECT * FROM food_log ORDER BY day, slot, eaten_at, id`)
  const moved = moveOldLog(old, ov, plan)
  db.withTransactionSync(() => {
    if (db.getFirstSync(`SELECT 1 FROM meal`)) return       // already moved by an interrupted run that committed
    for (const m of moved) writeMeal(m)
    // Check: every real old row is now an item of the same day and slot.
    const items = db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM meal_item i JOIN meal m ON m.id = i.meal_id WHERE m.origin = 'log'`)!.n
    const rows = old.filter(r => r.name !== OLD_SKIPPED).length
    if (items !== rows) throw new Error(`Meal move check failed: ${rows} old rows, ${items} moved`)
    db.runSync(`INSERT INTO meta (k, v) VALUES ('schema', '2') ON CONFLICT(k) DO UPDATE SET v = '2'`)
  })
  if (getMeta('schema') !== '2') setMeta('schema', '2')
}

// 16 Nov 2026: dish and ingredient names are English or Hindi only. Meals already saved under an old name (poriyal, thoran,
// kuzhambu ...) are renamed once, in the meal names, their notes and their foods.
if (getMeta('rename_en_hi') !== '1') {
  db.withTransactionSync(() => {
    for (const [from, to] of Object.entries(RENAMED).sort((a, b) => b[0].length - a[0].length)) {
      const like = `%${from}%`
      db.runSync(`UPDATE meal_item SET name = replace(name, ?, ?) WHERE name LIKE ?`, [from, to, like])
      db.runSync(`UPDATE meal SET name = replace(name, ?, ?) WHERE name LIKE ?`, [from, to, like])
      db.runSync(`UPDATE meal SET note = replace(note, ?, ?) WHERE note LIKE ?`, [from, to, like])
    }
    setMeta('rename_en_hi', '1')
  })
}

const toMeal = (r: MealRow, items: ItemRow[]): Meal => ({
  id: r.id, day: r.day, slot: r.slot, name: r.name, state: r.state, eatenAt: r.eaten_at, cook: !!r.cook, note: r.note, origin: r.origin, time: r.time,
  items: items.filter(i => i.meal_id === r.id).sort((a, b) => a.pos - b.pos)
    .map(i => ({ id: i.id, name: i.name, grams: i.grams, ml: i.ml, at: i.at, p: i.p, kcal: i.kcal, source: i.source })),
})
/** Every meal on a day that has a record. A slot with no record is simply empty. */
export function mealsOn(day: string): Meal[] {
  const rows = db.getAllSync<MealRow>(`SELECT * FROM meal WHERE day = ?`, [day])
  if (!rows.length) return []
  const items = db.getAllSync<ItemRow>(`SELECT * FROM meal_item WHERE meal_id IN (${rows.map(() => '?').join(',')})`, rows.map(r => r.id))
  return rows.map(r => toMeal(r, items))
}
/** Dishes you added yourself (Add a dish), newest first, one per name, whole-dish amounts when it was split by percentage. */
export function dishesIMade(limit = 60): { name: string; items: { name: string; grams: number | null; ml: number | null }[] }[] {
  const rows = db.getAllSync<MealRow>(`SELECT * FROM meal WHERE origin = 'you' AND trim(name) != '' AND state != 'skipped' ORDER BY day DESC, id DESC LIMIT 400`)
  if (!rows.length) return []
  const items = db.getAllSync<ItemRow>(`SELECT * FROM meal_item WHERE meal_id IN (${rows.map(() => '?').join(',')})`, rows.map(r => r.id))
  const seen = new Set<string>(), out: { name: string; items: { name: string; grams: number | null; ml: number | null }[] }[] = []
  for (const r of rows) {
    const k = r.name.trim().toLowerCase()
    if (seen.has(k)) continue
    const its = items.filter(i => i.meal_id === r.id).sort((a, b) => a.pos - b.pos)
    if (!its.length) continue
    // A portion of a split dish: scale back to the whole from its note ("60% of ...").
    const pct = Number(/^(\d+)% of /.exec(r.note ?? '')?.[1] ?? 100)
    const f = pct > 0 && pct < 100 ? 100 / pct : 1
    seen.add(k)
    out.push({ name: r.name.trim(), items: its.map(i => ({ name: i.name, grams: i.grams == null ? null : Math.round(i.grams * f * 10) / 10, ml: i.ml == null ? null : Math.round(i.ml * f * 10) / 10 })) })
    if (out.length >= limit) break
  }
  return out
}
export const mealAt = (day: string, slot: Slot): Meal | null => mealsOn(day).find(m => m.slot === slot) ?? null
export const emptyMeal = (day: string, slot: Slot): Meal =>
  ({ day, slot, name: '', state: 'planned', eatenAt: null, cook: true, note: null, origin: 'you', items: [] })

/** Saves a meal as given. Eaten items get their numbers frozen if they have none yet. */
export function putMeal(m: Meal) {
  const items = m.state === 'eaten' ? m.items.map(i => i.p == null && i.kcal == null ? snapshot(i) : i) : m.items.map(unsnapshot)
  db.withTransactionSync(() => writeMeal({ ...m, items }))
  changed()
}
/** Planned, eaten or skipped, in one tap. Eating freezes the numbers; going back to planned frees them. */
export function setMealState(day: string, slot: Slot, state: MealState, at?: string) {
  const m = mealAt(day, slot) ?? emptyMeal(day, slot)
  putMeal({ ...m, state, eatenAt: state === 'planned' ? null : at ?? m.eatenAt ?? nowHm(),
    items: state === 'eaten' ? m.items.map(i => snapshot(i)) : m.items })
}
export function deleteMeal(day: string, slot: Slot) {
  db.runSync(`DELETE FROM meal WHERE day = ? AND slot = ?`, [day, slot]); changed()
}

/** The last eaten meal in this slot, or with this name, for "Same as last time". */
export function lastLike(slot: Slot, name: string, before: string): Meal | null {
  const r = (name.trim()
    ? db.getFirstSync<MealRow>(`SELECT * FROM meal WHERE state = 'eaten' AND lower(name) = lower(?) AND day < ? ORDER BY day DESC LIMIT 1`, [name.trim(), before])
    : null) ?? db.getFirstSync<MealRow>(`SELECT * FROM meal WHERE state = 'eaten' AND slot = ? AND day < ? AND EXISTS (SELECT 1 FROM meal_item WHERE meal_id = meal.id) ORDER BY day DESC LIMIT 1`, [slot, before])
  if (!r) return null
  return toMeal(r, db.getAllSync<ItemRow>(`SELECT * FROM meal_item WHERE meal_id = ?`, [r.id]))
}
/** Item names eaten before, most recent first, for typing suggestions. */
export const recentItems = (limit = 40) =>
  db.getAllSync<{ name: string }>(`SELECT i.name, MAX(m.day || i.id) AS last FROM meal_item i JOIN meal m ON m.id = i.meal_id GROUP BY lower(i.name) ORDER BY last DESC LIMIT ?`, [limit]).map(r => r.name)
/** The amount last used for a food, so adding it again starts there. */
export const lastAmount = (name: string) =>
  db.getFirstSync<{ grams: number | null; ml: number | null }>(`SELECT grams, ml FROM meal_item WHERE lower(name) = lower(?) AND (grams IS NOT NULL OR ml IS NOT NULL) ORDER BY id DESC LIMIT 1`, [name])

// ---- food tests (V2 on) ----------------------------------------------------------------

export type TestResult = 'waiting' | 'passed' | 'failed' | 'inconclusive'
export type FoodTest = { day: string; food: string; result: TestResult; note: string | null }
export const testsOn = (day: string) => db.getAllSync<FoodTest>(`SELECT day, food, result, note FROM food_test WHERE day = ?`, [day])
export const allTests = () => db.getAllSync<FoodTest>(`SELECT day, food, result, note FROM food_test ORDER BY day DESC`)
export function setTest(day: string, food: string, result: TestResult, note?: string | null) {
  db.runSync(`INSERT INTO food_test (day, food, result, note, at) VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(day, food) DO UPDATE SET result = excluded.result, note = COALESCE(excluded.note, food_test.note), at = excluded.at`,
    [day, food, result, note ?? null]); changed()
}
export const passedFoods = () => new Set(db.getAllSync<{ food: string }>(`SELECT DISTINCT food FROM food_test WHERE result = 'passed'`).map(r => r.food))

// ---- pauses ---------------------------------------------------------------------------------
// While paused, the diet rules, targets and food tests are off; supplements and
// the weigh-in carry on. Restarting moves the phases that had not started yet.

db.execSync(`CREATE TABLE IF NOT EXISTS pause (start TEXT PRIMARY KEY, end TEXT)`)
export const pauses = () => db.getAllSync<Pause>(`SELECT start, end FROM pause ORDER BY start`)
export const openPause = () => pauses().find(p => !p.end) ?? null
export const isPaused = (day: string) => pausedOn(pauses(), day)
export function startPause(day: string) {
  if (openPause()) return
  db.runSync(`INSERT OR REPLACE INTO pause (start, end) VALUES (?, NULL)`, [day]); changed()
}
/** Back on the plan from `day`. A pause ended on the day it began is simply removed. */
export function endPause(day: string) {
  const p = openPause()
  if (!p) return
  if (day <= p.start) { db.runSync(`DELETE FROM pause WHERE start = ?`, [p.start]); changed(); return }
  const end = addDays(day, -1)
  db.withTransactionSync(() => {
    db.runSync(`UPDATE pause SET end = ? WHERE start = ?`, [end, p.start])
    const starts: Record<string, string> = {}
    for (const ph of PHASES.slice(1)) { const v = getMeta(`phase:${ph.id}`); if (v) starts[ph.id] = v }
    for (const [id, v] of Object.entries(shiftAfterPause(starts, { start: p.start, end }))) setMeta(`phase:${id}`, v)
  })
  changed()
}
export const pauseClashOn = (day: string) => pauseClash(pauses(), day)
/** Day N of the programme, paused days not counted. */
export const programmeDayOn = (day: string) => programmeDay(plan.start, day, pauses())

// ---- rules and targets for a day ----------------------------------------------------------

/** the owner follows the coach's phases; everyone else the clean-eating rules. */
db.execSync(`CREATE TABLE IF NOT EXISTS food_rule (word TEXT PRIMARY KEY, allow INTEGER NOT NULL)`)
/** The person's own food rules from their coach ("chicken: allowed"). */
export const ownRules = () => db.getAllSync<{ word: string; allow: number }>(`SELECT * FROM food_rule ORDER BY word`).map(r => ({ word: r.word, allow: !!r.allow }))
export function setOwnRule(word: string, allow: boolean | null) {
  const w = word.trim().toLowerCase()
  if (!w) return
  if (allow === null) db.runSync(`DELETE FROM food_rule WHERE word = ?`, [w])
  else db.runSync(`INSERT INTO food_rule (word, allow) VALUES (?, ?) ON CONFLICT(word) DO UPDATE SET allow = excluded.allow`, [w, allow ? 1 : 0])
  changed()
}
export const ruleCtx = (day: string): RuleCtx => ({ coach: isOwner(), phase: phaseOn(day).id, passed: passedFoods(), own: ownRules() })
export const verdictOn = (day: string, name: string) => isPaused(day) ? { level: 'ok' as const, why: [], tests: [] } : verdict(name, ruleCtx(day))
/** The weight the protein target uses: the latest one on or before the day. */
const weightBy = (day: string) => db.getFirstSync<{ kg: number }>(`SELECT kg FROM weight WHERE day <= ? ORDER BY day DESC LIMIT 1`, [day])?.kg ?? profile()?.weightKg ?? null
export function targetsOn(day: string): Targets {
  const ph = phaseOn(day)
  const t = plan.targets ?? { proteinG: 60, vegG: 400, carbMeals: 2 }
  const out = targetsFor({ coach: isOwner(), phase: ph.id, weightKg: weightBy(day),
    base: { proteinG: t.proteinG, vegG: t.vegG, carbMeals: ph.carbMeals, kcal: isOwner() ? ph.kcal : profile()?.kcalMin ?? ph.kcal } })
  return isPaused(day) ? { ...out, kcalMin: null, kcalMax: null, drinks: false } : out
}

/** The day's two yes-or-no symptoms, from V2 on. */
export function setSymptom(day: string, key: 'bloating' | 'burping', on: boolean | null) {
  db.runSync(`INSERT INTO checkin (day, at) VALUES (?, datetime('now')) ON CONFLICT(day) DO NOTHING`, [day])
  db.runSync(`UPDATE checkin SET ${key} = ?, at = datetime('now') WHERE day = ?`, [on == null ? null : on ? 1 : 0, day])
  changed()
}
export const symptomsOn = (day: string) => db.getFirstSync<{ bloating: number | null; burping: number | null }>(`SELECT bloating, burping FROM checkin WHERE day = ?`, [day])

// ---- backup and restore ----------------------------------------------------------------------

const TABLES = ['meta', 'pause', 'food_custom', 'food_rule', 'weight', 'water', 'measure', 'meds', 'dose_log', 'done', 'meal', 'meal_item', 'food_test', 'checkin', 'questions', 'shop_have', 'cravings', 'food_log', 'overrides'] as const
/** Every table, with the schema version, as JSON for the share sheet. */
export function exportAll() {
  const out: Record<string, unknown> = { exported: new Date().toISOString(), schema: getMeta('schema') }
  for (const t of TABLES) out[t] = db.getAllSync(`SELECT * FROM ${t}`)
  return JSON.stringify(out, null, 1)
}
/** Replaces everything with a backup. Parents go in before children, and the
 *  whole restore is one transaction, so a bad file changes nothing. */
export function importAll(json: string) {
  const data = JSON.parse(json) as Record<string, Record<string, unknown>[] | undefined>
  db.withTransactionSync(() => {
    for (const t of [...TABLES].reverse()) db.runSync(`DELETE FROM ${t}`)
    for (const t of TABLES) for (const row of data[t] ?? []) {
      const cols = Object.keys(row)
      db.runSync(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map(c => row[c] as SQLite.SQLiteBindValue))
    }
  })
  applyProfile(profile())
  changed()
}

// ---- foods added on this phone (packets read from a barcode) --------------------------------

db.execSync(`CREATE TABLE IF NOT EXISTS food_custom (name TEXT PRIMARY KEY, kcal REAL NOT NULL, p REAL NOT NULL, carb REAL, fat REAL, fibre REAL, source TEXT NOT NULL, code TEXT, ingredients TEXT)`)
type CustomRow = { name: string; kcal: number; p: number; source: string }
const loadCustom = () => addExtraFoods(db.getAllSync<CustomRow>(`SELECT name, kcal, p, source FROM food_custom`)
  .map((r): Food => ({ name: r.name, group: 'side', meals: [], grams: 100, p: r.p, kcal: r.kcal, source: r.source })))
loadCustom()
export function saveCustomFood(f: { name: string; kcal: number; p: number; carb?: number | null; fat?: number | null; fibre?: number | null; source: string; code?: string; ingredients?: string }) {
  db.runSync(`INSERT INTO food_custom (name, kcal, p, carb, fat, fibre, source, code, ingredients) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(name) DO UPDATE SET kcal = excluded.kcal, p = excluded.p, carb = excluded.carb, fat = excluded.fat, fibre = excluded.fibre, source = excluded.source, code = excluded.code, ingredients = excluded.ingredients`,
    [f.name, f.kcal, f.p, f.carb ?? null, f.fat ?? null, f.fibre ?? null, f.source, f.code ?? null, f.ingredients ?? null])
  loadCustom(); changed()
}

/** Planned meals from a coach's menu. A day and slot that already has an
 *  eaten or skipped meal is left alone. Returns how many were added. */
/** The V1 plan as the one plan: planned meals from `today` (today only after 8 AM and 10 AM) to the end of V1 are cleared, then the new ones go in.
 *  Eaten and skipped meals are never touched. */
export function replacePlan(meals: Meal[], today: string, last: string, fromDay?: string) {
  db.withTransactionSync(() => {
    // From a given day on (the new pairing starts tomorrow, today is left as it is), else from the rest of today.
    const gone = fromDay
      ? db.getAllSync<{ id: number }>(`SELECT id FROM meal WHERE state = 'planned' AND origin = 'coach' AND day >= ? AND day <= ?`, [fromDay, last])
      : db.getAllSync<{ id: number }>(`SELECT id FROM meal WHERE state = 'planned' AND origin = 'coach' AND day <= ? AND (day > ? OR (day = ? AND slot NOT IN ('breakfast', 'snack1')))`, [last, today, today])
    for (const g of gone) { db.runSync(`DELETE FROM meal_item WHERE meal_id = ?`, [g.id]); db.runSync(`DELETE FROM meal WHERE id = ?`, [g.id]) }
    for (const m of meals) {
      if (fromDay && m.day < fromDay) continue
      const cur = db.getFirstSync<{ state: string; origin: string }>(`SELECT state, origin FROM meal WHERE day = ? AND slot = ?`, [m.day, m.slot])
      if (cur && (cur.state !== 'planned' || cur.origin !== 'coach')) continue
      writeMeal(m)
    }
  })
  changed()
}

/** Meals that were eaten and need recording once: each goes in unless that slot already holds an eaten meal. */
export function logEatenOnce(meals: Meal[]) {
  for (const m of meals) {
    const cur = db.getFirstSync<{ state: string }>(`SELECT state FROM meal WHERE day = ? AND slot = ?`, [m.day, m.slot])
    if (cur?.state === 'eaten') continue
    putMeal(m)
  }
}

export function addPlannedMeals(meals: Meal[]) {
  let n = 0
  db.withTransactionSync(() => {
    for (const m of meals) {
      const cur = db.getFirstSync<{ state: string }>(`SELECT state FROM meal WHERE day = ? AND slot = ?`, [m.day, m.slot])
      if (cur && cur.state !== 'planned') continue
      writeMeal(m); n++
    }
  })
  changed()
  return n
}
