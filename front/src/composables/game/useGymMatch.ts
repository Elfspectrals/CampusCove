import { computed, onUnmounted, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { matches, mouseButtonCode } from '../../config/keybindings'
import type { SportsMoveClip } from '../../avatar/glbCharacter'
import type { SfxName } from '../../game/sfx'
import {
  COURT_FILES,
  type GymCourtView,
  type GymHudRules,
  type GymScreen,
  type Spot,
  carriedSpot,
  courtUrlOf,
  dribbleBeat,
  clockText,
  goodWindowStart,
  meterFill,
  myTeam,
  courtHoops,
  hoopAhead,
  nearestFreeBall,
  teamJerseyUrl,
  type HoopSpot,
  parseGymCourtView,
  parseGymHudRules,
  predictBall,
  scoreboardLines,
} from '../../game/sports/gymMatch'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { createGltfLoader } from '../../game/gltfLoaderFactory'
import { sportRulesUrl } from '../../game/sports/sportsSignup'
import type { SportsView } from '../../game/camera/sportsCamera'
import type { GymEndPayload, GymErrorPayload, GymEventPayload, GymFreePayload, GymShotRelease, GymSport, GymStatePayload, GymTeam } from '../../types/gameRealtime'

export interface GymMatchDeps {
  gameRoomRef: ShallowRef<Room | null>
  pointerLocked: Ref<boolean>
  myPosition: { x: number; z: number }
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  avatar: (sessionId: string) => THREE.Object3D | null
  sportsMove: (sessionId: string, clip: SportsMoveClip) => void
  setDribbling: (sessionId: string, dribbling: boolean) => void
  setTopOverride: (sessionId: string, top: string | null) => void
  ownBodyShown: () => boolean
  yaw: () => number
  playOn: (name: SfxName, object: THREE.Object3D) => void
  play: (name: SfxName) => void
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
const BANNER_MS = 2600
const END_BANNER_MS = 6000
const RIM_POP_MS = 1600
const RELEASE_LABEL_MS = 1200
const MARKER_RADII: readonly [number, number] = [0.45, 0.6]
const MARKER_COLOURS = { red: 0xe0604a, blue: 0x3f8fd1, free: 0xf2c230 } as const
const RIM_POP_RISE_M = 0.8
const FREE_REACH_M = 2
const MY_FOOT_AHEAD_M = 0.6
const MY_HAND_AHEAD_M = 0.9
const MY_HAND_HEIGHT_M = 1.1
const MATCH_BALL = 'match'
const SPORTS: readonly GymSport[] = ['football', 'basketball']
const BALL_MODEL_URL: Record<GymSport, string> = { football: '/assets/decor/gym_football/model.glb', basketball: '/assets/decor/gym_basketball/model.glb' }
const ANCHOR_BONE: Record<GymSport, string> = { football: 'ToeR', basketball: 'HandR' }
const CAMERA_DISTANCE_M = 4.2
const CAMERA_LIFT_M = 0.5
const TARGET_RING_RADII: readonly [number, number] = [0.3, 0.42]
const TARGET_RING_ABOVE_RIM_M = 0.03
const TARGET_RING_COLOUR = 0xf2c230

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
  const releaseLabel = ref<GymShotRelease | null>(null)
  let releaseUntil = 0
  const rules = shallowRef<Partial<Record<GymSport, GymHudRules>>>({})
  const clientNow = ref(Date.now())
  const holdStartedAt = ref<number | null>(null)
  const cooldownUntil = ref(0)
  const downUntil = ref(0)
  const courts = new Map<string, GymCourtView>()
  let clockOffset = 0
  let receivedAt = 0
  let freeReceivedAt = 0
  let bannerUntil = 0
  let rimPopAt: { team: GymTeam; text: string; until: number } | null = null
  const meshes = new Map<string, THREE.Object3D>()
  const dribbles = new Map<THREE.Object3D, number>()
  const ballTemplates = new Map<GymSport, THREE.Object3D>()
  const ballLoads = new Set<GymSport>()
  const loader = createGltfLoader()
  const markers = new Map<string, THREE.Mesh>()
  let dribblers = new Set<string>()
  const targetRing = new THREE.Mesh(
    new THREE.RingGeometry(TARGET_RING_RADII[0], TARGET_RING_RADII[1], 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: TARGET_RING_COLOUR, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  )
  let jerseys = new Map<string, string>()
  let screen: { mesh: THREE.Mesh; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; text: string } | null = null
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
      ...COURT_FILES.map((url) => fetchJson(url).then((raw) => {
        courts.set(url, parseGymCourtView(raw))
      })),
    ]).then(() => undefined)
    loading.catch((error) => console.error('[gym] rules or court', error))
  }

  function loadBall(sport: GymSport): void {
    if (ballLoads.has(sport)) return
    ballLoads.add(sport)
    loader
      .loadAsync(BALL_MODEL_URL[sport])
      .then((gltf) => {
        const centre = new THREE.Box3().setFromObject(gltf.scene).getCenter(new THREE.Vector3())
        gltf.scene.position.sub(centre)
        const template = new THREE.Group()
        template.add(gltf.scene)
        ballTemplates.set(sport, template)
      })
      .catch((error: unknown) => console.error(`[gym] ${sport} ball model failed`, BALL_MODEL_URL[sport], error))
  }

  function meshFor(id: string, sport: GymSport): THREE.Object3D | null {
    const key = `${id}:${sport}`
    let mesh = meshes.get(key)
    if (!mesh) {
      loadBall(sport)
      const template = ballTemplates.get(sport)
      if (!template) return null
      mesh = template.clone()
      mesh.name = `gym_ball_${key}`
      meshes.set(key, mesh)
    }
    return mesh
  }

  function hideAll(except: ReadonlySet<THREE.Object3D> = new Set()): void {
    for (const mesh of [...meshes.values(), ...markers.values()]) if (!except.has(mesh)) mesh.removeFromParent()
  }

  function markerFor(key: string, tone: keyof typeof MARKER_COLOURS): THREE.Mesh {
    let marker = markers.get(key)
    if (!marker) {
      marker = new THREE.Mesh(
        new THREE.RingGeometry(MARKER_RADII[0], MARKER_RADII[1], 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: MARKER_COLOURS[tone], transparent: true, opacity: 0.85, depthWrite: false }),
      )
      marker.name = `gym_carrier_${key}`
      markers.set(key, marker)
    }
    return marker
  }

  function carrierSpot(owner: string): { x: number; z: number } | null {
    if (owner === mySessionId()) return { x: deps.myPosition.x, z: deps.myPosition.z }
    const avatar = deps.avatar(owner)
    return avatar ? { x: avatar.position.x, z: avatar.position.z } : null
  }

  function courtOf(courtOrVenue: string): GymCourtView | null {
    return courts.get(courtUrlOf(courtOrVenue)) ?? null
  }

  function placeMarker(shown: Set<THREE.Object3D>, owner: string | null, tone: keyof typeof MARKER_COLOURS, key: string, court: GymCourtView): void {
    if (!owner) return
    const spot = carrierSpot(owner)
    if (!spot) return
    const marker = markerFor(key, tone)
    marker.position.set(spot.x, court.floorY + 0.02, spot.z)
    shown.add(marker)
  }

  function show(next: GymBanner, ms = BANNER_MS): void {
    banner.value = next
    bannerUntil = Date.now() + ms
  }

  function send(kind: string): void {
    deps.gameRoomRef.value?.send('gym_action', { kind })
  }

  function onState(data: GymStatePayload): void {
    if (state.value?.venue !== data.venue) deps.play('gym_whistle')
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
    const move = data.sessionId ? moveFor(data, sportOfEvent(data)) : null
    if (move && data.sessionId) deps.sportsMove(data.sessionId, move)
    if (data.kind === 'score') {
      const sport = state.value?.sport ?? 'football'
      show({ kind: 'score', team: data.team, points: data.points, dunk: data.dunk, scorer: data.scorer, sport })
      if (sport === 'basketball') rimPopAt = { team: data.team, text: `+${data.points}`, until: Date.now() + RIM_POP_MS }
      deps.play(sport === 'football' ? 'gym_whistle' : 'gym_swish')
    } else if (data.kind === 'kick') {
      if (mine && data.release) {
        releaseLabel.value = data.release
        releaseUntil = Date.now() + RELEASE_LABEL_MS
      }
      soundAtBalls(data.shot || sportOfEvent(data) !== 'basketball' ? 'gym_kick' : 'gym_bounce')
    } else if (data.kind === 'half') {
      deps.play('gym_whistle')
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
    deps.play('gym_whistle')
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
    targetRing.removeFromParent()
    targetRing.geometry.dispose()
    targetRing.material.dispose()
    for (const marker of markers.values()) {
      marker.geometry.dispose()
      ;(marker.material as THREE.Material).dispose()
    }
    for (const template of ballTemplates.values()) disposeObject3D(template)
    if (screen) {
      screen.mesh.removeFromParent()
      screen.mesh.geometry.dispose()
      ;(screen.mesh.material as THREE.Material).dispose()
      screen.texture.dispose()
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
    const avatar = deps.avatar(sessionId)
    const bone = avatar?.getObjectByName(ANCHOR_BONE[sport])
    if (!avatar || !bone) return null
    bone.getWorldPosition(anchor)
    return { spot: { x: anchor.x, y: anchor.y, z: anchor.z }, yaw: avatar.rotation.y }
  }

  function place(mesh: THREE.Object3D, sport: GymSport, ball: GymStatePayload['ball'], owner: string | null, ageS: number, seconds: number, court: GymCourtView): void {
    const r = rules.value[sport]
    if (!r) return
    if (owner !== null) {
      const held = owner === mySessionId() && !deps.ownBodyShown() ? myAnchor(sport, court.floorY) : remoteAnchor(owner, sport)
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

  function dribbleSound(mesh: THREE.Object3D, seconds: number): void {
    const beat = dribbleBeat(seconds)
    if (dribbles.get(mesh) !== beat && dribbles.has(mesh)) deps.playOn('gym_bounce', mesh)
    dribbles.set(mesh, beat)
  }

  function updateRimPop(now: number): void {
    const baskets = state.value ? courtOf(state.value.venue)?.baskets ?? null : null
    if (!rimPopAt || now > rimPopAt.until || !baskets) {
      rimPopAt = null
      rimPop.value = null
      return
    }
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!camera || !canvas) return
    const basket = baskets[rimPopAt.team]
    const rise = 1 - (rimPopAt.until - now) / RIM_POP_MS
    projected.set(basket.x, basket.y + 0.4 + rise * RIM_POP_RISE_M, basket.z).project(camera)
    if (projected.z > 1) {
      rimPop.value = null
      return
    }
    rimPop.value = { text: rimPopAt.text, team: rimPopAt.team, x: ((projected.x + 1) / 2) * canvas.clientWidth, y: ((1 - projected.y) / 2) * canvas.clientHeight }
  }

  function updateDribblers(): void {
    const next = new Set<string>()
    if (state.value?.sport === 'basketball' && state.value.owner) next.add(state.value.owner)
    for (const ball of free.value?.balls ?? []) if (ball.sport === 'basketball' && ball.owner) next.add(ball.owner)
    for (const id of dribblers) if (!next.has(id)) deps.setDribbling(id, false)
    for (const id of next) if (!dribblers.has(id)) deps.setDribbling(id, true)
    dribblers = next
  }

  function updateJerseys(): void {
    const next = new Map<string, string>()
    for (const p of state.value?.players ?? []) next.set(p.sessionId, teamJerseyUrl(p.team))
    for (const id of jerseys.keys()) if (!next.has(id)) deps.setTopOverride(id, null)
    for (const [id, url] of next) if (jerseys.get(id) !== url) deps.setTopOverride(id, url)
    jerseys = next
  }

  function screenFor(scene: THREE.Scene, view: GymScreen) {
    if (screen) return screen
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = Math.round((512 * view.height) / view.width)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(view.width, view.height), new THREE.MeshBasicMaterial({ map: texture }))
    mesh.name = 'gym_scoreboard_screen'
    mesh.position.set(view.x, view.y, view.z)
    mesh.rotation.y = Math.atan2(view.facing[0], view.facing[1])
    scene.add(mesh)
    screen = { mesh, canvas, texture, text: '' }
    return screen
  }

  function drawScreen(scene: THREE.Scene, view: GymScreen): void {
    const current = state.value && courtUrlOf(state.value.venue) === courtUrlOf('gym') ? hud.value : null
    const lines = scoreboardLines(current ? { score: current.score, clock: current.clock, half: current.half, halves: current.halves } : null)
    const target = screenFor(scene, view)
    const text = lines.join('|')
    if (text === target.text) return
    target.text = text
    const ctx = target.canvas.getContext('2d')
    if (!ctx) throw new Error('gym scoreboard: no 2D canvas context')
    const { width, height } = target.canvas
    ctx.fillStyle = '#0d1014'
    ctx.fillRect(0, 0, width, height)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffb347'
    ctx.font = `bold ${Math.round(height * 0.42)}px sans-serif`
    ctx.fillText(lines[0], width / 2, height * 0.38)
    ctx.fillStyle = '#f4f2ec'
    ctx.font = `bold ${Math.round(height * 0.24)}px sans-serif`
    ctx.fillText(lines[1], width / 2, height * 0.78)
    if (current) {
      ctx.fillStyle = '#e0604a'
      ctx.fillRect(width * 0.06, height * 0.2, width * 0.05, height * 0.36)
      ctx.fillStyle = '#3f8fd1'
      ctx.fillRect(width * 0.89, height * 0.2, width * 0.05, height * 0.36)
    }
    target.texture.needsUpdate = true
  }

  function tick(): void {
    const now = Date.now()
    clientNow.value = now
    if (banner.value && now > bannerUntil) banner.value = null
    if (releaseLabel.value && now > releaseUntil) releaseLabel.value = null
    if (state.value && now - receivedAt > STALE_MS) state.value = null
    if (free.value && now - freeReceivedAt > STALE_MS) free.value = null
    updateRimPop(now)
    const scene = deps.getScene()
    const shown = new Set<THREE.Object3D>()
    const seconds = now / 1000
    const current = state.value
    const matchRules = current ? rules.value[current.sport] : undefined
    const matchCourt = current ? courtOf(current.venue) : null
    if (current && matchRules && matchCourt) {
      const mesh = meshFor(MATCH_BALL, current.sport)
      if (mesh) {
        place(mesh, current.sport, current.ball, current.owner, (now - receivedAt) / 1000, seconds, matchCourt)
        shown.add(mesh)
      }
      const ownerTeam = current.players.find((p) => p.sessionId === current.owner)?.team ?? null
      placeMarker(shown, current.owner, ownerTeam ?? 'free', `match:${ownerTeam ?? 'free'}`, matchCourt)
    }
    for (const ball of free.value?.balls ?? []) {
      const r = rules.value[ball.sport]
      const ballCourt = courtOf(ball.court)
      if (!r || !ballCourt) continue
      const mesh = meshFor(ball.id, ball.sport)
      if (mesh) {
        place(mesh, ball.sport, ball.ball, ball.owner, (now - freeReceivedAt) / 1000, seconds, ballCourt)
        shown.add(mesh)
      }
      placeMarker(shown, ball.owner, 'free', `free:${ball.id}`, ballCourt)
    }
    updateDribblers()
    updateJerseys()
    placeTargetRing(scene)
    const gymCourt = courtOf('gym')
    if (scene && gymCourt?.scoreboard) drawScreen(scene, gymCourt.scoreboard)
    hideAll(shown)
    if (scene) for (const mesh of shown) if (mesh.parent !== scene) scene.add(mesh)
  }

  const hud = computed(() => {
    const current = state.value
    if (!current) return null
    const remaining = current.endsAt - (clientNow.value + clockOffset)
    const r = rules.value[current.sport]
    const held = holdStartedAt.value
    const basket = shotTarget()
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
    const basket = shotTarget()
    const goodFrom = r && basket ? goodWindowStart(r.meter, Math.hypot(deps.myPosition.x - basket.x, deps.myPosition.z - basket.z)) : null
    return { sport: ball.sport, meter: r && held !== null ? { fill: meterFill(r.meter, clientNow.value - held), goodFrom } : null }
  })

  const myBall = computed(() => {
    const me = mySessionId()
    return free.value?.balls.find((b) => b.lender === me)?.sport ?? null
  })

  const down = () => downUntil.value > Date.now()

  function shotTarget(): HoopSpot | null {
    const current = state.value
    if (current) return current.sport === 'basketball' && team.value ? (courtOf(current.venue)?.baskets?.[team.value] ?? null) : null
    const ball = freeBallNearMe()
    const court = ball?.sport === 'basketball' ? courtOf(ball.court) : null
    return court ? hoopAhead(courtHoops(court), deps.myPosition, deps.yaw()) : null
  }

  function holdingBall(): boolean {
    const me = mySessionId()
    if (!me) return false
    return state.value ? state.value.owner === me : (free.value?.balls.some((b) => b.owner === me) ?? false)
  }

  function placeTargetRing(scene: THREE.Scene | undefined): void {
    const target = holdingBall() ? shotTarget() : null
    if (!scene || !target) {
      targetRing.removeFromParent()
      return
    }
    targetRing.position.set(target.x, target.y + TARGET_RING_ABOVE_RIM_M, target.z)
    if (targetRing.parent !== scene) scene.add(targetRing)
  }

  function cameraView(): SportsView | null {
    const me = mySessionId()
    const freeBall = state.value === null && (free.value?.balls.some((b) => b.owner === me || b.lender === me) ?? false)
    const inPlay = deps.pointerLocked.value && (team.value !== null || freeBall)
    return inPlay ? { kind: 'follow', sport: 'gym', optional: true, distance: CAMERA_DISTANCE_M, lift: CAMERA_LIFT_M, waterY: null } : null
  }

  return { hud, freeHud, banner, rimPop, releaseLabel, myBall, handlers: { onState, onEvent, onEnd, onFree, onError }, onPress, borrow, giveBack, down, tick, cameraView }
}
