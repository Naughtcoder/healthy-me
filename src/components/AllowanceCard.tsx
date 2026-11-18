// "How much ghee can I use?" for a dish: pick the ingredient, the calories the dish should come to (typed, or worked out from the
// meals and the day), and see the amount in grams and millilitres, with a check of the whole day against the ceiling.
import { useEffect, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { C } from '@/theme'
import { Button, Label, Muted } from '@/components/ui'
import { allowance, type DishItem } from '@/lib/dish'
import { nutrition } from '@/lib/meals'

/** Cooking fats the plan allows, offered as the thing to work out even when the dish does not have them yet. */
const ALLOWED_FATS = ['Ghee', 'Butter', 'Olive oil', 'Coconut oil', 'Sesame oil', 'Mustard oil']

type Props = {
  items: DishItem[]
  /** The calories the dish should come to when nothing is typed, and where that number comes from. */
  aimDefault: number
  aimWhy: string
  /** Everything on the day outside this dish, in kcal, and the day's ceiling (null when there is none). */
  otherKcal: number
  kcalMax: number | null
  /** What the dish is called in the sentence ("the dish", "this meal"). */
  what?: string
  /** This meal's part of the dish when it is cooked once for several meals (1 when it is the only one). */
  share?: number
  onUse: (name: string, grams: number) => void
  /** Tells the screen what the card would put in right now (null when nothing fits), so a prompt elsewhere can apply it. */
  onSuggest?: (s: { name: string; grams: number } | null) => void
}

export function AllowanceCard({ items: given, aimDefault, aimWhy, otherKcal, kcalMax, what = 'the dish', share = 1, onUse, onSuggest }: Props) {
  // No fat in the dish yet: offer ghee at nothing, so the answer is how much to add (not more carrot).
  const items = given.some(i => /\b(ghee|oil|butter)\b/i.test(i.name)) ? given : [...given, { name: 'Ghee', grams: 0, ml: null }]
  const extras = ALLOWED_FATS.filter(f => !items.some(i => i.name.toLowerCase() === f.toLowerCase()) && !!nutrition(f, 100, null)).map(f => ({ name: f, grams: 0, ml: null as number | null }))
  const choices = [...items, ...extras]
  const [adjust, setAdjust] = useState<string | null>(null)
  const [typed, setTyped] = useState<string | null>(null)   // what is in the box while typing; null means follow the default
  useEffect(() => { setTyped(null) }, [aimDefault])          // new meals chosen: back to the worked-out number
  const aim = typed != null && typed !== '' && Number.isFinite(Number(typed)) ? Number(typed) : aimDefault
  const adjName = adjust && choices.some(i => i.name === adjust) ? adjust : items.find(i => /\b(ghee|oil|butter)\b/i.test(i.name))?.name ?? items[0]?.name ?? null
  const allow = adjName ? allowance(items, aim, adjName) : null
  const sName = adjName, sGrams = allow?.fits ? allow.grams : null
  useEffect(() => { onSuggest?.(sName && sGrams != null ? { name: sName, grams: sGrams } : null) }, [sName, sGrams])
  if (!adjName || !allow) return null
  const day = otherKcal + allow.kcal
  const over = kcalMax ? day - kcalMax : 0
  const step = (by: number) => { Haptics.selectionAsync(); setTyped(String(Math.max(0, aim + by))) }
  const amount = allow.fits ? `${allow.grams} g${allow.ml != null ? ` · ${allow.ml} ml` : ''}, about ${allow.tsp} tsp` : 'None fits'
  return (
    <View style={{ gap: 8, backgroundColor: C.raised, borderRadius: 14, padding: 12 }}>
      <Label>How much {adjName.toLowerCase()} can I use?</Label>
      <Text style={{ color: allow.fits ? C.text : C.negative, fontSize: 22, fontWeight: '700' }}>{amount}</Text>
      <Muted small>
        {allow.fits
          ? `With everything else as typed (${allow.rest} kcal), ${adjName.toLowerCase()} at ${allow.grams} g brings ${what} to ${allow.kcal} kcal, the aim of ${aim} kcal${typed != null ? ' you typed' : ` (${aimWhy})`}.`
          : `The other ingredients already come to ${allow.rest} kcal, over the aim of ${aim}. Raise the aim or take something out.`}
      </Muted>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: C.text2, fontSize: 13 }}>Aim for {what}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => step(-10)} hitSlop={8} accessibilityLabel="Lower the aim" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.text, fontSize: 20 }}>−</Text></Pressable>
          <TextInput value={typed ?? String(aim)} onChangeText={t => setTyped(t.replace(',', '.').replace(/[^\d.]/g, ''))} onBlur={() => { if (typed === '') setTyped(null) }}
            keyboardType="decimal-pad" selectTextOnFocus accessibilityLabel="Aim in kcal"
            style={{ color: C.text, fontSize: 16, fontWeight: '700', minWidth: 64, textAlign: 'center', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, backgroundColor: C.card, fontVariant: ['tabular-nums'] }} />
          <Text style={{ color: C.text2, fontSize: 14 }}>kcal</Text>
          <Pressable onPress={() => step(10)} hitSlop={8} accessibilityLabel="Raise the aim" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.text, fontSize: 20 }}>+</Text></Pressable>
        </View>
      </View>
      {typed != null && <Pressable onPress={() => setTyped(null)} accessibilityRole="button"><Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>Back to {aimDefault} kcal ({aimWhy})</Text></Pressable>}
      {allow.fits && share < 0.999 ? <Muted small>This meal's part: {Math.round(allow.kcal * share)} kcal ({Math.round(share * 100)}% of the dish). The other meals get the rest.</Muted> : null}
      {kcalMax ? (
        <Text style={{ color: over > 0 ? C.negative : C.positive, fontSize: 13, fontWeight: '600' }}>
          {over > 0 ? `Check: the day would be ${Math.round(day)} kcal, ${Math.round(over)} over the ${kcalMax} ceiling.` : `Check: the day would be ${Math.round(day)} of ${kcalMax} kcal, ${Math.round(-over)} to spare.`}
        </Text>
      ) : null}
      <Text style={{ color: C.text3, fontSize: 12 }}>Work it out for</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {choices.map(i => (
          <Pressable key={i.name} onPress={() => { Haptics.selectionAsync(); setAdjust(i.name) }} accessibilityRole="button" accessibilityState={{ selected: i.name === adjName }}
            style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: i.name === adjName ? C.accent : C.card }}>
            <Text style={{ color: i.name === adjName ? C.accentText : C.text, fontSize: 14, fontWeight: '600' }}>{i.name}</Text>
          </Pressable>
        ))}
      </View>
      {allow.fits && <Button title={`Use ${allow.grams} g${allow.ml != null ? ` (${allow.ml} ml)` : ''} of ${adjName.toLowerCase()}`} onPress={() => onUse(adjName, allow.grams)} />}
    </View>
  )
}
