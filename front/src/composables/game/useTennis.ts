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
  TENNIS_AUTO_RUN_SHARE,
  TENNIS_DOUBLES_HALF_WIDTH,
  TENNIS_HALF_LENGTH,
  TENNIS_NET_Z,
  TENNIS_SWEET_M,
  aimMoved,
  ballComing,
  ballPosition,
  defaultAim,
  freeCourtAt,
  chargeFill,
  highBall,
  inPlace,
  interceptSpot,
  iServe,
  landingSpot,
  markOpacity,
  markYaw,
  myTeam,
  recoverySpot,
  runStep,
  sideAt,
  swingFor,
  swingRing,
  type BallPlay,
  type SwingTone,
  type CourtView,
  type Spot,
  type TennisSwing,
} from '../../game/sports/tennis'
import { WALK_SPEED } from '../../game/gameRoomConstants'
import type { SportsView } from '../../game/camera/sportsCamera'
import { hasSportsLoan } from '../../game/sports/sportsLoans'
import type { TennisBall, TennisFreePayload, TennisShot, TennisStatePayload, TennisTeam, TennisTiming } from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const BALL_RADIUS_SHOWN = 0.05
const BALL_COLOR = 0xd8f04a
const LEFT_BUTTON = 0
const RIGHT_BUTTON = 2
const PROMPT_HEIGHT = 1.2
const MARK_COLOR = 0xeef0d2
const MARK_HALF_WIDTH = 0.035
const MARK_HALF_LENGTH = 0.07
const MARK_OPACITY = 0.8
const MARK_Y = 0.09
const AIM_COLOR = 0xffd34d
const AIM_RADIUS_M = 0.45
const AIM_Y = 0.1
const LANDING_COLOR = 0xffffff
const LANDING_RADIUS_M = 0.35
const SHADOW_RADIUS_M = 0.14
const SHADOW_OPACITY = 0.35
const TIMING_SHOWN_MS = 900
const SWING_RING_COLOURS: Record<SwingTone, number> = { miss: 0xe0483c, weak: 0xf29a2e, good: 0x4cc46a, smash: 0xa45cf0 }
const SWING_RING_Y = 0.11
const SWING_RING_INNER_SHARE = 0.9
const STAND_MARK_Y = 0.105
const STAND_MARK_COLOUR = 0xffe9a8
const STAND_MARK_READY_COLOUR = 0x2fd6c4
const STAND_MARK_OPACITY = 0.45
const CHARGE_Y = 0.108
const CHARGE_COLOUR = 0xffffff
const CHARGE_SHARE = 0.6
const STAR_POINTS = 5
const STAR_INNER_SHARE = 0.45
const STAR_SCALE = 1.5

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

interface Stance {
  team: TennisTeam
  court: CourtView
  match: TennisStatePayload | null
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
  onSwing: (swing: TennisSwing) => void
  onBallHit: (ball: THREE.Object3D) => void
  onBounce: (ball: THREE.Object3D) => void
  onCall: (call: NonNullable<TennisCall>) => void
  setRemoteRacket: (sessionId: string, holding: boolean) => void
  setOwnRacket: (holding: boolean) => void
  remoteSessions: () => readonly string[]
  remotePosition: (sessionId: string) => { x: number; z: number } | null
}

interface OutMark {
  mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>
  shownAt: number
}

function newMarkMesh(): OutMark['mesh'] {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: MARK_COLOR, transparent: true, opacity: MARK_OPACITY, depthWrite: false }),
  )
  mesh.scale.set(MARK_HALF_WIDTH, 1, MARK_HALF_LENGTH)
  mesh.name = 'tennis_out_mark'
  return mesh
}

function newGroundRing(color: number, radius: number, opacity: number, innerShare = 0.72): THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(radius * innerShare, radius, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  )
  mesh.visible = false
  return mesh
}

function starShape(): THREE.Shape {
  const shape = new THREE.Shape()
  for (let i = 0; i < STAR_POINTS * 2; i += 1) {
    const radius = i % 2 === 0 ? 1 : STAR_INNER_SHARE
    const angle = (i * Math.PI) / STAR_POINTS
    const x = Math.sin(angle) * radius
    const y = Math.cos(angle) * radius
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

function newGroundShape(geometry: THREE.BufferGeometry, color: number, opacity: number): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const mesh = new THREE.Mesh(geometry.rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }))
  mesh.visible = false
  return mesh
}

function newShadowMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(SHADOW_RADIUS_M, 14).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOW_OPACITY, depthWrite: false }),
  )
  mesh.visible = false
  return mesh
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
  const outMarks = new Map<string, OutMark>()
  const forward = new THREE.Vector3()
  const projection = new THREE.Vector3()
  const aimRing = newGroundRing(AIM_COLOR, AIM_RADIUS_M, 0.9)
  const landingRing = newGroundRing(LANDING_COLOR, LANDING_RADIUS_M, 0.7)
  const swingRingMesh = newGroundRing(SWING_RING_COLOURS.miss, 1, 0.95, SWING_RING_INNER_SHARE)
  const standDisc = newGroundShape(new THREE.CircleGeometry(1, 40), STAND_MARK_COLOUR, STAND_MARK_OPACITY)
  const standStar = newGroundShape(new THREE.ShapeGeometry(starShape()), STAND_MARK_COLOUR, STAND_MARK_OPACITY)
  const chargeDisc = newGroundShape(new THREE.CircleGeometry(1, 40), CHARGE_COLOUR, 0.75)
  let readySince: number | null = null
  let readyFor: TennisTeam | null = null
  let highShot = false
  const shadows = new Map<THREE.Mesh, THREE.Mesh>()
  const timing = ref<TennisTiming | null>(null)
  let timingUntil = 0
  let aim: Spot | null = null
  let aimSide: TennisTeam | null = null
  let freeSide: { court: string; team: TennisTeam } | null = null
  let ownRacket = false

  function mySessionId(): string | null {
    return deps.gameRoomRef.value?.sessionId ?? null
  }

  function showOutMark(court: string, ball: TennisBall): void {
    const scene = deps.getScene()
    if (!scene) return
    const mark = outMarks.get(court) ?? { mesh: newMarkMesh(), shownAt: 0 }
    mark.mesh.position.set(ball.x, MARK_Y, ball.z)
    mark.mesh.rotation.y = markYaw(ball)
    mark.mesh.material.opacity = MARK_OPACITY
    mark.shownAt = Date.now()
    outMarks.set(court, mark)
    if (!mark.mesh.parent) scene.add(mark.mesh)
  }

  function fadeOutMarks(): void {
    for (const [court, mark] of outMarks) {
      const opacity = markOpacity(now.value - mark.shownAt)
      mark.mesh.material.opacity = MARK_OPACITY * opacity
      if (opacity > 0) continue
      mark.mesh.removeFromParent()
      mark.mesh.geometry.dispose()
      mark.mesh.material.dispose()
      outMarks.delete(court)
    }
  }

  function announce(court: string, call: TennisCall, ball: TennisBall | null, mesh: THREE.Mesh): void {
    if (!call) return
    lastCall.value = call
    callUntil.value = Date.now() + TENNIS_CALL_MS
    deps.onCall(call)
    if (call === 'out' && ball) showOutMark(court, ball)
    if (ball && call !== 'net') {
      mesh.position.set(ball.x, ball.y, ball.z)
      deps.onBounce(mesh)
    }
  }

  function struck(before: { phase: string; hitter: TennisTeam | null; ball: TennisBall | null } | undefined, after: { phase: string; hitter: TennisTeam | null; ball: TennisBall | null; shot: TennisShot | null }, mesh: THREE.Mesh): void {
    if (after.phase !== 'flight' || !after.ball || before?.ball?.t === after.ball.t) return
    if (before?.hitter !== after.hitter && after.shot?.sessionId === mySessionId()) {
      timing.value = after.shot.timing
      timingUntil = Date.now() + TIMING_SHOWN_MS
    }
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
    if (before?.phase !== 'point') announce(data.venue, data.call, data.ball, matchBall)
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
    if (before?.phase !== 'point') announce(data.court, data.call, data.ball, mesh)
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

  function swing(): { team: TennisTeam; court: { cx: number; netZ: number }; serving: boolean; ball: THREE.Mesh } | null {
    const s = playing()
    const team = s && myTeam(s, mySessionId())
    if (s && team) return { team, court: s.court, serving: iServe(s, mySessionId()), ball: matchBall }
    const court = holdingBall() ? freeCourtAt(deps.myPosition.x, deps.myPosition.z) : null
    if (!court) return null
    const phase = free.value.get(court.id)?.phase
    const serving = phase === undefined || phase === 'toss' || phase === 'point'
    return { team: sideAt(deps.myPosition.z), court: { cx: court.cx, netZ: TENNIS_NET_Z }, serving, ball: freeBalls.get(court.id)! }
  }

  function onPointerDown(e: MouseEvent): boolean {
    const room = deps.gameRoomRef.value
    const camera = deps.getCamera()
    if (!room || !camera || !deps.pointerLocked() || (e.button !== LEFT_BUTTON && e.button !== RIGHT_BUTTON)) return false
    const shot = swing()
    const here = stance()
    if (!shot || !here) return false
    const target = aimFor(here)
    const lob = e.button === RIGHT_BUTTON
    room.send('tennis_hit', { aimX: target.x, aimZ: target.z, lob })
    deps.onSwing(swingFor(shot.serving, lob, shot.team, deps.myPosition, shot.ball.visible ? shot.ball.position.x : null))
    return true
  }

  function stance(): Stance | null {
    const s = playing()
    const team = s && myTeam(s, mySessionId())
    if (s && team) return { team, court: s.court, match: s }
    const court = holdingBall() ? freeCourtAt(deps.myPosition.x, deps.myPosition.z) : null
    if (!court) {
      freeSide = null
      return null
    }
    if (freeSide?.court !== court.id) freeSide = { court: court.id, team: sideAt(deps.myPosition.z) }
    return { team: freeSide.team, court: { cx: court.cx, netZ: TENNIS_NET_Z, halfWidth: free.value.get(court.id)?.geometry?.halfWidth ?? TENNIS_DOUBLES_HALF_WIDTH }, match: null }
  }

  function aimFor(here: Stance): Spot {
    if (!aim || aimSide !== here.team) {
      aim = defaultAim(here.court, here.team)
      aimSide = here.team
    }
    return aim
  }

  function onMouseMove(e: MouseEvent): void {
    const here = deps.pointerLocked() ? stance() : null
    if (here) aim = aimMoved(here.court, here.team, aimFor(here), e.movementX, e.movementY)
  }

  function cameraView(): SportsView | null {
    const here = stance()
    return here ? { kind: 'court', sport: 'tennis', optional: false, cx: here.court.cx, netZ: here.court.netZ, halfLength: TENNIS_HALF_LENGTH, side: here.team === 'red' ? 1 : -1 } : null
  }

  function incoming(here: Stance): (BallPlay & { bounces: number }) | null {
    if (here.match) return { ...here.match, netZ: here.match.court.netZ }
    const rally = [...free.value.values()].find((f) => f.geometry?.cx === here.court.cx)
    return rally ? { ...rally, netZ: TENNIS_NET_Z } : null
  }

  function nearestOfMySide(here: Stance, spot: Spot): boolean {
    if (!here.match) return true
    const mine = Math.hypot(spot.x - deps.myPosition.x, spot.z - deps.myPosition.z)
    return here.match.players.every((p) => {
      if (p.team !== here.team || p.sessionId === mySessionId()) return true
      const at = deps.remotePosition(p.sessionId)
      return !at || Math.hypot(spot.x - at.x, spot.z - at.z) >= mine
    })
  }

  function runTarget(): Spot | null {
    const here = stance()
    const play = here && incoming(here)
    if (!here || !play || play.phase !== 'flight') return null
    const spot = interceptSpot(play, here.team, Date.now() + clockOffset.value)
    if (spot) return nearestOfMySide(here, spot) ? spot : null
    return here.match ? recoverySpot(here.court, here.team, deps.myPosition) : null
  }

  function serving(): boolean {
    const me = mySessionId()
    const s = playing()
    if (s) return iServe(s, me)
    return me !== null && [...free.value.values()].some((f) => f.phase === 'toss' && f.server === me)
  }

  function autoRun(dt: number): { dx: number; dz: number } | null {
    const spot = runTarget()
    return spot ? runStep(deps.myPosition, spot, WALK_SPEED * TENNIS_AUTO_RUN_SHARE * dt) : null
  }

  function placeGuides(): void {
    const scene = deps.getScene()
    const here = stance()
    if (scene && !aimRing.parent) scene.add(aimRing, landingRing, swingRingMesh, standDisc, standStar, chargeDisc)
    aimRing.visible = here !== null
    landingRing.visible = false
    swingRingMesh.visible = false
    standDisc.visible = false
    standStar.visible = false
    chargeDisc.visible = false
    if (!here) {
      readySince = null
      return
    }
    const target = aimFor(here)
    aimRing.position.set(target.x, AIM_Y, target.z)
    const play = incoming(here)
    const now = Date.now() + clockOffset.value
    const receiving = play !== null && play.phase === 'flight' && play.ball !== null && play.hitter !== here.team
    const spot = play && receiving ? interceptSpot(play, here.team, now) : null
    const ready = play !== null && spot !== null && inPlace(play, here.team, deps.myPosition, now)
    if (!ready || play?.hitter !== readyFor) readySince = ready ? now : null
    readyFor = play?.hitter ?? null
    const charge = chargeFill(readySince, now)
    if (play?.ball && receiving && play.bounces === 0) highShot = highBall(play.ball)
    if (spot) {
      const mark = highShot ? standStar : standDisc
      const size = TENNIS_SWEET_M * (highShot ? STAR_SCALE : 1)
      mark.visible = true
      mark.position.set(spot.x, STAND_MARK_Y, spot.z)
      mark.scale.set(size, 1, size)
      mark.material.color.setHex(ready ? STAND_MARK_READY_COLOUR : STAND_MARK_COLOUR)
      if (charge > 0) {
        chargeDisc.visible = true
        chargeDisc.position.set(spot.x, CHARGE_Y, spot.z)
        const filled = TENNIS_SWEET_M * CHARGE_SHARE * charge
        chargeDisc.scale.set(filled, 1, filled)
        chargeDisc.material.color.setHex(charge >= 1 ? SWING_RING_COLOURS.smash : CHARGE_COLOUR)
      }
    }
    const ring = play ? swingRing(play, here.team, deps.myPosition, now, charge >= 1) : null
    if (ring) {
      const centre = spot ?? deps.myPosition
      swingRingMesh.visible = true
      swingRingMesh.position.set(centre.x, SWING_RING_Y, centre.z)
      swingRingMesh.scale.set(ring.radius, 1, ring.radius)
      swingRingMesh.material.color.setHex(SWING_RING_COLOURS[ring.tone])
    }
    if (!play || play.phase !== 'flight' || !play.ball || play.hitter === here.team || play.bounces !== 0) return
    const landing = landingSpot(play.ball)
    landingRing.position.set(landing.x, AIM_Y, landing.z)
    landingRing.visible = true
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
    let shadow = shadows.get(mesh)
    if (!shadow) {
      shadow = newShadowMesh()
      shadows.set(mesh, shadow)
    }
    if (scene && !shadow.parent) scene.add(shadow)
    shadow.visible = ball !== null
    if (!ball) return
    const p = ballPosition(ball, serverMs)
    mesh.position.set(p.x, p.y + BALL_RADIUS_SHOWN, p.z)
    shadow.position.set(p.x, MARK_Y, p.z)
  }

  function updateRackets(): void {
    const holders = new Set<string>(state.value && state.value.phase !== 'ended' ? state.value.players.map((p) => p.sessionId) : [])
    for (const sessionId of deps.remoteSessions()) if (hasSportsLoan(sessionId, TENNIS_BALL_LOAN)) holders.add(sessionId)
    holders.delete(mySessionId() ?? '')
    for (const id of racketHolders) if (!holders.has(id)) deps.setRemoteRacket(id, false)
    for (const id of holders) if (!racketHolders.has(id)) deps.setRemoteRacket(id, true)
    racketHolders.clear()
    for (const id of holders) racketHolders.add(id)
    const mine = holdingRacket()
    if (mine !== ownRacket) {
      ownRacket = mine
      deps.setOwnRacket(mine)
    }
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
    fadeOutMarks()
    placeGuides()
    if (timing.value && now.value > timingUntil) timing.value = null
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

  return { hud, cue, call, timing, freePlay, source, holdingRacket, onPointerDown, onMouseMove, cameraView, autoRun, serving, tick, handlers: { onState, onFree } }
}
