import { computed, onBeforeUnmount, ref, shallowRef, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { matches } from '../../config/keybindings'
import { EYE_HEIGHT } from '../../game/gameRoomConstants'
import type { SportsView } from '../../game/camera/sportsCamera'
import { type DanceMusic, startDanceMusic } from '../../game/sports/danceMusic'
import {
  type ElementKind,
  type FigureEndPayload,
  type FigureEventPayload,
  type FigureJudgement,
  type FigurePose,
  type FigureRules,
  type FigureStartPayload,
  type FigureStatePayload,
  figureKeyFor,
  figurePose,
  figurePosition,
  figurePrompt,
  parseFigureRules,
} from '../../game/sports/skating/figure'
import { sportRulesUrl } from '../../game/sports/sportsSignup'

const RESULT_SHOWN_MS = 8000
const JUDGEMENT_SHOWN_MS = 1100
const ROUTE_POINTS = 96
const ROUTE_Y = 0.03
const MARK_Y = 0.04
const MARK_RADIUS_M = 0.7
const MARK_COLOURS: Record<ElementKind, number> = { jump: 0xffd34d, spin: 0x38c6f4, spiral: 0x5fd068 }
const ROUTE_COLOUR = 0xffffff
const CAMERA_DISTANCE_M = 6
const CAMERA_LIFT_M = 1.4
const LOOK_PITCH = -0.22
const TURNS_SHOWN_MS = 1500

export interface FigureSkatingDeps {
  gameRoomRef: ShallowRef<Room | null>
  myPosition: { x: number; y: number; z: number }
  mySessionId: () => string | null
  getScene: () => THREE.Scene | undefined
  setLook: (yaw: number, pitch: number) => void
  setFigurePose: (sessionId: string, pose: FigurePose | null) => void
}

export function useFigureSkating(deps: FigureSkatingDeps) {
  const rules = shallowRef<FigureRules | null>(null)
  const start = shallowRef<FigureStartPayload | null>(null)
  const state = shallowRef<FigureStatePayload | null>(null)
  const result = shallowRef<FigureEndPayload | null>(null)
  const judged = shallowRef<{ element: ElementKind; judgement: FigureJudgement; at: number; key: number } | null>(null)
  const turns = ref(0)
  let turnsAt = 0
  const spinPresses = ref(0)
  const now = ref(Date.now())
  let clockOffset = 0
  let holding = false
  let music: DanceMusic | null = null
  let visuals: THREE.Group | null = null
  let resultTimer: ReturnType<typeof setTimeout> | null = null

  fetch(sportRulesUrl('figure_skating'))
    .then((res) => {
      if (!res.ok) throw new Error(`${res.url} answered ${res.status}`)
      return res.json()
    })
    .then((raw: unknown) => {
      rules.value = parseFigureRules(raw)
    })
    .catch((error: unknown) => console.error('[figure skating] rules not loaded', error))

  const myLane = computed(() => start.value?.skaters.find((s) => s.sessionId === deps.mySessionId())?.lane ?? null)
  const active = computed(() => myLane.value !== null)
  const routineMs = computed(() => (start.value ? now.value + clockOffset - start.value.startAt : 0))
  const mine = computed(() => state.value?.skaters.find((s) => s.sessionId === deps.mySessionId()) ?? null)

  function send(type: string, payload: object = {}): void {
    deps.gameRoomRef.value?.send(type, payload)
  }

  function onKeyDown(e: KeyboardEvent): boolean {
    if (!active.value) return false
    const key = figureKeyFor(e.code, matches)
    if (!key) return false
    if (e.repeat) return true
    if (key === 'hold') holding = true
    send('figure_press', { key })
    return true
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (!holding || figureKeyFor(e.code, matches) !== 'hold') return
    holding = false
    send('figure_release')
  }

  function clearVisuals(): void {
    if (!visuals) return
    visuals.removeFromParent()
    visuals.traverse((object) => {
      const mesh = object as THREE.Mesh
      mesh.geometry?.dispose()
      const material = mesh.material as THREE.Material | undefined
      material?.dispose()
    })
    visuals = null
  }

  function drawRoute(r: FigureRules, lane: number, iceY: number): void {
    clearVisuals()
    const scene = deps.getScene()
    if (!scene) return
    visuals = new THREE.Group()
    const points = Array.from({ length: ROUTE_POINTS }, (_, i) => {
      const p = figurePosition(r.route, lane, (i / ROUTE_POINTS) * r.route.lapMs)
      return new THREE.Vector3(p.x, iceY + ROUTE_Y, p.z)
    })
    visuals.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: ROUTE_COLOUR, transparent: true, opacity: 0.55 })))
    r.elements.forEach((element, index) => {
      const p = figurePosition(r.route, lane, element.atMs)
      const mark = new THREE.Mesh(
        new THREE.CircleGeometry(MARK_RADIUS_M, 24).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: MARK_COLOURS[element.kind], transparent: true, opacity: 0.75, depthWrite: false }),
      )
      mark.position.set(p.x, iceY + MARK_Y, p.z)
      mark.name = `figure_mark_${index}`
      visuals?.add(mark)
    })
    scene.add(visuals)
  }

  function stopAll(): void {
    for (const skater of start.value?.skaters ?? []) deps.setFigurePose(skater.sessionId, null)
    music?.stop()
    music = null
    clearVisuals()
    holding = false
    start.value = null
    state.value = null
    judged.value = null
  }

  function tick(): void {
    if (!start.value && !result.value) return
    now.value = Date.now()
    const r = rules.value
    const run = start.value
    if (!r || !run) return
    const t = Math.max(0, routineMs.value)
    for (const skater of run.skaters) {
      const live = state.value?.skaters.find((s) => s.sessionId === skater.sessionId)
      deps.setFigurePose(skater.sessionId, live && !live.out ? figurePose(r, live, t) : null)
    }
    const lane = myLane.value
    if (lane === null) return
    const spot = figurePosition(r.route, lane, t)
    deps.myPosition.x = spot.x
    deps.myPosition.z = spot.z
    deps.setLook(spot.ry, LOOK_PITCH)
    const next = mine.value?.next ?? 0
    visuals?.children.forEach((child) => {
      if (child.name.startsWith('figure_mark_')) child.visible = Number(child.name.slice('figure_mark_'.length)) >= next
    })
  }

  const hud = computed(() => {
    const r = rules.value
    const run = start.value
    if (!r || !run || !active.value) return null
    const t = routineMs.value
    const shown = judged.value && now.value - judged.value.at < JUDGEMENT_SHOWN_MS ? judged.value : null
    return {
      countdown: t < 0 ? Math.ceil(-t / 1000) : null,
      secondsLeft: Math.max(0, Math.ceil((r.lengthMs - Math.max(0, t)) / 1000)),
      score: mine.value?.score ?? 0,
      prompt: t < 0 ? null : figurePrompt(r, mine.value?.next ?? 0, t),
      holding: mine.value?.holding ?? false,
      turns: now.value - turnsAt < TURNS_SHOWN_MS ? turns.value : 0,
      spinPresses: spinPresses.value,
      spinGoal: r.spinPresses,
      judged: shown,
      others: run.skaters
        .filter((s) => s.sessionId !== deps.mySessionId())
        .map((s) => ({ sessionId: s.sessionId, name: s.name, score: state.value?.skaters.find((v) => v.sessionId === s.sessionId)?.score ?? 0 })),
    }
  })

  const board = computed(() => (result.value ? [...result.value.results].sort((a, b) => (a.place ?? 99) - (b.place ?? 99)) : null))

  function cameraView(): SportsView | null {
    return active.value ? { kind: 'follow', sport: 'figure_skating', optional: false, distance: CAMERA_DISTANCE_M, lift: CAMERA_LIFT_M, waterY: null } : null
  }

  const handlers = {
    onStart(data: FigureStartPayload): void {
      stopAll()
      if (resultTimer) clearTimeout(resultTimer)
      result.value = null
      clockOffset = data.serverNow - Date.now()
      now.value = Date.now()
      start.value = data
      turns.value = 0
      spinPresses.value = 0
      const r = rules.value
      const lane = data.skaters.find((s) => s.sessionId === deps.mySessionId())?.lane
      if (!r || lane === undefined) return
      drawRoute(r, lane, deps.myPosition.y - EYE_HEIGHT)
      music = startDanceMusic(r.song, r.bpm, r.lengthMs, Math.max(0, data.startAt - data.serverNow))
    },
    onState(data: FigureStatePayload): void {
      if (start.value?.venue === data.venue) state.value = data
    },
    onEvent(data: FigureEventPayload): void {
      if (data.sessionId !== deps.mySessionId()) return
      if (data.type === 'rotation') {
        turns.value = data.rotations
        turnsAt = Date.now()
      }
      else if (data.type === 'spin_press') spinPresses.value = data.presses
      else if (data.type === 'hold') music?.hit(data.judgement)
      else {
        judged.value = { element: data.element, judgement: data.judgement, at: Date.now(), key: (judged.value?.key ?? 0) + 1 }
        music?.hit(data.judgement)
        if (data.element === 'jump') turns.value = 0
        if (data.element === 'spin') spinPresses.value = 0
      }
    },
    onEnd(data: FigureEndPayload): void {
      const mineToo = active.value
      stopAll()
      if (!mineToo) return
      result.value = data
      if (resultTimer) clearTimeout(resultTimer)
      resultTimer = setTimeout(() => (result.value = null), RESULT_SHOWN_MS)
    },
    onRoomJoined(): void {
      stopAll()
      result.value = null
    },
  }

  window.addEventListener('keyup', onKeyUp)
  onBeforeUnmount(() => {
    window.removeEventListener('keyup', onKeyUp)
    stopAll()
    if (resultTimer) clearTimeout(resultTimer)
  })

  return { active, hud, board, handlers, onKeyDown, tick, cameraView }
}
