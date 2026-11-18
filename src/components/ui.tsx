import { SymbolView } from 'expo-symbols'
import { Pressable, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native'
import { C } from '@/theme'

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ backgroundColor: C.card, borderRadius: 18, padding: 14, gap: 10 }, style]}>{children}</View>
}

export const Label = ({ children }: { children: React.ReactNode }) =>
  <Text style={{ color: C.text2, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>{children}</Text>

export const Muted = ({ children, small }: { children: React.ReactNode; small?: boolean }) =>
  <Text style={{ color: C.text2, fontSize: small ? 13 : 15, lineHeight: small ? 18 : 21 }}>{children}</Text>

/** A thin bar for how far along something is, with an optional marker (the 6 pm carb line). */
export function Bar({ value, marker, tint = C.positive }: { value: number; marker?: number; tint?: string }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: C.raised, overflow: 'hidden' }}>
      <View style={{ width: `${v * 100}%`, height: '100%', backgroundColor: tint, borderRadius: 4 }} />
      {marker !== undefined && <View style={{ position: 'absolute', left: `${marker * 100}%`, top: 0, bottom: 0, width: 2, backgroundColor: C.caution }} />}
    </View>
  )
}

/** The round tick at the start of a timeline row. */
export function Tick({ state }: { state: 'open' | 'done' | 'skipped' }) {
  const bg = state === 'done' ? C.positive : state === 'skipped' ? C.raised : 'transparent'
  return (
    <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: state === 'open' ? 2 : 0, borderColor: C.text3, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      {state === 'done' && <SymbolView name="checkmark" tintColor="#FFFFFF" size={13} weight="bold" />}
      {state === 'skipped' && <SymbolView name="minus" tintColor={C.text2} size={13} weight="bold" />}
    </View>
  )
}

export function Button({ title, onPress, kind = 'plain', disabled }: { title: string; onPress: () => void; kind?: 'primary' | 'plain' | 'danger'; disabled?: boolean }) {
  const bg = kind === 'primary' ? C.accent : C.raised
  const fg = kind === 'primary' ? C.accentText : kind === 'danger' ? C.negative : C.text
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}>
      <Text style={{ color: fg, fontWeight: '600', fontSize: 16 }}>{title}</Text>
    </Pressable>
  )
}

/** A small round chip, for quick amounts (+250 ml). */
export function Chip({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => ({ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: pressed ? C.line : C.raised })}>
      <Text style={{ color: C.text, fontWeight: '600', fontSize: 15, fontVariant: ['tabular-nums'] }}>{title}</Text>
    </Pressable>
  )
}

export function Field(props: TextInputProps & { unit?: string; width?: number }) {
  const { unit, width, style, ...rest } = props
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <TextInput placeholderTextColor={C.text3} {...rest}
        style={[{ width, minWidth: 64, minHeight: 40, paddingHorizontal: 10, borderRadius: 10, backgroundColor: C.raised, color: C.text, fontSize: 16, fontVariant: ['tabular-nums'] }, style]} />
      {unit ? <Text style={{ color: C.text2, fontSize: 15 }}>{unit}</Text> : null}
    </View>
  )
}

export const Screen = ({ children }: { children: React.ReactNode }) =>
  <View style={{ flex: 1, backgroundColor: C.bg }}>{children}</View>

/** The round X that closes any sheet. */
export function CloseX({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close"
      style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.raised, opacity: pressed ? 0.6 : 1 })}>
      <SymbolView name="xmark" tintColor={C.text2} size={14} weight="bold" />
    </Pressable>
  )
}
