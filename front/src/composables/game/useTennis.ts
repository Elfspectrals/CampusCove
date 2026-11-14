import { computed, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { isAimingAtNpc } from '../../game/pub/npcAim'
import {
  BALL_BASKETS,
  BALL_BASKET_REACH,
  TENNIS_BALL_LOAN,
  TENNIS_CALL_MS,
  TENNIS_COURTS,
  TENNIS_END_SHOWN_MS,
  TENNIS_NET_Z,
  aimOnCourt,
  ballComing,
  ballPosition,
  freeCourtAt,
  iServe,
  myTeam,
  sideAt,
  type BallPlay,
} from '../../game/sports/tennis'
import { hasSportsLoan } from '../../game/sports/sportsLoans'
import type { TennisBall, TennisFreePayload, TennisStatePayload, TennisTeam } from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const BALL_RADIUS_SHOWN = 0.05
const BALL_COLOR = 0xd8f04a
const LEFT_BUTTON = 0
const RIGHT_BUTTON = 2
const PROMPT_HEIGHT = 1.2

export interface TennisHud {
  games: Record<TennisTeam, number>
  points: Record<TennisTeam, string>
  tiebreak: boolean
  serving: TennisTeam
  myTeam: TennisTeam | null
  iServe: boolean
  tossing: boolean
  pointWinner: TennisTeam | null
  winner: TennisTeam | null
}

export type TennisCall = TennisStatePayload['call']

export interface TennisDeps {
  gameRoomRef: ShallowRef<Room | null>
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  myPosition: { x: number; y: number; z: number }
  pointerLocked: () => boolean
  promptsHidden: () => boolean
  basketPrompt: () => { action: string; detail?: string }
  onSwing: () => void
  onBallHit: (ball: THREE.Object3D) => void
  onBounce: (ball: THREE.Object3D) => void
  onCall: (call: NonNullable<TennisCall>) => void
  setRemoteRacket: (sessionId: string, holding: boolean) => void
  remoteSessions: () => readonly string[]
}

function newBallMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS_SHOWN, 12, 8), new THREE.MeshStandardMaterial({ color: BALL_COLOR, roughness: 0.6 }))
  mesh.visible = false
  return mesh
}

export function useTennis(deps: TennisDeps) {
  const state = shallowRef<TennisStatePayload | null>(null)
  const free = shallowRef<ReadonlyMap<string, TennisFreePayload>>(new Map())
  const clockOffset = ref(0)
  const callUntil = ref(0)
  const lastCall = ref<TennisCall>(null)
  const endedAt = ref(0)
  const cue = ref(false)
  const freePlay = ref(false)
  const now = ref(Date.now())
  const matchBall = newBallMesh()
  const freeBalls = new Map<string, THREE.Mesh>(TENNIS_COURTS.map((c) => [c.id, newBallMesh()]))
  const racketHolders = new Set<string>()
  const forward = new THREE.Vector3()
  const eye = new THREE.Vector3()
  const projection = new THREE.Vector3()

  function mySessionId(): string | null {
    return deps.gameRoomRef.value?.sessionId ?? null
  }

  function announce(call: TennisCall, ball: TennisBall | null, mesh: THREE.Mesh): void {
    if (!call) return
    lastCall.value = call
    callUntil.value = Date.now() + TENNIS_CALL_MS
    deps.onCall(call)
    if (ball && call !== 'net') {
      mesh.position.set(ball.x, ball.y, ball.z)
      deps.onBounce(mesh)
    }
  }

  function struck(before: { phase: string; hitter: TennisTeam | null; ball: TennisBall | null } | undefined, after: { phase: string; hitter: TennisTeam | null; ball: TennisBall | null }, mesh: THREE.Mesh): void {
    if (after.phase !== 'flight' || !after.ball) return
    const bounced = before?.phase === 'flight' && before.hitter === after.hitter
    mesh.position.set(after.ball.x, after.ball.y, after.ball.z)
    if (bounced) deps.onBounce(mesh)
    else deps.onBallHit(mesh)
  }

  function onState(data: TennisStatePayload): void {
    const before = state.value?.venue === data.venue ? state.value : undefined
    clockOffset.value = data.serverNow - Date.now()
    state.value = data
    if (data.phase === 'ended') endedAt.value = Date.now()
    struck(before ?? undefined, data, matchBall)
    if (before?.phase !== 'point') announce(data.call, data.ball, matchBall)
  }

  function onFree(data: TennisFreePayload): void {
    clockOffset.value = data.serverNow - Date.now()
    const before = free.value.get(data.court)
    const next = new Map(free.value)
    if (data.phase === 'idle') next.delete(data.court)
    else next.set(data.court, data)
    free.value = next
    const mesh = freeBalls.get(data.court)
    if (!mesh) return
    struck(before, data, mesh)
    if (before?.phase !== 'point') announce(data.call, data.ball, mesh)
  }

  function playing(): TennisStatePayload | null {
    const s = state.value
    return s && s.phase !== 'ended' && myTeam(s, mySessionId()) !== null ? s : null
  }

  function holdingBall(): boolean {
    const me = mySessionId()
    return me !== null && hasSportsLoan(me, TENNIS_BALL_LOAN)
  }

  function holdingRacket(): boolean {
    return playing() !== null || holdingBall()
  }

  function swing(): { team: TennisTeam; court: { cx: number; netZ: number } } | null {
    const s = playing()
    const team = s && myTeam(s, mySessionId())
    if (s && team) return { team, court: s.court }
    const court = holdingBall() ? freeCourtAt(deps.myPosition.x, deps.myPosition.z) : null
    return court ? { team: sideAt(deps.myPosition.z), court: { cx: court.cx, netZ: TENNIS_NET_Z } } : null
  }

  function onPointerDown(e: MouseEvent): boolean {
    const room = deps.gameRoomRef.value
    const camera = deps.getCamera()
    if (!room || !camera || !deps.pointerLocked() || (e.button !== LEFT_BUTTON && e.button !== RIGHT_BUTTON)) return false
    const shot = swing()
    if (!shot) return false
    camera.getWorldPosition(eye)
    camera.getWorldDirection(forward)
    const aim = aimOnCourt(shot.court, shot.team, eye, forward)
    room.send('tennis_hit', { aimX: aim.x, aimZ: aim.z, lob: e.button === RIGHT_BUTTON })
    deps.onSwing()
    return true
  }

  function aimedBasket(): (typeof BALL_BASKETS)[number] | null {
    const camera = deps.getCamera()
    if (!camera || holdingBall()) return null
    camera.getWorldDirection(forward)
    return BALL_BASKETS.find((b) => isAimingAtNpc(deps.myPosition, forward, [...b.position], BALL_BASKET_REACH)) ?? null
  }

  function prompt(): ScreenPrompt | null {
    if (deps.promptsHidden()) return null
    const basket = aimedBasket()
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!basket || !camera || !canvas) return null
    const [x, y, z] = basket.position
    projection.set(x, y + PROMPT_HEIGHT, z).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height, ...deps.basketPrompt() }
  }

  function interact(): boolean {
    const room = deps.gameRoomRef.value
    const basket = aimedBasket()
    if (!room || !basket) return false
    room.send('tennis_ball_take', { court: basket.court })
    return true
  }

  const source: InteractionSource = { prompt, interact }

  function placeBall(mesh: THREE.Mesh, ball: TennisBall | null, serverMs: number): void {
    const scene = deps.getScene()
    if (scene && !mesh.parent) scene.add(mesh)
    mesh.visible = ball !== null
    if (!ball) return
    const p = ballPosition(ball, serverMs)
    mesh.position.set(p.x, p.y + BALL_RADIUS_SHOWN, p.z)
  }

  function updateRackets(): void {
    const holders = new Set<string>(state.value && state.value.phase !== 'ended' ? state.value.players.map((p) => p.sessionId) : [])
    for (const sessionId of deps.remoteSessions()) if (hasSportsLoan(sessionId, TENNIS_BALL_LOAN)) holders.add(sessionId)
    holders.delete(mySessionId() ?? '')
    for (const id of racketHolders) if (!holders.has(id)) deps.setRemoteRacket(id, false)
    for (const id of holders) if (!racketHolders.has(id)) deps.setRemoteRacket(id, true)
    racketHolders.clear()
    for (const id of holders) racketHolders.add(id)
  }

  function tick(): void {
    now.value = Date.now()
    if (state.value?.phase === 'ended' && now.value - endedAt.value > TENNIS_END_SHOWN_MS) state.value = null
    const serverMs = now.value + clockOffset.value
    placeBall(matchBall, state.value?.phase === 'ended' ? null : (state.value?.ball ?? null), serverMs)
    for (const [court, mesh] of freeBalls) placeBall(mesh, free.value.get(court)?.ball ?? null, serverMs)
    const s = playing()
    const mine = s && myTeam(s, mySessionId())
    const plays: BallPlay[] = s && mine ? [{ ...s, netZ: s.court.netZ }] : holdingBall() ? [...free.value.values()].map((f) => ({ ...f, netZ: TENNIS_NET_Z })) : []
    const team = mine ?? sideAt(deps.myPosition.z)
    cue.value = plays.some((p) => ballComing(p, team, deps.myPosition, serverMs))
    freePlay.value = state.value === null && holdingBall()
    updateRackets()
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
      pointWinner: s.pointWinner,
      winner: s.phase === 'ended' ? s.winner : null,
    }
  })
  const call = computed<TennisCall>(() => (now.value < callUntil.value ? lastCall.value : null))

  return { hud, cue, call, freePlay, source, holdingRacket, onPointerDown, tick, handlers: { onState, onFree } }
}
