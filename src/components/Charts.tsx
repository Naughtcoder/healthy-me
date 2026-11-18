// Drawings, all in the Rings icon's language: faceted strokes, no curves.
// Skia draws them natively, so they stay sharp and cheap to redraw.
import { Canvas, Path, Skia, Line, vec, Rect } from '@shopify/react-native-skia'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { C } from '@/theme'

export const RING = { meals: '#E8A47E', meds: '#2E6E80', water: '#E9F1F4', move: '#9CC0CA' }

/** A faceted arc: an 18-sided polygon walked from the top, clockwise, for `frac` of a turn. */
function facetPath(cx: number, cy: number, r: number, frac: number, sides = 18) {
  const p = Skia.Path.Make()
  const steps = Math.max(1, Math.ceil(sides * Math.min(frac, 1)))
  for (let i = 0; i <= steps; i++) {
    const t = Math.min(i / sides, frac) * 2 * Math.PI - Math.PI / 2
    const x = cx + r * Math.cos(t), y = cy + r * Math.sin(t)
    i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)
  }
  return p
}

/** Concentric rings, outermost first, each 0 to 1. The same shape as the app icon. */
export function Rings({ size, rings, track = C.raised }: { size: number; rings: { value: number; color: string }[]; track?: string }) {
  const w = size * 0.1, gap = size * 0.03
  const c = size / 2
  return (
    <Canvas style={{ width: size, height: size }}>
      {rings.map((r, i) => {
        const rad = c - w / 2 - i * (w + gap)
        return [
          <Path key={`t${i}`} path={facetPath(c, c, rad, 1)} style="stroke" strokeWidth={w} color={track} strokeJoin="miter" />,
          r.value > 0 && <Path key={`v${i}`} path={facetPath(c, c, rad, Math.max(0.02, r.value))} style="stroke" strokeWidth={w} color={r.color} strokeJoin="miter" strokeCap="butt" />,
        ]
      })}
    </Canvas>
  )
}

type Pt = { label: string; value: number | null }

/** A line through the days that have a value; gaps stay gaps. */
export function LineChart({ points, height = 120, color = RING.meals, unit = '' }: { points: Pt[]; height?: number; color?: string; unit?: string }) {
  const vals = points.map(p => p.value).filter((v): v is number => v !== null)
  if (vals.length === 0) return <Empty />
  const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.15 || 1
  const min = lo - pad, max = hi + pad
  return (
    <View style={{ gap: 4 }}>
      <Measured height={height}>{w => {
        const x = (i: number) => points.length === 1 ? w / 2 : 8 + (i * (w - 16)) / (points.length - 1)
        const y = (v: number) => 8 + (height - 16) * (1 - (v - min) / (max - min))
        const path = Skia.Path.Make()
        let open = false
        points.forEach((p, i) => {
          if (p.value === null) { open = false; return }
          open ? path.lineTo(x(i), y(p.value)) : path.moveTo(x(i), y(p.value)); open = true
        })
        return (
          <Canvas style={{ width: w, height }}>
            {[0.25, 0.5, 0.75].map(f => <Line key={f} p1={vec(0, height * f)} p2={vec(w, height * f)} color={C.line} strokeWidth={1} />)}
            <Path path={path} style="stroke" strokeWidth={3} color={color} strokeJoin="miter" />
            {points.map((p, i) => p.value === null ? null :
              <Rect key={i} x={x(i) - 3.5} y={y(p.value) - 3.5} width={7} height={7} color={i === points.length - 1 || points.slice(i + 1).every(q => q.value === null) ? color : C.card} />)}
          </Canvas>
        )
      }}</Measured>
      <Axis points={points} />
      <Text style={{ color: C.text3, fontSize: 12, fontVariant: ['tabular-nums'] }}>{lo.toFixed(1)} to {hi.toFixed(1)}{unit}</Text>
    </View>
  )
}

/** Bars per day against a target line. */
export function BarChart({ points, height = 110, color = RING.move, target }: { points: Pt[]; height?: number; color?: string; target?: number }) {
  const vals = points.map(p => p.value ?? 0)
  const max = Math.max(...vals, target ?? 0, 1)
  if (vals.every(v => v === 0)) return <Empty />
  return (
    <View style={{ gap: 4 }}>
      <Measured height={height}>{w => {
        const bw = (w - 8) / points.length
        return (
          <Canvas style={{ width: w, height }}>
            {points.map((p, i) => {
              const h = ((p.value ?? 0) / max) * (height - 4)
              return <Rect key={i} x={4 + i * bw + bw * 0.18} y={height - h} width={bw * 0.64} height={h} color={color} />
            })}
            {target ? <Line p1={vec(0, height - (target / max) * (height - 4))} p2={vec(w, height - (target / max) * (height - 4))} color={C.text3} strokeWidth={1} /> : null}
          </Canvas>
        )
      }}</Measured>
      <Axis points={points} />
    </View>
  )
}

export type SleepSeg = { stage: 'awake' | 'rem' | 'core' | 'deep' | 'asleep'; start: number; end: number }
const LANES: SleepSeg['stage'][] = ['awake', 'rem', 'core', 'deep']
const LANE_NAME = { awake: 'Awake', rem: 'Dream', core: 'Light', deep: 'Deep', asleep: 'Asleep' }
const LANE_COLOR = { awake: '#E8A47E', rem: '#9CC0CA', core: '#2E6E80', deep: '#1B4A57', asleep: '#2E6E80' }

/** Last night as four lanes, like the Health app: awake, dream, light, deep. */
export function SleepChart({ segs }: { segs: SleepSeg[] }) {
  if (!segs.length) return null
  const t0 = Math.min(...segs.map(s => s.start)), t1 = Math.max(...segs.map(s => s.end))
  const lanes = segs.some(s => s.stage !== 'asleep' && s.stage !== 'awake') ? LANES : ['awake', 'asleep'] as SleepSeg['stage'][]
  const laneH = 18, h = lanes.length * laneH
  const fmt = (t: number) => new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ width: 44 }}>{lanes.map(l => <Text key={l} style={{ height: laneH, color: C.text3, fontSize: 11, lineHeight: laneH }}>{LANE_NAME[l]}</Text>)}</View>
        <View style={{ flex: 1 }}>
          <Measured height={h}>{w => (
            <Canvas style={{ width: w, height: h }}>
              {lanes.map((l, i) => <Line key={l} p1={vec(0, i * laneH + laneH / 2)} p2={vec(w, i * laneH + laneH / 2)} color={C.line} strokeWidth={1} />)}
              {segs.map((s, i) => {
                const lane = lanes.indexOf(s.stage)
                if (lane < 0) return null
                const x = ((s.start - t0) / (t1 - t0)) * w, x2 = ((s.end - t0) / (t1 - t0)) * w
                return <Rect key={i} x={x} y={lane * laneH + 3} width={Math.max(1.5, x2 - x)} height={laneH - 6} color={LANE_COLOR[s.stage]} />
              })}
            </Canvas>
          )}</Measured>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 52 }}>
        <Text style={{ color: C.text3, fontSize: 12 }}>{fmt(t0)}</Text>
        <Text style={{ color: C.text3, fontSize: 12 }}>{fmt(t1)}</Text>
      </View>
    </View>
  )
}

function Axis({ points }: { points: Pt[] }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {points.map((p, i) => <Text key={i} style={{ color: C.text3, fontSize: 11, flex: 1, textAlign: 'center' }}>{p.label}</Text>)}
    </View>
  )
}
const Empty = () => <Text style={{ color: C.text3, fontSize: 13 }}>Nothing recorded yet.</Text>

/** Gives a drawing its width once the layout knows it. */
function Measured({ height, children }: { height: number; children: (w: number) => React.ReactNode }) {
  const [w, setW] = useState(0)
  return <View style={{ height }} onLayout={e => setW(Math.floor(e.nativeEvent.layout.width))}>{w > 0 ? children(w) : null}</View>
}
