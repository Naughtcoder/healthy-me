import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { AppState, useColorScheme } from 'react-native'
import { router, Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Notifications from 'expo-notifications'
import { C, setScheme } from '@/theme'
import { CloseX } from '@/components/ui'
import { askPermission, refreshAlarms, routeFor } from '@/lib/notify'
import { askForNewTypes, importWeights, watchWeights } from '@/lib/health'
import { getMeta, isOwner, logEatenOnce, mealsOn, profile, putMeal, replacePlan, setMeta, targetsOn } from '@/lib/db'
import { addDays, ymd } from '@/lib/core'
import { alignPairs } from '@/lib/pairs'
import { TOUR_VERSION } from './tour'
import { drainQueue, nearestSlot, syncWidget, takeVoiceRequest } from '@/lib/widget'

const openVoiceLog = () => { if (takeVoiceRequest()) setTimeout(() => router.push({ pathname: '/meal', params: { slot: nearestSlot(), voice: '1' } }), 600) }

/** Asks for alarms once, books them, and rebuilds them each time the app comes back. */
function Alarms() {
  const last = Notifications.useLastNotificationResponse()
  useEffect(() => {
    // First launch: the walkthrough, then the alarm permission.
    // A new person sets up first; the walkthrough follows from there.
    if (!profile()) setTimeout(() => router.push('/setup'), 400)
    else if (getMeta('tour') !== TOUR_VERSION) setTimeout(() => router.push('/tour'), 400)
    else askPermission().then(() => refreshAlarms())
    // Siri and the widget buttons queue what they did; apply it, then redraw the widgets.
    drainQueue(); openVoiceLog(); syncWidget(); void askForNewTypes().then(() => importWeights()); watchWeights()
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') { drainQueue(); openVoiceLog(); syncWidget(); void refreshAlarms(); void importWeights() }
      // Leaving the app: write the summary now, so a Shortcut that runs on close reads this visit.
      else if (s === 'background') syncWidget()
    })
    return () => sub.remove()
  }, [])
  // Tapping a meal reminder (not a button) opens that meal.
  useEffect(() => {
    const to = routeFor(last)
    if (to) setTimeout(() => router.push(to as never), 300)
  }, [last])
  return null
}

export default function Root() {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark'
  setScheme(scheme)
  // The key remounts the screens when the scheme flips, since C is read at render.
  return (
    <GestureHandlerRootView key={scheme} style={{ flex: 1 }}>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <Alarms />
      <Stack screenOptions={{ headerTintColor: C.text, headerStyle: { backgroundColor: C.bg }, contentStyle: { backgroundColor: C.bg }, headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="meal" options={{ presentation: 'modal', title: 'Meal', headerRight: () => <CloseX onPress={() => router.back()} /> }} />
        <Stack.Screen name="dish" options={{ presentation: 'modal', title: 'Add a dish', headerRight: () => <CloseX onPress={() => router.back()} /> }} />
        <Stack.Screen name="balance" options={{ presentation: 'modal', title: 'Balance the day', headerRight: () => <CloseX onPress={() => router.back()} /> }} />
        <Stack.Screen name="scan" options={{ presentation: 'modal', title: 'Scan a barcode', headerRight: () => <CloseX onPress={() => router.back()} /> }} />
        <Stack.Screen name="menu" options={{ presentation: 'modal', title: 'Add a meal plan', headerRight: () => <CloseX onPress={() => router.back()} /> }} />
        <Stack.Screen name="restore" options={{ presentation: 'modal', title: 'Restore a backup', headerRight: () => <CloseX onPress={() => router.back()} /> }} />
        <Stack.Screen name="import" options={{ presentation: 'modal', title: 'Add from notes', headerRight: () => <CloseX onPress={() => router.back()} /> }} />
        <Stack.Screen name="shop" options={{ presentation: 'modal', title: 'Shopping list', headerRight: () => <CloseX onPress={() => router.back()} /> }} />
        <Stack.Screen name="questions" options={{ presentation: 'modal', title: 'Questions for the coach', headerRight: () => <CloseX onPress={() => router.back()} /> }} />
        <Stack.Screen name="review" options={{ presentation: 'modal', title: 'Weekly review', headerRight: () => <CloseX onPress={() => router.back()} /> }} />
        <Stack.Screen name="med" options={{ presentation: 'modal', title: 'Medicine', headerRight: () => <CloseX onPress={() => router.back()} /> }} />
        <Stack.Screen name="day/[date]" options={{ title: '' }} />
        <Stack.Screen name="tour" options={{ presentation: 'fullScreenModal', headerShown: false }} />
        <Stack.Screen name="setup" options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }} />
      </Stack>
    </GestureHandlerRootView>
  )
}
