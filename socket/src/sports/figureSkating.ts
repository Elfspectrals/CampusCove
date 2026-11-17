import { pressError } from './danceGame.ts'

export type ElementKind = 'jump' | 'spin' | 'spiral'
export type FigureKey = 'jump' | 'left' | 'right' | 'hold'
export type FigureJudgement = 'perfect' | 'good' | 'miss'

export interface FigureElement {
  kind: ElementKind
  atMs: number
  lengthMs: number
}

export interface FigureRoute {
  a: { x: number, z: number }
  b: { x: number, z: number }
  radius: number
  laneOffsetsM: number[]
  lapMs: number
}

export interface FigureRules {
  song: string
  bpm: number
  countdownMs: number
  lengthMs: number
  route: FigureRoute
  elements: FigureElement[]
  windowsMs: { perfect: number, good: number }
  allowanceMs: number
  jump: { airMs: number, perfect: number, good: number, rotation: number, maxRotations: number }
  spin: { perPress: number, maxPresses: number, perfectPresses: number, goodPresses: number }
  spiral: { perfect: number, good: number }
}

export interface FigureSkater {
  accountId: number
  sessionId: string
  name: string
  lane: number
  score: number
  next: number
  air: { at: number, rotations: number } | null
  spin: { presses: number, last: 'left' | 'right' | null }
  hold: { index: number, started: FigureJudgement } | null
  judged: FigureJudgement[]
  out: boolean
}

export interface FigureRun {
  startAt: number
  skaters: FigureSkater[]
}

export type FigureEvent =
  | { type: 'judge', index: number, element: ElementKind, judgement: FigureJudgement }
  | { type: 'rotation', rotations: number }
  | { type: 'spin_press', presses: number }
  | { type: 'hold', index: number, judgement: FigureJudgement }

type Json = Record<string, unknown>

function fail(what: string): never {
  throw new Error(`skating rules: invalid figure.${what}`)
}

function num(raw: unknown, what: string, min = 0): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < min) fail(what)
  return raw
}

function point(raw: unknown, what: string): { x: number, z: number } {
  if (!Array.isArray(raw) || raw.length !== 2 || !raw.every(Number.isFinite)) fail(what)
  return { x: raw[0], z: raw[1] }
}

const ELEMENT_KINDS: readonly ElementKind[] = ['jump', 'spin', 'spiral']

export function parseFigureRules(raw: unknown): FigureRules {
  const f = raw as Json | null
  if (typeof f !== 'object' || f === null) fail('block')
  const bpm = num(f.bpm, 'bpm', 1)
  const beatMs = 60_000 / bpm
  const route = f.route as Json | undefined
  const windows = f.windowsMs as Json | undefined
  const jump = f.jump as Json | undefined
  const spin = f.spin as Json | undefined
  const spiral = f.spiral as Json | undefined
  if (typeof f.song !== 'string' || !Array.isArray(f.elements) || f.elements.length === 0 || !Array.isArray(route?.laneOffsetsM) || route.laneOffsetsM.length === 0) fail('song, elements or route')
  const rules: FigureRules = {
    song: f.song,
    bpm,
    countdownMs: num(f.countdownMs, 'countdownMs'),
    lengthMs: Math.round(num(f.lengthBeats, 'lengthBeats', 1) * beatMs),
    route: {
      a: point(route.a, 'route.a'),
      b: point(route.b, 'route.b'),
      radius: num(route.radius, 'route.radius', 1),
      laneOffsetsM: route.laneOffsetsM.map((o, i) => num(o, `route.laneOffsetsM[${i}]`, -Infinity)),
      lapMs: Math.round(num(route.lapBeats, 'route.lapBeats', 1) * beatMs)
    },
    elements: f.elements.map((e: Json, i: number) => {
      const kind = ELEMENT_KINDS.find((k) => k === e?.kind) ?? fail(`elements[${i}].kind`)
      return { kind, atMs: Math.round(num(e.beat, `elements[${i}].beat`) * beatMs), lengthMs: kind === 'jump' ? 0 : Math.round(num(e.beats, `elements[${i}].beats`, 1) * beatMs) }
    }),
    windowsMs: { perfect: num(windows?.perfect, 'windowsMs.perfect'), good: num(windows?.good, 'windowsMs.good') },
    allowanceMs: num(f.allowanceMs, 'allowanceMs'),
    jump: { airMs: num(jump?.airMs, 'jump.airMs', 1), perfect: num(jump?.perfect, 'jump.perfect'), good: num(jump?.good, 'jump.good'), rotation: num(jump?.rotation, 'jump.rotation'), maxRotations: num(jump?.maxRotations, 'jump.maxRotations') },
    spin: { perPress: num(spin?.perPress, 'spin.perPress'), maxPresses: num(spin?.maxPresses, 'spin.maxPresses', 1), perfectPresses: num(spin?.perfectPresses, 'spin.perfectPresses', 1), goodPresses: num(spin?.goodPresses, 'spin.goodPresses', 1) },
    spiral: { perfect: num(spiral?.perfect, 'spiral.perfect'), good: num(spiral?.good, 'spiral.good') }
  }
  if (rules.windowsMs.perfect > rules.windowsMs.good) fail('windowsMs (perfect wider than good)')
  if (rules.route.laneOffsetsM.some((o) => rules.route.radius + o < 1)) fail('route.laneOffsetsM (a lane with no radius)')
  const reach = rules.windowsMs.good + rules.allowanceMs
  rules.elements.forEach((e, i) => {
    const before = rules.elements[i - 1]
    const end = (el: FigureElement) => el.atMs + Math.max(el.lengthMs, el.kind === 'jump' ? rules.jump.airMs : 0)
    if (before && e.atMs - rules.windowsMs.good <= end(before) + reach) fail(`elements[${i}] (overlaps the one before)`)
    if (end(e) + reach > rules.lengthMs) fail(`elements[${i}] (ends after the routine)`)
  })
  return rules
}

export function laneRadius(route: FigureRoute, lane: number): number {
  return route.radius + route.laneOffsetsM[lane]
}

export function figurePosition(route: FigureRoute, lane: number, routineMs: number): { x: number, z: number, ry: number } {
  const r = laneRadius(route, lane)
  const straight = Math.hypot(route.b.x - route.a.x, route.b.z - route.a.z)
  const bend = Math.PI * r
  const lap = 2 * straight + 2 * bend
  const fraction = ((Math.max(0, routineMs) / route.lapMs) % 1 + 1) % 1
  const s = fraction * lap
  const yaw = (dx: number, dz: number) => Math.atan2(-dx, -dz)
  if (s < straight) return { x: route.a.x + s, z: route.a.z + r, ry: yaw(1, 0) }
  if (s < straight + bend) {
    const t = (s - straight) / r
    return { x: route.b.x + r * Math.sin(t), z: route.b.z + r * Math.cos(t), ry: yaw(Math.cos(t), -Math.sin(t)) }
  }
  if (s < 2 * straight + bend) return { x: route.b.x - (s - straight - bend), z: route.b.z - r, ry: yaw(-1, 0) }
  const t = (s - 2 * straight - bend) / r
  return { x: route.a.x - r * Math.sin(t), z: route.a.z - r * Math.cos(t), ry: yaw(-Math.cos(t), Math.sin(t)) }
}

export function newFigureRun(entrants: { accountId: number, sessionId: string, name: string }[], startAt: number): FigureRun {
  return {
    startAt,
    skaters: entrants.map((e, lane) => ({ ...e, lane, score: 0, next: 0, air: null, spin: { presses: 0, last: null }, hold: null, judged: [], out: false }))
  }
}

function judgementOf(error: number, rules: FigureRules): FigureJudgement {
  return error <= rules.windowsMs.perfect ? 'perfect' : error <= rules.windowsMs.good ? 'good' : 'miss'
}

function finish(skater: FigureSkater, judgement: FigureJudgement, element: ElementKind): FigureEvent {
  const index = skater.next
  skater.judged[index] = judgement
  skater.next += 1
  skater.hold = null
  skater.spin = { presses: 0, last: null }
  return { type: 'judge', index, element, judgement }
}

export function pressFigure(run: FigureRun, skater: FigureSkater, key: FigureKey, now: number, rules: FigureRules): FigureEvent | null {
  const t = now - run.startAt
  if (skater.out || t < 0 || t >= rules.lengthMs) return null
  const element = rules.elements[skater.next] as FigureElement | undefined
  if (key === 'left' || key === 'right') {
    if (skater.air && t - skater.air.at <= rules.jump.airMs) {
      if (skater.air.rotations >= rules.jump.maxRotations) return null
      skater.air.rotations += 1
      skater.score += rules.jump.rotation
      return { type: 'rotation', rotations: skater.air.rotations }
    }
    if (element?.kind !== 'spin' || t < element.atMs - rules.windowsMs.good || skater.spin.last === key || skater.spin.presses >= rules.spin.maxPresses) return null
    skater.spin = { presses: skater.spin.presses + 1, last: key }
    skater.score += rules.spin.perPress
    return { type: 'spin_press', presses: skater.spin.presses }
  }
  if (!element) return null
  const judgement = judgementOf(pressError(element.atMs, t, rules.allowanceMs), rules)
  if (judgement === 'miss') return null
  if (key === 'jump' && element.kind === 'jump') {
    skater.score += rules.jump[judgement]
    skater.air = { at: t, rotations: 0 }
    return finish(skater, judgement, 'jump')
  }
  if (key === 'hold' && element.kind === 'spiral' && !skater.hold) {
    skater.score += rules.spiral[judgement]
    skater.hold = { index: skater.next, started: judgement }
    return { type: 'hold', index: skater.next, judgement }
  }
  return null
}

export function releaseFigure(run: FigureRun, skater: FigureSkater, now: number, rules: FigureRules): FigureEvent | null {
  const hold = skater.hold
  if (skater.out || !hold) return null
  const element = rules.elements[hold.index]
  const ended = judgementOf(pressError(element.atMs + element.lengthMs, now - run.startAt, rules.allowanceMs), rules)
  if (ended !== 'miss') skater.score += rules.spiral[ended]
  return finish(skater, ended === 'perfect' && hold.started === 'perfect' ? 'perfect' : 'good', 'spiral')
}

function expire(skater: FigureSkater, t: number, rules: FigureRules): FigureEvent | null {
  const element = rules.elements[skater.next] as FigureElement | undefined
  if (!element) return null
  const late = rules.allowanceMs + rules.windowsMs.good
  if (element.kind === 'spin') {
    if (t < element.atMs + element.lengthMs) return null
    const presses = skater.spin.presses
    return finish(skater, presses >= rules.spin.perfectPresses ? 'perfect' : presses >= rules.spin.goodPresses ? 'good' : 'miss', 'spin')
  }
  if (element.kind === 'spiral' && skater.hold) return t > element.atMs + element.lengthMs + late ? finish(skater, 'good', 'spiral') : null
  return t > element.atMs + late ? finish(skater, 'miss', element.kind) : null
}

export function advanceFigure(run: FigureRun, now: number, rules: FigureRules): { skater: FigureSkater, event: FigureEvent }[] {
  const t = now - run.startAt
  const events: { skater: FigureSkater, event: FigureEvent }[] = []
  for (const skater of run.skaters) {
    if (skater.out) continue
    if (skater.air && t - skater.air.at > rules.jump.airMs) skater.air = null
    for (let event = expire(skater, t, rules); event; event = expire(skater, t, rules)) events.push({ skater, event })
  }
  return events
}

export function figureOver(run: FigureRun, now: number, rules: FigureRules): boolean {
  return now - run.startAt >= rules.lengthMs || run.skaters.every((s) => s.out)
}

export function figurePlaces(run: FigureRun): Map<number, number> {
  const ranked = run.skaters.filter((s) => !s.out).sort((a, b) => b.score - a.score)
  const places = new Map<number, number>()
  ranked.forEach((s, i) => {
    const before = ranked[i - 1]
    places.set(s.accountId, before && before.score === s.score ? (places.get(before.accountId) as number) : i + 1)
  })
  return places
}
