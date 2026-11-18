import { useLocalSearchParams } from 'expo-router'
import { DayView } from '@/components/DayView'
import { Screen } from '@/components/ui'

export default function Day() {
  const { date } = useLocalSearchParams<{ date: string }>()
  return <Screen><DayView day={date} /></Screen>
}
