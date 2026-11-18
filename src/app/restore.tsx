import { useState } from 'react'
import { Alert, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { C } from '@/theme'
import { importAll } from '@/lib/db'
import { refreshAlarms } from '@/lib/notify'
import { syncWidget } from '@/lib/widget'
import { Button, Card, Field, Muted } from '@/components/ui'

/** Paste a backup made with "Export a backup". It replaces everything on this
 *  phone in one step; a file that cannot be read changes nothing. */
export default function Restore() {
  const [text, setText] = useState('')
  const go = () => Alert.alert('Replace everything?', 'All meals, weights and settings on this phone are replaced by the backup.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Replace', style: 'destructive', onPress: () => {
      try { importAll(text); void refreshAlarms(); syncWidget(); router.back() }
      catch (e: any) { Alert.alert('Not restored', `Nothing was changed. ${e?.message ?? ''}`) }
    } },
  ])
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Card>
          <Muted>Paste the whole backup text below.</Muted>
          <Field value={text} onChangeText={setText} multiline placeholder='{"exported": ...' style={{ width: '100%', minHeight: 160, textAlignVertical: 'top', fontSize: 12 }}
            autoCorrect={false} autoCapitalize="none" spellCheck={false} />
        </Card>
        <Button title="Restore" kind="danger" disabled={!text.trim().startsWith('{')} onPress={go} />
      </ScrollView>
    </View>
  )
}
