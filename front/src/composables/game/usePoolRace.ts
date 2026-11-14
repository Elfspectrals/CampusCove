import { computed, ref, shallowRef, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import type * as THREE from 'three'
import { matches } from '../../config/keybindings'
import { EYE_HEIGHT } from '../../game/gameRoomConstants'
import {
  RESULTS_SHOWN_MS,
  approach,
  boardEdgeAt,
  cadenceMeter,
  formatRaceTime,
  mySwimmer,
  parsePoolRules,
  racingPhase,
  splashScale,
  swimmingAt,
  trickForKey,
  type PoolDive,
  type PoolRaceResult,
  type PoolRaceStart,
  type PoolRaceState,
  type PoolRules,
  type StrokeResult,
  type Trick,
} from '../../game/sports/pool/poolRace'
import { playFalseStart, playFinish, playMarksCall, playSplash, playStartBeep, playStroke } from '../../game/sports/pool/poolSounds'
import { createPoolSplashes } from '../../game/sports/pool/poolSplash'
import { sportRulesUrl } from '../../game/sports/sportsSignup'

const SWIM_GLIDE_MPS = 4
const TOAST_GAP_MS = 3000
const TRICK_SHOWN_MS = 3000
const FALL_MARGIN_MS = 400
const TRICK_CLIPS = { twist: 'Twist', somersault: 'Somersault', cannonball: 'Cannonball' } as const

export interface PoolRaceDeps {
  gameRoomRef: ShallowRef<Room | null>
  myPosition: { x: number; y: number; z: number }
  mySessionId: () => string | null
  getScene: () => THREE.Scene | undefined
  remotePlayers: () => readonly { sessionId: string }[]
  remotePosition: (sessionId: string) => THREE.Vector3 | null
  setRemoteSwimwear: (sessionId: string, on: boolean) => void
  playRemoteClip: (sessionId: string, clip: 'Dive' | 'Somersault' | 'Twist' | 'Cannonball') => void
  say: (text: string) => void
  noSwimsuitText: () => string
  boardTakenText: () => string
  falseStartText: () => string
  marksText: () => string
  trickText: (name: string, trick: Trick) => string
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return response.json()
}

export function usePoolRace(deps: PoolRaceDeps) {
  const rules = shallowRef<PoolRules | null>(null)
  const start = shallowRef<PoolRaceStart | null>(null)
  const state = shallowRef<PoolRaceState | null>(null)
  const result = shallowRef<PoolRaceResult | null>(null)
  const lastStroke = shallowRef<{ at: number; result: StrokeResult } | null>(null)
  const lastTrick = shallowRef<{ at: number; text: string } | null>(null)
  const now = ref(performance.now())
  let resultUntil = 0
  let lastToastAt = -Infinity
  let jump: { at: number; airMs: number } | null = null
  const pendingTricks = new Map<string, Trick>()
  const splashes = createPoolSplashes(deps.getScene)

  Promise.all([fetchJson(sportRulesUrl('swimming')), fetchJson(sportRulesUrl('diving'))])
    .then(([swimming, diving]) => {
      rules.value = parsePoolRules(swimming, diving)
    })
    .catch((err: unknown) => console.error('[pool] rules failed to load', err))

  const me = computed(() => mySwimmer(state.value, deps.mySessionId()))
  const myLane = computed(() => start.value?.lanes.find((l) => l.sessionId === deps.mySessionId()) ?? null)
  const locked = computed(() => myLane.value !== null && (me.value === null || racingPhase(me.value.phase)))

  function send(type: string, payload: object): void {
    deps.gameRoomRef.value?.send(type, payload)
  }

  function onKeyDown(e: KeyboardEvent): boolean {
    if (e.repeat) return false
    if (locked.value) {
      if (matches('jump', e.code)) {
        send('pool_dive', {})
        return true
      }
      const side = matches('moveLeft', e.code) ? 'left' : matches('moveRight', e.code) ? 'right' : null
      if (!side) return false
      send('pool_stroke', { side })
      return true
    }
    const pool = rules.value
    if (!pool) return false
    const { x, y, z } = deps.myPosition
    if (matches('jump', e.code)) {
      const board = boardEdgeAt(pool, x, z, y - EYE_HEIGHT)
      if (board) {
        send('pool_jump', { board: board.id })
        jump = { at: performance.now(), airMs: Math.sqrt((2 * board.heightM) / 9.8) * 1000 + FALL_MARGIN_MS }
      }
      return false
    }
    const trick = trickForKey(e.code, matches)
    if (!trick || !jump || performance.now() - jump.at > jump.airMs) return false
    send('pool_trick', { trick })
    jump = null
    return true
  }

  function dressSwimmers(pool: PoolRules): void {
    for (const { sessionId } of deps.remotePlayers()) {
      const p = deps.remotePosition(sessionId)
      if (p) deps.setRemoteSwimwear(sessionId, swimmingAt(pool, p.x, p.y, p.z))
    }
  }

  function tick(dt: number): void {
    splashes.tick(dt)
    if (rules.value) dressSwimmers(rules.value)
    if (start.value || result.value || lastTrick.value) now.value = performance.now()
    if (result.value && now.value > resultUntil) result.value = null
    if (lastTrick.value && now.value - lastTrick.value.at > TRICK_SHOWN_MS) lastTrick.value = null
    const swimmer = me.value
    const pool = rules.value
    if (!swimmer || swimmer.phase !== 'swimming' || !pool) return
    const step = SWIM_GLIDE_MPS * dt
    deps.myPosition.x = approach(deps.myPosition.x, swimmer.x, step)
    deps.myPosition.z = approach(deps.myPosition.z, swimmer.z, step)
    deps.myPosition.y = pool.wadeY + EYE_HEIGHT
  }

  const hud = computed(() => {
    const lane = myLane.value
    const pool = rules.value
    if (!lane || !pool || !start.value) return null
    const swimmer = me.value
    const since = lastStroke.value && swimmer?.phase === 'swimming' ? now.value - lastStroke.value.at : null
    return {
      lane: lane.lane,
      length: swimmer?.length ?? 1,
      lengths: start.value.distanceM / start.value.lengthM,
      distanceM: start.value.distanceM,
      clock: formatRaceTime(state.value?.clockMs ?? null),
      phase: swimmer?.phase ?? 'marks',
      reaction: swimmer?.reactionMs === null || swimmer?.reactionMs === undefined ? null : formatRaceTime(swimmer.reactionMs),
      time: formatRaceTime(swimmer?.timeMs ?? null),
      stroke: lastStroke.value?.result ?? null,
      cadence: cadenceMeter(since, pool.stroke),
    }
  })

  const board = computed(() => {
    if (result.value) {
      return {
        distanceM: result.value.distanceM,
        rows: [...result.value.results]
          .sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || a.lane - b.lane)
          .map((r) => ({ sessionId: r.sessionId, lane: r.lane, name: r.name, place: r.place, status: r.status, time: formatRaceTime(r.timeMs), percent: 100 })),
        done: true,
      }
    }
    if (!start.value) return null
    const distanceM = start.value.distanceM
    return {
      distanceM,
      rows: start.value.lanes.map((l) => {
        const s = state.value?.swimmers.find((v) => v.sessionId === l.sessionId)
        return { sessionId: l.sessionId, lane: l.lane, name: l.name, place: null, status: s?.phase ?? 'marks', time: formatRaceTime(s?.timeMs ?? null), percent: Math.round(((s?.distanceM ?? 0) / distanceM) * 100) }
      }),
      done: false,
    }
  })

  const trickLine = computed(() => lastTrick.value?.text ?? null)

  function inMyRace(): boolean {
    return myLane.value !== null
  }

  const handlers = {
    onStart(data: PoolRaceStart) {
      start.value = data
      state.value = null
      result.value = null
      lastStroke.value = null
      if (!inMyRace()) return
      playMarksCall()
      deps.say(deps.marksText())
    },
    onBeep() {
      playStartBeep()
    },
    onState(data: PoolRaceState) {
      if (start.value?.venue !== data.venue) return
      for (const s of data.swimmers) {
        const before = state.value?.swimmers.find((v) => v.sessionId === s.sessionId)
        if (before?.phase === 'marks' && s.phase === 'swimming' && s.sessionId !== deps.mySessionId()) deps.playRemoteClip(s.sessionId, 'Dive')
      }
      state.value = data
    },
    onStrokeResult(data: { result: StrokeResult }) {
      lastStroke.value = { at: performance.now(), result: data.result }
      if (data.result === 'false_start') {
        playFalseStart()
        deps.say(deps.falseStartText())
      } else if (data.result === 'started') {
        playSplash(splashScale(0.5, null))
      } else {
        playStroke(data.result === 'good')
      }
    },
    onResult(data: PoolRaceResult) {
      const mine = inMyRace()
      start.value = null
      state.value = null
      result.value = data
      now.value = performance.now()
      resultUntil = now.value + RESULTS_SHOWN_MS
      if (mine) playFinish()
    },
    onDive(data: PoolDive) {
      const board = rules.value?.boards.find((b) => b.id === data.board)
      if (!board || !rules.value) return
      const fallMs = Math.max(0, data.airMs - FALL_MARGIN_MS)
      const e = board.edgeZone
      const waterY = rules.value.waterY
      pendingTricks.delete(data.sessionId)
      window.setTimeout(() => {
        const scale = splashScale(data.heightM, pendingTricks.get(data.sessionId) ?? null)
        pendingTricks.delete(data.sessionId)
        playSplash(scale)
        splashes.spawn((e.minX + e.maxX) / 2, waterY, e.minZ - 0.5, scale)
      }, fallMs)
    },
    onTrick(data: { sessionId: string; name: string; trick: Trick }) {
      pendingTricks.set(data.sessionId, data.trick)
      if (data.sessionId !== deps.mySessionId()) deps.playRemoteClip(data.sessionId, TRICK_CLIPS[data.trick])
      const name = data.sessionId === deps.mySessionId() ? '' : data.name
      lastTrick.value = { at: performance.now(), text: deps.trickText(name, data.trick) }
    },
    onCorrection(reason: string | undefined) {
      if ((reason !== 'no_swimsuit' && reason !== 'board_taken') || performance.now() - lastToastAt < TOAST_GAP_MS) return
      lastToastAt = performance.now()
      deps.say(reason === 'no_swimsuit' ? deps.noSwimsuitText() : deps.boardTakenText())
    },
    onRoomJoined() {
      start.value = null
      state.value = null
      result.value = null
      jump = null
    },
  }

  return { locked, hud, board, trickLine, onKeyDown, tick, handlers }
}
