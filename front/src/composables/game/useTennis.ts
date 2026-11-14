import { computed, ref, shallowRef, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { TENNIS_CALL_MS, TENNIS_END_SHOWN_MS, aimOnCourt, ballComing, ballPosition, iServe, myTeam } from '../../game/sports/tennis'
import type { TennisStatePayload, TennisTeam } from '../../types/gameRealtime'

const BALL_RADIUS_SHOWN = 0.05
const BALL_COLOR = 0xd8f04a
const LEFT_BUTTON = 0
const RIGHT_BUTTON = 2

export interface TennisHud {
  games: Record<TennisTeam, number>
  points: Record<TennisTeam, string>
  tiebreak: boolean
  serving: TennisTeam
  myTeam: TennisTeam | null
  iServe: boolean
  tossing: boolean
  cue: boolean
  call: TennisStatePayload['call']
  pointWinner: TennisTeam | null
  winner: TennisTeam | null
}

export interface TennisDeps {
  gameRoomRef: ShallowRef<Room | null>
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.Camera | undefined
  myPosition: { x: number; y: number; z: number }
  pointerLocked: () => boolean
  onSwing: () => void
  onBallHit: (ball: THREE.Object3D) => void
}

export function useTennis(deps: TennisDeps) {
  const state = shallowRef<TennisStatePayload | null>(null)
  const clockOffset = ref(0)
  const callUntil = ref(0)
  const endedAt = ref(0)
  const cue = ref(false)
  const now = ref(Date.now())
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS_SHOWN, 12, 8), new THREE.MeshStandardMaterial({ color: BALL_COLOR, roughness: 0.6 }))
  ball.visible = false
  const forward = new THREE.Vector3()
  const eye = new THREE.Vector3()

  function mySessionId(): string | null {
    return deps.gameRoomRef.value?.sessionId ?? null
  }

  function onState(data: TennisStatePayload): void {
    const before = state.value
    const sameMatch = before?.venue === data.venue
    clockOffset.value = data.serverNow - Date.now()
    state.value = data
    if (data.call) callUntil.value = Date.now() + TENNIS_CALL_MS
    if (data.phase === 'ended') endedAt.value = Date.now()
    const struck = data.phase === 'flight' && data.hitter !== null && (!sameMatch || before?.hitter !== data.hitter || before?.phase !== 'flight')
    if (struck && data.ball) {
      ball.position.set(data.ball.x, data.ball.y, data.ball.z)
      deps.onBallHit(ball)
    }
  }

  function playing(): TennisStatePayload | null {
    const s = state.value
    return s && s.phase !== 'ended' && myTeam(s, mySessionId()) !== null ? s : null
  }

  function onPointerDown(e: MouseEvent): boolean {
    const s = playing()
    const team = s && myTeam(s, mySessionId())
    const room = deps.gameRoomRef.value
    const camera = deps.getCamera()
    if (!s || !team || !room || !camera || !deps.pointerLocked() || (e.button !== LEFT_BUTTON && e.button !== RIGHT_BUTTON)) return false
    camera.getWorldPosition(eye)
    camera.getWorldDirection(forward)
    const aim = aimOnCourt(s, team, eye, forward)
    room.send('tennis_hit', { aimX: aim.x, aimZ: aim.z, lob: e.button === RIGHT_BUTTON })
    deps.onSwing()
    return true
  }

  function tick(): void {
    now.value = Date.now()
    const s = state.value
    if (s?.phase === 'ended' && now.value - endedAt.value > TENNIS_END_SHOWN_MS) state.value = null
    const scene = deps.getScene()
    if (scene && !ball.parent) scene.add(ball)
    const shown = state.value?.ball ?? null
    ball.visible = shown !== null && state.value?.phase !== 'ended'
    const serverMs = now.value + clockOffset.value
    if (shown) {
      const p = ballPosition(shown, serverMs)
      ball.position.set(p.x, p.y + BALL_RADIUS_SHOWN, p.z)
    }
    const mine = state.value && myTeam(state.value, mySessionId())
    cue.value = !!(state.value && mine && ballComing(state.value, mine, deps.myPosition, serverMs))
  }

  const hud = computed<TennisHud | null>(() => {
    const s = state.value
    if (!s) return null
    const sessionId = mySessionId()
    return {
      games: s.games,
      points: s.points,
      tiebreak: s.tiebreak,
      serving: s.serving,
      myTeam: myTeam(s, sessionId),
      iServe: iServe(s, sessionId),
      tossing: s.phase === 'toss',
      cue: cue.value,
      call: now.value < callUntil.value ? s.call : null,
      pointWinner: s.pointWinner,
      winner: s.phase === 'ended' ? s.winner : null,
    }
  })

  return { hud, onPointerDown, tick, handlers: { onState } }
}
