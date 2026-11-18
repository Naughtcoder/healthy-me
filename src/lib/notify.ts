// Reminders. iOS holds only the 64 soonest local notifications, so the app
// books the next 3 days of one-off reminders and rebuilds them on launch, on
// return to the app, and after every change. Three kinds only (spec v2): the
// morning weigh-in, each supplement with one follow-up 30 minutes later, and
// meals if switched on in Me. Answers from a reminder (Taken, Skip, Snooze,
// Ate it) arrive through one listener registered at import time, so they land
// even when the tap cold-starts the app.
import * as Notifications from 'expo-notifications'
import { remindersFrom, SLOT_NAME, type Alarm, type Slot } from './core'
import { slotTime } from './builder'
import { dosesOn, getMeta, mealsOn, meds, onChange, phaseOn, plan, setDose, setMealState, weightOn } from './db'

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
})

// Category ids stay plain words: Expo rejects ':' and '-' in them.
const ready = (async () => {
  await Notifications.setNotificationCategoryAsync('dose', [
    { identifier: 'taken', buttonTitle: 'Taken', options: { opensAppToForeground: false } },
    { identifier: 'snooze', buttonTitle: 'Snooze 10 min', options: { opensAppToForeground: false } },
    { identifier: 'skip', buttonTitle: 'Skip', options: { isDestructive: true, opensAppToForeground: false } },
  ])
  await Notifications.setNotificationCategoryAsync('meal', [
    { identifier: 'ate', buttonTitle: 'Ate as planned', options: { opensAppToForeground: false } },
    { identifier: 'snooze', buttonTitle: 'Snooze 15 min', options: { opensAppToForeground: false } },
  ])
})()

export async function askPermission() {
  const cur = await Notifications.getPermissionsAsync()
  if (cur.granted) return true
  const res = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })
  return res.granted
}

/** True when this item is already dealt with, so its reminder is not booked. */
function settled(day: string, key: string) {
  if (key === 'r:weigh') return !!weightOn(day)
  if (key.startsWith('d:')) {
    const parts = key.split(':')                 // d:d3:13:30
    const medId = parts[1], time = parts.slice(2).join(':')
    return dosesOn(day).some(d => d.med_id === medId && d.time === time)
  }
  if (key.startsWith('m:')) return mealsOn(day).some(m => m.slot === key.slice(2) && m.state !== 'planned')
  return false
}

const weighAt = () => plan.routine.find(r => r.id === 'weigh')?.time ?? '07:30'
/** Meal reminders are off unless switched on in Me. */
export const mealAlerts = () => getMeta('mealAlerts') === '1'
const mealList = (day: string) => !mealAlerts() ? [] : mealsOn(day)
  .filter(m => m.state === 'planned' && ['breakfast', 'lunch', 'dinner'].includes(m.slot) && (m.name || m.items.length))
  .map(m => ({ slot: m.slot, time: slotTime(plan, m.slot), title: SLOT_NAME[m.slot], body: m.name || m.items.map(i => i.name).join(', ') }))

let running: Promise<void> | null = null
let again = false
/** Rebuilds every booked reminder. Runs one at a time; a call during a run queues one more. */
export function refreshAlarms(): Promise<void> {
  if (running) { again = true; return running }
  running = (async () => {
    try {
      await ready
      const perm = await Notifications.getPermissionsAsync()
      if (!perm.granted) return
      // Snoozes are kept; everything else is rebuilt from the records.
      const pending = await Notifications.getAllScheduledNotificationsAsync()
      for (const n of pending) if (n.content.data?.kind !== 'snooze') await Notifications.cancelScheduledNotificationAsync(n.identifier)
      const list = remindersFrom(meds(), new Date(), { weighAt: weighAt(), days: 3, cap: 56, settled, meals: mealList, v1: d => phaseOn(d).id === 'V1' })
      for (const a of list) await book(a)
      // The last one asks for a visit, because only an open app refills the queue.
      const last = list[list.length - 1]
      if (last) await Notifications.scheduleNotificationAsync({
        identifier: 'refill',
        content: { title: 'Open Healthy Me', body: 'Reminders run out after this. Open the app to keep them coming.', data: { kind: 'refill' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(+last.when + 60_000) },
      })
    } finally {
      running = null
      if (again) { again = false; void refreshAlarms() }
    }
  })()
  return running
}

function book(a: Alarm) {
  return Notifications.scheduleNotificationAsync({
    identifier: a.id,
    content: {
      title: a.title, body: a.body, sound: true,
      categoryIdentifier: a.category === 'routine' ? undefined : a.category,
      interruptionLevel: a.category === 'dose' ? 'timeSensitive' : 'active',
      data: { kind: a.category, ...a.data },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: a.when },
  })
}

async function snooze(req: Notifications.NotificationRequest, mins: number) {
  const c = req.content
  await Notifications.scheduleNotificationAsync({
    content: { title: c.title ?? '', body: c.body ?? '', sound: true, categoryIdentifier: (c as any).categoryIdentifier,
      interruptionLevel: 'timeSensitive', data: { ...c.data, kind: 'snooze', was: c.data?.kind } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: mins * 60 },
  })
}

/** What a reminder's buttons do. Every write is keyed by day and item, so a
 *  response handled twice changes nothing the second time. Answering a dose
 *  also takes down its follow-up, booked or already showing. */
async function handle(res: Notifications.NotificationResponse) {
  const req = res.notification.request
  const d = req.content.data as Record<string, string> | undefined
  if (!d?.day || !d.key) return
  const kind = d.kind === 'snooze' ? d.was : d.kind
  const action = res.actionIdentifier
  if (action === 'snooze') {
    await snooze(req, kind === 'meal' ? 15 : 10)
    if (kind === 'dose') await Notifications.cancelScheduledNotificationAsync(`${d.day}|${d.key}|follow`).catch(() => {})
  } else if (kind === 'dose' && (action === 'taken' || action === 'skip')) {
    // A shared reminder carries every medicine due then, comma-separated.
    for (const id of d.medId.split(',')) setDose(d.day, id, d.time, action === 'taken' ? 'taken' : 'skipped')
    for (const id of [`${d.day}|${d.key}`, `${d.day}|${d.key}|follow`]) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
      await Notifications.dismissNotificationAsync(id).catch(() => {})
    }
  } else if (kind === 'meal' && action === 'ate') setMealState(d.day, d.slot as Slot, 'eaten')
  await Notifications.dismissNotificationAsync(req.identifier).catch(() => {})
}

let lastHandled = ''
const once = (res: Notifications.NotificationResponse) => {
  const id = `${res.notification.request.identifier}|${res.actionIdentifier}|${res.notification.date}`
  if (id === lastHandled) return
  lastHandled = id
  void handle(res)
}
Notifications.addNotificationResponseReceivedListener(once)
// A tap that launched the app arrives here instead of through the listener.
const cold = Notifications.getLastNotificationResponse()
if (cold) { once(cold); Notifications.clearLastNotificationResponse() }

// Any change alters which reminders are still needed.
let t: ReturnType<typeof setTimeout> | undefined
onChange(() => { clearTimeout(t); t = setTimeout(() => void refreshAlarms(), 800) })

/** The screen a tapped reminder should open, if any. */
export function routeFor(res: Notifications.NotificationResponse | null | undefined) {
  if (!res || res.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null
  const d = res.notification.request.content.data as Record<string, string> | undefined
  if ((d?.kind === 'meal' || d?.was === 'meal') && d.day && d.slot) return `/meal?day=${d.day}&slot=${d.slot}`
  return null
}
