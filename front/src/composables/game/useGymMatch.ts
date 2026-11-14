import { computed, onUnmounted, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { matches, mouseButtonCode } from '../../config/keybindings'
import type { SportsMoveClip } from '../../avatar/glbCharacter'
import type { SfxName } from '../../game/sfx'
import {
  type GymCourtView,
  type GymHudRules,
  type Spot,
  carriedSpot,
  dribbleBeat,
  clockText,
  goodWindowStart,
  meterFill,
  myTeam,
  nearestFreeBall,
  parseGymCourtView,
  parseGymHudRules,
  predictBall,
} from '../../game/sports/gymMatch'
import { sportRulesUrl } from '../../game/sports/sportsSignup'
import type { GymEndPayload, GymErrorPayload, GymEventPayload, GymFreePayload, GymSport, GymStatePayload, GymTeam } from '../../types/gameRealtime'

export interface GymMatchDeps {
  gameRoomRef: ShallowRef<Room | null>
  pointerLocked: Ref<boolean>
  myPosition: { x: number; z: number }
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  remoteAvatar: (sessionId: string) => THREE.Object3D | null
  remoteSportsMove: (sessionId: string, clip: SportsMoveClip) => void
  setRemoteDribbling: (sessionId: string, dribbling: boolean) => void
  playOn: (name: SfxName, object: THREE.Object3D) => void
  say: (text: string) => void
  errorText: (error: GymErrorPayload) => string
}

export type GymBanner =
  | { kind: 'score'; team: GymTeam; points: number; dunk: boolean; scorer: string | null; sport: GymSport }
  | { kind: 'block' | 'steal' | 'tackle'; mine: boolean }
  | { kind: 'half'; half: number }
  | { kind: 'end'; winner: GymTeam | null; mine: GymTeam | null; score: Record<GymTeam, number> }

export interface GymRimPop {
  text: string
  team: GymTeam
  x: number
  y: number
}

const STALE_MS = 3000
const GYM_COURT_URL = '/assets/sports/gym/court.json'
const BANNER_MS = 2600
const END_BANNER_MS = 6000
const RIM_POP_MS = 1600
const RIM_POP_RISE_M = 0.8
const FREE_REACH_M = 2
const MY_FOOT_AHEAD_M = 0.6
const MY_HAND_AHEAD_M = 0.45
const MY_HAND_HEIGHT_M = 0.9
const MATCH_BALL = 'match'
const SPORTS: readonly GymSport[] = ['football', 'basketball']
const BALL_COLOURS: Record<GymSport, number> = { football: 0xf4f4f4, basketball: 0xe07b2c }
const ANCHOR_BONE: Record<GymSport, string> = { football: 'ToeR', basketball: 'HandR' }

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.json()
}

export function useGymMatch(deps: GymMatchDeps) {
  const state = shallowRef<GymStatePayload | null>(null)
  const free = shallowRef<GymFreePayload | null>(null)
  const banner = shallowRef<GymBanner | null>(null)
  const rimPop = shallowRef<GymRimPop | null>(null)
  const rules = shallowRef<Partial<Record<GymSport, GymHudRules>>>({})
  const clientNow = ref(Date.now())
  const holdStartedAt = ref<number | null>(null)
  const cooldownUntil = ref(0)
  const downUntil = ref(0)
  let court: GymCourtView | null = null
  let clockOffset = 0
  let receivedAt = 0
  let freeReceivedAt = 0
  let bannerUntil = 0
  let rimPopAt: { team: GymTeam; text: string; until: number } | null = null
  const meshes = new Map<string, THREE.Mesh>()
  const dribbles = new Map<THREE.Mesh, number>()
  let dribblers = new Set<string>()
  const anchor = new THREE.Vector3()
  const forward = new THREE.Vector3()
  const projected = new THREE.Vector3()
  let loading: Promise<void> | null = null

  function mySessionId(): string | null {
    return deps.gameRoomRef.value?.sessionId ?? null
  }

  const team = computed(() => myTeam(state.value, mySessionId()))

  function loadAll(): void {
    loading ??= Promise.all([
      ...SPORTS.map((sport) => fetchJson(sportRulesUrl(sport)).then((raw) => {
        rules.value = { ...rules.value, [sport]: parseGymHudRules(sport, raw) }
      })),
      fetchJson(GYM_COURT_URL).then((raw) => {
        court = parseGymCourtView(raw)
      }),
    ]).then(() => undefined)
    loading.catch((error) => console.error('[gym] rules or court', error))
  }

  function meshFor(id: string, sport: GymSport, radius: number): THREE.Mesh {
    const key = `${id}:${sport}`
    let mesh = meshes.get(key)
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 2), new THREE.MeshStandardMaterial({ color: BALL_COLOURS[sport], roughness: 0.6 }))
      mesh.name = `gym_ball_${key}`
      meshes.set(key, mesh)
    }
    return mesh
  }

  function hideAll(except: ReadonlySet<THREE.Mesh> = new Set()): void {
    for (const mesh of meshes.values()) if (!except.has(mesh)) mesh.removeFromParent()
  }

  function show(next: GymBanner, ms = BANNER_MS): void {
    banner.value = next
    bannerUntil = Date.now() + ms
  }

  function send(kind: string): void {
    deps.gameRoomRef.value?.send('gym_action', { kind })
  }

  function onState(data: GymStatePayload): void {
    loadAll()
    state.value = data
    receivedAt = Date.now()
    clockOffset = data.serverNow - receivedAt
    if (!myTeam(data, mySessionId())) holdStartedAt.value = null
  }

  function onFree(data: GymFreePayload): void {
    loadAll()
    free.value = data.balls.length > 0 ? data : null
    freeReceivedAt = Date.now()
  }

  function soundAtBalls(name: SfxName): void {
    const shown = [...meshes.values()].find((m) => m.parent)
    if (shown) deps.playOn(name, shown)
  }

  function moveFor(data: GymEventPayload, sport: GymSport): SportsMoveClip | null {
    if (data.kind === 'score') return data.dunk ? 'Dunk' : sport === 'football' ? 'Celebrate' : null
    if (data.kind === 'kick') return sport === 'football' ? (data.shot ? 'Shot' : 'Kick') : data.shot ? 'JumpShot' : null
    if (data.kind === 'tackle') return 'Tackle'
    if (data.kind === 'steal') return 'Steal'
    if (data.kind === 'block') return 'Block'
    return null
  }

  function sportOfEvent(data: GymEventPayload): GymSport {
    if (data.venue !== 'gym_free') return state.value?.sport ?? 'football'
    const ball = free.value?.balls.find((b) => b.owner === data.sessionId) ?? free.value?.balls[0]
    return ball?.sport ?? 'football'
  }

  function onEvent(data: GymEventPayload): void {
    const mine = data.sessionId !== null && data.sessionId === mySessionId()
    const move = data.sessionId && !mine ? moveFor(data, sportOfEvent(data)) : null
    if (move && data.sessionId) deps.remoteSportsMove(data.sessionId, move)
    if (data.kind === 'score') {
      const sport = state.value?.sport ?? 'football'
      show({ kind: 'score', team: data.team, points: data.points, dunk: data.dunk, scorer: data.scorer, sport })
      if (sport === 'basketball') rimPopAt = { team: data.team, text: `+${data.points}`, until: Date.now() + RIM_POP_MS }
      soundAtBalls('market_bell')
    } else if (data.kind === 'kick') {
      soundAtBalls(data.shot || sportOfEvent(data) !== 'basketball' ? 'gym_kick' : 'gym_bounce')
    } else if (data.kind === 'half') {
      show({ kind: 'half', half: data.half })
    } else {
      const sportRules = rules.value[state.value?.sport ?? (data.kind === 'steal' ? 'basketball' : 'football')]
      if (mine && sportRules && data.kind !== 'block') cooldownUntil.value = Date.now() + sportRules.defendCooldownMs
      if (mine && data.kind === 'tackle' && !data.won && sportRules?.downMs) downUntil.value = Date.now() + sportRules.downMs
      if (data.kind === 'block' || data.won) {
        show({ kind: data.kind, mine })
        soundAtBalls('impact')
      } else if (mine) {
        soundAtBalls('whoosh')
      }
    }
  }

  function onEnd(data: GymEndPayload): void {
    const mine = myTeam(state.value, mySessionId())
    if (state.value?.venue === data.venue) state.value = null
    holdStartedAt.value = null
    show({ kind: 'end', winner: data.winner, mine, score: data.score }, END_BANNER_MS)
  }

  function onError(data: GymErrorPayload): void {
    deps.say(deps.errorText(data))
  }

  function freeBallNearMe() {
    const me = mySessionId()
    if (!free.value || !me) return null
    return nearestFreeBall(free.value.balls, me, deps.myPosition.x, deps.myPosition.z, FREE_REACH_M)
  }

  function playing(): boolean {
    if (!deps.pointerLocked.value) return false
    return team.value !== null || (state.value === null && freeBallNearMe() !== null)
  }

  function onPress(code: string, repeat: boolean): boolean {
    if (!playing()) return false
    if (matches('punch', code)) {
      if (!repeat) send('pass')
      return true
    }
    if (matches('interact', code)) {
      if (!repeat && holdStartedAt.value === null) {
        holdStartedAt.value = Date.now()
        send('shot_start')
      }
      return true
    }
    if (matches('sportsTackle', code)) {
      if (!repeat) send('tackle')
      return true
    }
    if (matches('jump', code) && !repeat) send('jump')
    return false
  }

  function onRelease(code: string): void {
    if (holdStartedAt.value === null || !matches('interact', code)) return
    holdStartedAt.value = null
    send('shot_release')
  }

  function borrow(sport: GymSport): void {
    deps.gameRoomRef.value?.send('gym_ball', { sport })
  }

  function giveBack(): void {
    deps.gameRoomRef.value?.send('gym_ball_return', {})
  }

  const onKeyUp = (e: KeyboardEvent) => onRelease(e.code)
  const onMouseUp = (e: MouseEvent) => onRelease(mouseButtonCode(e.button))
  const onBlur = () => {
    holdStartedAt.value = null
  }
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('blur', onBlur)
  onUnmounted(() => {
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('mouseup', onMouseUp)
    window.removeEventListener('blur', onBlur)
    hideAll()
    for (const mesh of meshes.values()) {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
  })

  function myAnchor(sport: GymSport, floorY: number): { spot: Spot; yaw: number } | null {
    const camera = deps.getCamera()
    if (!camera) return null
    camera.getWorldDirection(forward)
    forward.y = 0
    if (forward.lengthSq() < 1e-6) return null
    forward.normalize()
    const ahead = sport === 'football' ? MY_FOOT_AHEAD_M : MY_HAND_AHEAD_M
    const y = sport === 'football' ? floorY : floorY + MY_HAND_HEIGHT_M
    return { spot: { x: deps.myPosition.x + forward.x * ahead, y, z: deps.myPosition.z + forward.z * ahead }, yaw: 0 }
  }

  function remoteAnchor(sessionId: string, sport: GymSport): { spot: Spot; yaw: number } | null {
    const avatar = deps.remoteAvatar(sessionId)
    const bone = avatar?.getObjectByName(ANCHOR_BONE[sport])
    if (!avatar || !bone) return null
    bone.getWorldPosition(anchor)
    return { spot: { x: anchor.x, y: anchor.y, z: anchor.z }, yaw: avatar.rotation.y }
  }

  function place(mesh: THREE.Mesh, sport: GymSport, ball: GymStatePayload['ball'], owner: string | null, ageS: number, seconds: number): void {
    const r = rules.value[sport]
    if (!r || !court) return
    if (owner !== null) {
      const held = owner === mySessionId() ? myAnchor(sport, court.floorY) : remoteAnchor(owner, sport)
      if (held) {
        const spot = carriedSpot(sport, held.spot, held.yaw, court.floorY, r.ballRadius, seconds)
        mesh.position.set(spot.x, spot.y, spot.z)
        if (sport === 'basketball') dribbleSound(mesh, seconds)
        return
      }
    }
    const [x, y, z] = predictBall(ball, ageS, court.floorY, r.ballRadius, owner !== null)
    mesh.position.set(x, y, z)
  }

  function dribbleSound(mesh: THREE.Mesh, seconds: number): void {
    const beat = dribbleBeat(seconds)
    if (dribbles.get(mesh) !== beat && dribbles.has(mesh)) deps.playOn('gym_bounce', mesh)
    dribbles.set(mesh, beat)
  }

  function updateRimPop(now: number): void {
    if (!rimPopAt || now > rimPopAt.until || !court) {
      rimPopAt = null
      rimPop.value = null
      return
    }
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!camera || !canvas) return
    const basket = court.baskets[rimPopAt.team]
    const rise = 1 - (rimPopAt.until - now) / RIM_POP_MS
    projected.set(basket.x, basket.y + 0.4 + rise * RIM_POP_RISE_M, basket.z).project(camera)
    if (projected.z > 1) {
      rimPop.value = null
      return
    }
    rimPop.value = { text: rimPopAt.text, team: rimPopAt.team, x: ((projected.x + 1) / 2) * canvas.clientWidth, y: ((1 - projected.y) / 2) * canvas.clientHeight }
  }

  function updateDribblers(): void {
    const me = mySessionId()
    const next = new Set<string>()
    if (state.value?.sport === 'basketball' && state.value.owner) next.add(state.value.owner)
    for (const ball of free.value?.balls ?? []) if (ball.sport === 'basketball' && ball.owner) next.add(ball.owner)
    if (me) next.delete(me)
    for (const id of dribblers) if (!next.has(id)) deps.setRemoteDribbling(id, false)
    for (const id of next) if (!dribblers.has(id)) deps.setRemoteDribbling(id, true)
    dribblers = next
  }

  function tick(): void {
    const now = Date.now()
    clientNow.value = now
    if (banner.value && now > bannerUntil) banner.value = null
    if (state.value && now - receivedAt > STALE_MS) state.value = null
    if (free.value && now - freeReceivedAt > STALE_MS) free.value = null
    updateRimPop(now)
    const scene = deps.getScene()
    const shown = new Set<THREE.Mesh>()
    const seconds = now / 1000
    const current = state.value
    const matchRules = current ? rules.value[current.sport] : undefined
    if (current && matchRules) {
      const mesh = meshFor(MATCH_BALL, current.sport, matchRules.ballRadius)
      place(mesh, current.sport, current.ball, current.owner, (now - receivedAt) / 1000, seconds)
      shown.add(mesh)
    }
    for (const ball of free.value?.balls ?? []) {
      const r = rules.value[ball.sport]
      if (!r) continue
      const mesh = meshFor(ball.id, ball.sport, r.ballRadius)
      place(mesh, ball.sport, ball.ball, ball.owner, (now - freeReceivedAt) / 1000, seconds)
      shown.add(mesh)
    }
    updateDribblers()
    hideAll(shown)
    if (scene) for (const mesh of shown) if (mesh.parent !== scene) scene.add(mesh)
  }

  const hud = computed(() => {
    const current = state.value
    if (!current) return null
    const remaining = current.endsAt - (clientNow.value + clockOffset)
    const r = rules.value[current.sport]
    const held = holdStartedAt.value
    const basket = team.value && court ? court.baskets[team.value] : null
    const distance = basket ? Math.hypot(deps.myPosition.x - basket.x, deps.myPosition.z - basket.z) : 0
    const meter = r && held !== null ? { fill: meterFill(r.meter, clientNow.value - held), goodFrom: goodWindowStart(r.meter, distance) } : null
    const cooldown = r && cooldownUntil.value > clientNow.value ? (cooldownUntil.value - clientNow.value) / r.defendCooldownMs : null
    return {
      sport: current.sport,
      score: current.score,
      clock: clockText(remaining),
      half: current.half,
      halves: current.halves,
      team: team.value,
      meter,
      cooldown,
    }
  })

  const freeHud = computed(() => {
    void clientNow.value
    if (state.value) return null
    const ball = freeBallNearMe()
    if (!ball) return null
    const r = rules.value[ball.sport]
    const held = holdStartedAt.value
    return { sport: ball.sport, meter: r && held !== null ? { fill: meterFill(r.meter, clientNow.value - held), goodFrom: null } : null }
  })

  const myBall = computed(() => {
    const me = mySessionId()
    return free.value?.balls.find((b) => b.lender === me)?.sport ?? null
  })

  const down = () => downUntil.value > Date.now()

  return { hud, freeHud, banner, rimPop, myBall, handlers: { onState, onEvent, onEnd, onFree, onError }, onPress, borrow, giveBack, down, tick }
}
