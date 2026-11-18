// Apple Health. The watch saves its readings there; this app only reads them
// (sleep, heart, movement, weight) and writes back the two things it records
// itself: water and morning weight. Nothing here runs on the watch.
import {
  CategoryValueSleepAnalysis, isHealthDataAvailable, queryCategorySamples, queryQuantitySamples,
  queryStatisticsForQuantity, requestAuthorization, saveQuantitySample, subscribeToChanges,
} from '@kingstinct/react-native-healthkit'
import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { addDays, at, morningWeights, weightsToApply, ymd } from './core'
import type { SleepSeg } from '@/components/Charts'
import { getMeta, onChange, onHealthWrites, setMeta, setWeight, weightsSince } from './db'

const READ = [
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances',
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierAppleExerciseTime',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierLeanBodyMass',
  'HKQuantityTypeIdentifierBodyMassIndex',
] as const
/** Bump when READ gains a type, so the permission sheet asks once for the new ones. */
const TYPES_VERSION = '2'
const WRITE = ['HKQuantityTypeIdentifierBodyMass', 'HKQuantityTypeIdentifierDietaryWater'] as const

export const healthConnected = () => getMeta('health') === 'on'

/** Shows Apple's permission sheet once. Apple never says what was refused, so
 *  every read below treats missing data as "not shared" rather than an error. */
export async function connectHealth() {
  if (!isHealthDataAvailable()) return false
  await requestAuthorization({ toRead: READ as any, toShare: WRITE as any })
  setMeta('health', 'on'); setMeta('health_types', TYPES_VERSION)
  void importWeights()
  return true
}

// ---- weights from a smart scale ------------------------------------------------------------

const OWN_APP = 'in.morgan.diet'
/** Brings the last three weeks of morning weights in from Apple Health, where a
 *  scale's app (Life Health Sense and the like) saves them. Runs on launch, when
 *  the app comes back to the front, and whenever Apple Health gets a new weight
 *  while the app is open. A weight typed in the app is never replaced. */
export async function importWeights() {
  if (!healthConnected()) return 0
  const from = addDays(ymd(new Date()), -21)
  let raw: any[] = []
  try {
    raw = [...await queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', { limit: 0, ascending: true, unit: 'kg', ...range(at(from, '00:00'), new Date()) } as any)]
  } catch { return 0 }
  const morning = morningWeights(raw.map(x => ({ kg: x.quantity, at: new Date(x.startDate), app: x.sourceRevision?.source?.bundleIdentifier ?? '' })), OWN_APP)
  const todo = weightsToApply(morning, weightsSince(from))
  for (const w of todo) setWeight(w.day, w.kg, true, w.at)
  return todo.length
}
let watching = false
/** Listens for new weights in Apple Health while the app is open. */
export function watchWeights() {
  if (watching || !healthConnected()) return
  watching = true
  try { subscribeToChanges('HKQuantityTypeIdentifierBodyMass', () => { void importWeights() }) } catch { watching = false }
}

export type DayHealth = {
  sleep?: { asleepMin: number; deepMin: number; remMin: number; awakeMin: number; bed: Date; wake: Date; segs: SleepSeg[] }
  breathing?: number; spo2Low?: number
  restingHr?: number; hrv?: number
  steps?: number; activeKcal?: number; exerciseMin?: number
  weightKg?: number; weightAt?: Date; bodyFatPct?: number
}

const range = (startDate: Date, endDate: Date) => ({ filter: { date: { startDate, endDate } } })

async function stat(id: string, kind: 'cumulativeSum' | 'discreteAverage' | 'discreteMin', unit: string, from: Date, to: Date) {
  try {
    const r: any = await queryStatisticsForQuantity(id as any, [kind], { ...range(from, to), unit } as any)
    const q = kind === 'cumulativeSum' ? r.sumQuantity : kind === 'discreteMin' ? r.minimumQuantity : r.averageQuantity
    return q ? q.quantity as number : undefined
  } catch { return undefined }
}

/** Last night's sleep counts for the day you wake up on: 6 pm the evening
 *  before to noon. When the watch has recorded sleep stages, only those are
 *  counted, so a phone and a watch recording the same night are not added twice. */
async function sleepFor(day: string): Promise<DayHealth['sleep']> {
  const from = at(addDays(day, -1), '18:00'), to = at(day, '12:00')
  let s: any[] = []
  try { s = [...await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { limit: 0, ...range(from, to) } as any)] } catch { return undefined }
  if (!s.length) return undefined
  const V = CategoryValueSleepAnalysis
  const staged = s.filter(x => x.value === V.asleepCore || x.value === V.asleepDeep || x.value === V.asleepREM)
  const asleep = staged.length ? staged : s.filter(x => x.value === V.asleepUnspecified)
  const mins = (xs: any[]) => Math.round(xs.reduce((t, x) => t + (+new Date(x.endDate) - +new Date(x.startDate)), 0) / 60000)
  const all = [...asleep, ...s.filter(x => x.value === V.awake)]
  if (!asleep.length) return undefined
  return {
    asleepMin: mins(asleep),
    deepMin: mins(s.filter(x => x.value === V.asleepDeep)),
    remMin: mins(s.filter(x => x.value === V.asleepREM)),
    awakeMin: mins(s.filter(x => x.value === V.awake)),
    bed: new Date(Math.min(...all.map(x => +new Date(x.startDate)))),
    wake: new Date(Math.max(...all.map(x => +new Date(x.endDate)))),
    segs: [...(staged.length ? staged : asleep), ...s.filter(x => x.value === V.awake)].map(x => ({
      stage: x.value === V.asleepDeep ? 'deep' : x.value === V.asleepREM ? 'rem' : x.value === V.asleepCore ? 'core' : x.value === V.awake ? 'awake' : 'asleep',
      start: +new Date(x.startDate), end: +new Date(x.endDate) })) as SleepSeg[],
  }
}

/** Everything Apple Health holds for one day. Each part may be missing. */
export async function healthFor(day: string): Promise<DayHealth> {
  const start = at(day, '00:00'), end = at(addDays(day, 1), '00:00')
  const night0 = at(addDays(day, -1), '18:00'), night1 = at(day, '12:00')
  const [sleep, breathing, spo2Low, restingHr, hrv, steps, activeKcal, exerciseMin, fat] = await Promise.all([
    sleepFor(day),
    stat('HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances', 'discreteAverage', 'count', night0, night1),
    stat('HKQuantityTypeIdentifierOxygenSaturation', 'discreteMin', '%', night0, night1),
    stat('HKQuantityTypeIdentifierRestingHeartRate', 'discreteAverage', 'count/min', start, end),
    stat('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'discreteAverage', 'ms', start, end),
    stat('HKQuantityTypeIdentifierStepCount', 'cumulativeSum', 'count', start, end),
    stat('HKQuantityTypeIdentifierActiveEnergyBurned', 'cumulativeSum', 'kcal', start, end),
    stat('HKQuantityTypeIdentifierAppleExerciseTime', 'cumulativeSum', 'min', start, end),
    stat('HKQuantityTypeIdentifierBodyFatPercentage', 'discreteAverage', '%', start, end),
  ])
  // The first weight of the day is the empty-stomach one.
  let weightKg: number | undefined, weightAt: Date | undefined
  try {
    const w: any[] = [...await queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', { limit: 1, ascending: true, unit: 'kg', ...range(start, end) } as any)]
    if (w[0]) { weightKg = Math.round(w[0].quantity * 10) / 10; weightAt = new Date(w[0].startDate) }
  } catch {}
  return { sleep, breathing, spo2Low: spo2Low !== undefined ? spo2Low * (spo2Low <= 1 ? 100 : 1) : undefined,
    restingHr, hrv, steps, activeKcal, exerciseMin,
    bodyFatPct: fat !== undefined ? fat * (fat <= 1 ? 100 : 1) : undefined, weightKg, weightAt }
}

/** Reads one day from Apple Health and re-reads it whenever the app logs something
 *  or comes back to the front. */
export function useHealth(day: string) {
  const [data, setData] = useState<DayHealth | null>(null)
  useEffect(() => {
    if (!healthConnected()) return
    let live = true
    const load = () => healthFor(day).then(d => { if (live) setData(d) })
    load()
    const off = onChange(load)
    // Steps keep counting while the app is in the background.
    const sub = AppState.addEventListener('change', s => { if (s === 'active') load() })
    return () => { live = false; off(); sub.remove() }
  }, [day])
  return data
}

// ---- writing back ----------------------------------------------------------------

export function saveWaterToHealth(ml: number) {
  if (!healthConnected()) return
  const now = new Date()
  saveQuantitySample('HKQuantityTypeIdentifierDietaryWater', 'mL' as any, ml, now, now).catch(() => {})
}
export function saveWeightToHealth(kg: number) {
  if (!healthConnected()) return
  const now = new Date()
  saveQuantitySample('HKQuantityTypeIdentifierBodyMass', 'kg' as any, kg, now, now).catch(() => {})
}

onHealthWrites(saveWaterToHealth, saveWeightToHealth)

/** Already connected before new types were added: ask once for the new ones only. */
export async function askForNewTypes() {
  if (!healthConnected() || getMeta('health_types') === TYPES_VERSION || !isHealthDataAvailable()) return
  try { await requestAuthorization({ toRead: READ as any, toShare: WRITE as any }) } catch {}
  setMeta('health_types', TYPES_VERSION)
}

export type BodyReading = { day: string; weightKg?: number; fatPct?: number; leanKg?: number; bmi?: number }
/** The scale's latest readings for each of the last `days` days: weight, body fat, lean mass, BMI. */
export async function bodyReadings(days = 30): Promise<BodyReading[]> {
  if (!healthConnected()) return []
  const from = at(addDays(ymd(new Date()), -days), '00:00'), to = new Date()
  const read = async (id: string, unit: string) => {
    try { return [...await queryQuantitySamples(id as any, { limit: 0, ascending: true, unit, ...range(from, to) } as any)] as any[] } catch { return [] }
  }
  const [w, f, l, b] = await Promise.all([
    read('HKQuantityTypeIdentifierBodyMass', 'kg'), read('HKQuantityTypeIdentifierBodyFatPercentage', '%'),
    read('HKQuantityTypeIdentifierLeanBodyMass', 'kg'), read('HKQuantityTypeIdentifierBodyMassIndex', 'count'),
  ])
  const byDay = new Map<string, BodyReading>()
  const put = (xs: any[], key: keyof BodyReading, k = 1) => { for (const x of xs) {
    const day = ymd(new Date(x.startDate)); const r = byDay.get(day) ?? { day }
    if ((r as any)[key] == null) (r as any)[key] = Math.round(x.quantity * k * 10) / 10      // first reading of the day
    byDay.set(day, r)
  } }
  put(w, 'weightKg'); put(f, 'fatPct', f[0]?.quantity <= 1 ? 100 : 1); put(l, 'leanKg'); put(b, 'bmi')
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day))
}
