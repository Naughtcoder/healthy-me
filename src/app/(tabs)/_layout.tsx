import { NativeTabs } from 'expo-router/unstable-native-tabs'

/** The system tab bar: Today, Prep, Plan, Meds, Me. */
export default function Tabs() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sun.max.fill" md="today" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="prep">
        <NativeTabs.Trigger.Label>Prep</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="fork.knife" md="restaurant" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plan">
        <NativeTabs.Trigger.Label>Plan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.bullet.rectangle" md="list" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="meds">
        <NativeTabs.Trigger.Label>Meds</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="pills.fill" md="medication" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="me">
        <NativeTabs.Trigger.Label>Me</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
