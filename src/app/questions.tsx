import { useState } from 'react'
import { Pressable, ScrollView, Share, Text, View } from 'react-native'
import { router } from 'expo-router'
import DateTimePicker from '@react-native-community/datetimepicker'
import { C } from '@/theme'
import { addQuestion, answerQuestion, deleteQuestion, getMeta, questions, setMeta, useDb } from '@/lib/db'
import { Button, Card, Field, Label, Muted } from '@/components/ui'

/** Questions for the coach, kept until they are answered. The call
 *  time shows on Today the day before and the day of. */
export default function Questions() {
  useDb()
  const list = questions()
  const open = list.filter(q => !q.answered)
  const [text, setText] = useState('')
  const [answering, setAnswering] = useState<number | null>(null)
  const [answer, setAnswer] = useState('')
  const call = getMeta('doctorCall')

  const add = () => { if (text.trim()) { addQuestion(text.trim()); setText('') } }
  const send = () => Share.share({ message: ['Questions for my call:', ...open.map((q, i) => `${i + 1}. ${q.text}`)].join('\n') })

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Label>Next coach call</Label>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: C.text, fontSize: 16 }}>{call ? 'Set for' : 'Not booked'}</Text>
            <DateTimePicker value={call ? new Date(call) : new Date()} mode="datetime" display="compact"
              onChange={(_, d) => d && setMeta('doctorCall', `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)} />
          </View>
        </Card>

        <Card>
          <Label>Add a question</Label>
          <Field value={text} onChangeText={setText} placeholder="For example: can I have coffee with almond milk?" multiline style={{ width: '100%', minHeight: 60, paddingTop: 10 }} />
          <Button title="Add" kind="primary" disabled={!text.trim()} onPress={add} />
        </Card>

        <Card>
          <Label>{open.length} open</Label>
          {open.map(q => (
            <View key={q.id} style={{ gap: 6, paddingVertical: 4 }}>
              <Text style={{ color: C.text, fontSize: 16, lineHeight: 22 }}>{q.text}</Text>
              {answering === q.id ? (
                <>
                  <Field value={answer} onChangeText={setAnswer} placeholder="What they said" multiline style={{ width: '100%', minHeight: 50, paddingTop: 10 }} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title="Save answer" kind="primary" disabled={!answer.trim()} onPress={() => { answerQuestion(q.id, answer.trim()); setAnswering(null); setAnswer('') }} />
                    <Button title="Cancel" onPress={() => setAnswering(null)} />
                  </View>
                </>
              ) : (
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <Pressable onPress={() => { setAnswering(q.id); setAnswer('') }} hitSlop={8}><Text style={{ color: C.positive, fontSize: 14, fontWeight: '600' }}>Answered</Text></Pressable>
                  <Pressable onPress={() => deleteQuestion(q.id)} hitSlop={8}><Text style={{ color: C.text3, fontSize: 14 }}>Remove</Text></Pressable>
                </View>
              )}
            </View>
          ))}
          {!open.length && <Muted>Nothing open.</Muted>}
        </Card>
        {open.length > 0 && <Button title="Send these questions" onPress={send} />}
        <Button title="Add a medicine the coach recommended" onPress={() => router.push('/med')} />

        {list.some(q => q.answered) && (
          <Card>
            <Label>Answered</Label>
            {list.filter(q => q.answered).map(q => (
              <View key={q.id} style={{ gap: 2, paddingVertical: 4 }}>
                <Text style={{ color: C.text2, fontSize: 15 }}>{q.text}</Text>
                <Text style={{ color: C.text, fontSize: 15, lineHeight: 21 }}>{q.answer}</Text>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </View>
  )
}
