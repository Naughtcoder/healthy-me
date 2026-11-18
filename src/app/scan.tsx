// A packet's barcode, looked up on Open Food Facts (an open product database).
// Only the barcode number leaves the phone. The product and its numbers per
// 100 g are saved on the phone, so it is found by name from then on. If the
// product is not found, the numbers can be typed from the label.
import { useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import { C } from '@/theme'
import { ymd } from '@/lib/core'
import { saveCustomFood, verdictOn } from '@/lib/db'
import { handOff } from '@/lib/handoff'
import { Button, Card, Field, Label, Muted } from '@/components/ui'

type Product = { code: string; name: string; kcal: string; p: string; carb: string; fat: string; fibre: string; ingredients: string[] }
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? String(Math.round(v * 10) / 10) : '')

async function lookUp(code: string): Promise<Product> {
  const blank: Product = { code, name: '', kcal: '', p: '', carb: '', fat: '', fibre: '', ingredients: [] }
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_en,brands,nutriments,ingredients_text_en,ingredients_text`,
    { headers: { 'User-Agent': 'ATHealth/1.0 (personal diet app)' } })
  if (!r.ok) return blank
  const j = await r.json()
  if (j.status !== 1 || !j.product) return blank
  const pr = j.product, n = pr.nutriments ?? {}
  const name = [pr.brands?.split(',')[0]?.trim(), pr.product_name_en || pr.product_name].filter(Boolean).join(' ')
  const ing = String(pr.ingredients_text_en || pr.ingredients_text || '').split(/[,;]|\(|\)/).map(s => s.replace(/[_*.]/g, '').trim()).filter(s => s.length > 1)
  return { code, name, kcal: num(n['energy-kcal_100g']), p: num(n.proteins_100g), carb: num(n.carbohydrates_100g), fat: num(n.fat_100g), fibre: num(n.fiber_100g), ingredients: ing }
}

export default function Scan() {
  const { day } = useLocalSearchParams<{ day?: string }>()
  const d = day ?? ymd(new Date())
  const [perm, ask] = useCameraPermissions()
  const [busy, setBusy] = useState(false)
  const [p, setP] = useState<Product | null>(null)
  const [grams, setGrams] = useState('')
  const [error, setError] = useState('')

  const scanned = async (code: string) => {
    if (busy || p) return
    Haptics.selectionAsync(); setBusy(true); setError('')
    try { setP(await lookUp(code)) } catch { setError('No connection. Type the numbers from the label instead.'); setP({ code, name: '', kcal: '', p: '', carb: '', fat: '', fibre: '', ingredients: [] }) }
    finally { setBusy(false) }
  }
  const n = (s: string) => { const v = Number(s.replace(',', '.')); return s.trim() && isFinite(v) ? v : null }
  const ok = p && p.name.trim() && n(p.kcal) != null && n(p.p) != null
  const add = () => {
    if (!p || !ok) return
    saveCustomFood({ name: p.name.trim(), kcal: n(p.kcal)!, p: n(p.p)!, carb: n(p.carb), fat: n(p.fat), fibre: n(p.fibre), source: p.ingredients.length || p.kcal ? 'off' : 'label', code: p.code, ingredients: p.ingredients.join(', ') })
    handOff(p.name.trim(), n(grams))
    router.back()
  }

  if (!perm) return <View style={{ flex: 1, backgroundColor: C.bg }} />
  if (!perm.granted) return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 16, gap: 12 }}>
      <Muted>The camera reads the barcode. Nothing else is recorded.</Muted>
      <Button title="Allow the camera" kind="primary" onPress={ask} />
    </View>
  )
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {!p && (
        <View style={{ flex: 1 }}>
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={busy ? undefined : r => scanned(r.data)} />
          <View style={{ padding: 16, gap: 8 }}>
            {busy ? <ActivityIndicator /> : <Muted>Point the camera at the barcode on the packet.</Muted>}
          </View>
        </View>
      )}
      {p && (
        <ScrollView automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
          {error ? <Text style={{ color: C.caution }}>{error}</Text> : null}
          <Card>
            <Label>{p.name ? 'Found' : 'Not found: type it from the label'}</Label>
            <Field value={p.name} onChangeText={v => setP({ ...p, name: v })} placeholder="Product name" style={{ width: '100%' }} />
            <Muted small>Per 100 g, from the label</Muted>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Field value={p.kcal} onChangeText={v => setP({ ...p, kcal: v })} keyboardType="decimal-pad" placeholder="kcal" unit="kcal" width={70} />
              <Field value={p.p} onChangeText={v => setP({ ...p, p: v })} keyboardType="decimal-pad" placeholder="protein" unit="g protein" width={70} />
              <Field value={p.carb} onChangeText={v => setP({ ...p, carb: v })} keyboardType="decimal-pad" placeholder="carbs" unit="g carbs" width={70} />
            </View>
            <Field value={grams} onChangeText={setGrams} keyboardType="number-pad" placeholder="How much you are having" unit="g" width={180} />
          </Card>
          {p.ingredients.length > 0 && (
            <Card>
              <Label>Ingredients</Label>
              {p.ingredients.map(g => { const v = verdictOn(d, g); return <Text key={g} style={{ color: v.level === 'ok' ? C.text : C.caution, fontSize: 14 }}>{g}{v.level === 'ok' ? '' : ` · ${v.why[0]}`}</Text> })}
            </Card>
          )}
          <Button title="Add to this meal" kind="primary" disabled={!ok} onPress={add} />
          <Button title="Scan another" onPress={() => { setP(null); setGrams('') }} />
        </ScrollView>
      )}
    </View>
  )
}
