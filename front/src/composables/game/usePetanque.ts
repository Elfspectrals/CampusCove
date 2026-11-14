import { computed, onUnmounted, ref, shallowRef, watch, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import {
  PETANQUE_SPORT,
  freePlayers,
  jackWatchers,
  flightPoint,
  inCircle,
  meterPower,
  parsePetanqueClientRules,
  rollDurationMs,
  rollPositions,
  throwYaw,
  type PetanqueBall,
  type PetanqueClientRules,
  type PetanqueClosedPayload,
  type PetanqueFreePayload,
  type PetanqueMode,
  type PetanqueStatePayload,
  type PetanqueThrowPayload,
} from '../../game/sports/petanque'
import { sportRulesUrl, type SportsTeam } from '../../game/sports/sportsSignup'
import type { SfxName } from '../../game/sfx'
import { createGltfLoader } from '../../game/gltfLoaderFactory'
import type { PetanqueClip } from '../../avatar/glbCharacter'
import { BOULE_STEEL, PETANQUE_BOULES_URL, petanquePieces } from '../../game/sports/petanqueModel'

const GROUND_Y = 0.06
const CIRCLE_RADIUS = 0.25
const MARKER_HEIGHT = 0.35
const HAND_GRIP = new THREE.Vector3(-0.032, 0, -0.1)
const HAND_SCALE = 1.15
const TINTS = { red: '#e8c6c0', blue: '#c4d0e8', dead: '#6b6f73' } as const
const CARREAU_FLASH_MS = 2500

export interface PetanqueDeps {
  gameRoomRef: ShallowRef<Room | null>
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.Camera | undefined
  myPosition: { x: number; z: number }
  pointerLocked: () => boolean
  say: (text: string) => void
  playSound: (name: SfxName) => void
  playSoundOn: (name: SfxName, object: THREE.Object3D, delayS?: number) => void
  closedText: (data: PetanqueClosedPayload, mine: boolean) => string
  rightHand: () => THREE.Object3D | null
  remoteHand: (sessionId: string) => THREE.Object3D | null
  throwArms: (mode: PetanqueMode) => void
  playRemote: (sessionId: string, clip: PetanqueClip) => void
  remotePosition: (sessionId: string) => { x: number; z: number } | null
  setCrouching: (sessionId: string, crouching: boolean) => void
}

type Look = 'jack' | keyof typeof TINTS

interface Held {
  look: Look
  object: THREE.Object3D
}

interface Flight {
  shot: PetanqueThrowPayload
  startedAt: number
  moved: Set<number>
}

interface VenueScene {
  group: THREE.Group
  balls: Map<number, THREE.Object3D>
  circle: THREE.Mesh
  marker: THREE.Mesh
}

export function usePetanque(deps: PetanqueDeps) {
  const rules = shallowRef<PetanqueClientRules | null>(null)
  const games = shallowRef<ReadonlyMap<string, PetanqueStatePayload>>(new Map())
  const frees = shallowRef<ReadonlyMap<string, PetanqueFreePayload>>(new Map())
  const freeVenue = ref<string | null>(null)
  const freeRings = new Map<string, THREE.Mesh>()
  const mode = ref<PetanqueMode>('point')
  const chargeStartedAt = ref<number | null>(null)
  const clientNow = ref(Date.now())
  const clockOffset = ref(0)
  const carreauUntil = ref(0)
  const flights = new Map<string, Flight>()
  const scenes = new Map<string, VenueScene>()
  const root = new THREE.Group()
  root.name = 'Petanque'
  const forward = new THREE.Vector3()
  const templates = shallowRef<Record<Look, THREE.Object3D> | null>(null)
  const held = new Map<string, Held>()
  const crouched = new Set<string>()
  const lastFreeThrow = new Map<string, { venue: string; at: number }>()
  const circleGeometry = new THREE.RingGeometry(CIRCLE_RADIUS - 0.03, CIRCLE_RADIUS, 24)
  const markerGeometry = new THREE.ConeGeometry(0.05, 0.12, 8)
  const materials = {
    circle: new THREE.MeshBasicMaterial({ color: '#f3f1ea', side: THREE.DoubleSide }),
    marker: new THREE.MeshBasicMaterial({ color: '#f2c14e' }),
  }

  function mySessionId(): string | null {
    return deps.gameRoomRef.value?.sessionId ?? null
  }

  const myGame = computed(() => {
    const me = mySessionId()
    for (const game of games.value.values()) if (game.players.some((p) => p.sessionId === me)) return game
    return null
  })
  const myTeam = computed<SportsTeam | null>(() => myGame.value?.players.find((p) => p.sessionId === mySessionId())?.team ?? null)
  const myTurn = computed(() => {
    const game = myGame.value
    return game !== null && game.phase !== 'between' && game.thrower === mySessionId()
  })
  const standingInCircle = ref(false)
  const power = computed(() => {
    const started = chargeStartedAt.value
    return started === null || !rules.value ? null : meterPower(clientNow.value - started, rules.value.riseMs)
  })

  async function loadRules(): Promise<void> {
    const url = sportRulesUrl(PETANQUE_SPORT)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    rules.value = parsePetanqueClientRules(await response.json())
  }

  function tinted(boule: THREE.Object3D, tint: string): THREE.Object3D {
    const copy = boule.clone()
    copy.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      const m = o.material as THREE.MeshStandardMaterial
      if (m.name !== BOULE_STEEL) return
      const t = m.clone()
      t.color.multiply(new THREE.Color(tint))
      o.material = t
    })
    return copy
  }

  async function loadModel(): Promise<void> {
    const gltf = await createGltfLoader().loadAsync(PETANQUE_BOULES_URL)
    const { boule, jack } = petanquePieces(gltf.scene)
    for (const o of [boule, jack]) o.traverse((c) => (c.castShadow = true))
    templates.value = { jack, red: tinted(boule, TINTS.red), blue: tinted(boule, TINTS.blue), dead: tinted(boule, TINTS.dead) }
    for (const venue of new Set([...games.value.keys(), ...frees.value.keys()])) {
      const view = viewOf(venue)
      if (view && !flights.has(venue)) placeBalls(view)
    }
  }

  function lookOf(ball: Pick<PetanqueBall, 'kind' | 'team' | 'dead'>): Look {
    if (ball.kind === 'jack') return 'jack'
    if (ball.dead) return 'dead'
    return ball.team === 'blue' ? 'blue' : 'red'
  }

  function ballObject(scene: VenueScene, id: number, look: Look): THREE.Object3D {
    const existing = scene.balls.get(id)
    if (existing?.userData.look === look) return existing
    existing?.removeFromParent()
    const object = templates.value![look].clone()
    object.userData.look = look
    scene.balls.set(id, object)
    scene.group.add(object)
    return object
  }

  function sceneOf(venue: string): VenueScene {
    let scene = scenes.get(venue)
    if (!scene) {
      const group = new THREE.Group()
      group.name = `Petanque_${venue}`
      const circle = new THREE.Mesh(circleGeometry, materials.circle)
      circle.rotation.x = -Math.PI / 2
      const marker = new THREE.Mesh(markerGeometry, materials.marker)
      marker.rotation.x = Math.PI
      marker.visible = false
      group.add(circle, marker)
      root.add(group)
      scene = { group, balls: new Map(), circle, marker }
      scenes.set(venue, scene)
    }
    if (!root.parent) deps.getScene()?.add(root)
    return scene
  }

  function radiusOf(kind: PetanqueBall['kind']): number {
    return kind === 'jack' ? rules.value!.jackRadiusM : rules.value!.bouleRadiusM
  }

  type BallsView = Pick<PetanqueStatePayload, 'venue' | 'balls' | 'circle' | 'point'>

  function viewOf(venue: string): BallsView | undefined {
    return games.value.get(venue) ?? frees.value.get(venue)
  }

  function placeBalls(state: BallsView): void {
    if (!rules.value || !templates.value) return
    const scene = sceneOf(state.venue)
    const ids = new Set(state.balls.map((b) => b.id))
    for (const [id, mesh] of scene.balls) {
      if (ids.has(id)) continue
      scene.group.remove(mesh)
      scene.balls.delete(id)
    }
    for (const ball of state.balls) {
      ballObject(scene, ball.id, lookOf(ball)).position.set(ball.x, GROUND_Y + radiusOf(ball.kind), ball.z)
    }
    scene.circle.position.set(state.circle.x, GROUND_Y + 0.005, state.circle.z)
    const point = state.point && scene.balls.get(state.point.ball)
    scene.marker.visible = Boolean(point)
    if (point) scene.marker.position.set(point.position.x, point.position.y + MARKER_HEIGHT, point.position.z)
  }

  function onState(state: PetanqueStatePayload): void {
    clockOffset.value = state.serverNow - Date.now()
    const previous = games.value.get(state.venue)
    games.value = new Map(games.value).set(state.venue, state)
    if (!flights.has(state.venue)) placeBalls(state)
    const me = mySessionId()
    if (state.thrower === me && previous?.thrower !== me && state.phase !== 'between') {
      deps.playSound('market_bell')
      if (state.phase === 'boules') mode.value = 'point'
    }
    if (state.lastEnd && previous?.phase !== 'between' && state.phase === 'between') {
      deps.playSound('petanque_point')
      const scorers = state.lastEnd.team
      for (const p of state.players) if (scorers && p.team === scorers && p.sessionId !== me && !p.out) deps.playRemote(p.sessionId, 'PetanqueCelebrate')
    }
  }

  function onThrow(shot: PetanqueThrowPayload): void {
    if (!rules.value || !templates.value) return
    const scene = sceneOf(shot.venue)
    if (!scene.balls.has(shot.ball)) ballObject(scene, shot.ball, lookOf({ kind: shot.kind, team: shot.team, dead: false }))
    scene.marker.visible = false
    flights.set(shot.venue, { shot, startedAt: Date.now(), moved: new Set([shot.ball]) })
    if (!games.value.has(shot.venue)) lastFreeThrow.set(shot.thrower, { venue: shot.venue, at: Date.now() })
    if (shot.thrower === mySessionId()) deps.throwArms(shot.mode)
    else deps.playRemote(shot.thrower, shot.mode === 'shoot' ? 'PetanqueShoot' : 'PetanquePoint')
    deps.playSound('whoosh')
    const thrown = scene.balls.get(shot.ball)
    if (thrown) deps.playSoundOn(shot.carreau ? 'petanque_carreau' : 'petanque_land', thrown, shot.airMs / 1000)
    if (shot.carreau) carreauUntil.value = Date.now() + CARREAU_FLASH_MS
  }

  function onFree(view: PetanqueFreePayload): void {
    clockOffset.value = view.serverNow - Date.now()
    frees.value = new Map(frees.value).set(view.venue, view)
    if (!flights.has(view.venue)) placeBalls(view)
  }

  function ensureFreeRings(): void {
    const r = rules.value
    if (!r || freeRings.size > 0) return
    for (const piste of r.pistes) {
      const ring = new THREE.Mesh(circleGeometry, materials.circle)
      ring.rotation.x = -Math.PI / 2
      ring.position.set(piste.freeCircle.x, GROUND_Y + 0.005, piste.freeCircle.z)
      root.add(ring)
      freeRings.set(piste.id, ring)
    }
  }

  function onClosed(data: PetanqueClosedPayload): void {
    const mine = myGame.value?.venue === data.venue
    const scene = scenes.get(data.venue)
    if (scene) {
      root.remove(scene.group)
      scenes.delete(data.venue)
    }
    flights.delete(data.venue)
    const next = new Map(games.value)
    next.delete(data.venue)
    games.value = next
    chargeStartedAt.value = null
    if (mine) deps.say(deps.closedText(data, mine))
  }

  function animate(venue: string, flight: Flight, now: number): void {
    const scene = scenes.get(venue)
    const r = rules.value
    if (!scene || !r) return
    const elapsed = now - flight.startedAt
    const { shot } = flight
    const thrown = scene.balls.get(shot.ball)
    if (elapsed < shot.airMs) {
      const apex = shot.mode === 'shoot' ? r.shootApexM : r.pointApexM
      const p = flightPoint(shot, apex, elapsed, GROUND_Y + radiusOf(shot.kind))
      thrown?.position.set(p.x, p.y, p.z)
      return
    }
    const rolled = elapsed - shot.airMs
    for (const [id, [x, z]] of rollPositions(shot.frames, rolled)) {
      const mesh = scene.balls.get(id)
      if (!mesh) continue
      if (!flight.moved.has(id) && (Math.abs(mesh.position.x - x) > 0.002 || Math.abs(mesh.position.z - z) > 0.002)) {
        flight.moved.add(id)
        deps.playSoundOn('petanque_clack', mesh)
      }
      mesh.position.set(x, mesh.position.y, z)
    }
    if (rolled < rollDurationMs(shot.frames)) return
    flights.delete(venue)
    const state = viewOf(venue)
    if (state) placeBalls(state)
  }

  function tick(): void {
    const now = Date.now()
    clientNow.value = now
    for (const [venue, flight] of flights) animate(venue, flight, now)
    const game = myGame.value
    const r = rules.value
    standingInCircle.value = game !== null && r !== null && inCircle(deps.myPosition.x, deps.myPosition.z, game.circle, r.circleReachM)
    if (!r) return
    if (!root.parent) deps.getScene()?.add(root)
    ensureFreeRings()
    for (const [id, ring] of freeRings) ring.visible = !games.value.has(id)
    const here = game ? undefined : r.pistes.find((p) => !games.value.has(p.id) && inCircle(deps.myPosition.x, deps.myPosition.z, p.freeCircle, r.circleReachM))
    freeVenue.value = here?.id ?? null
    syncHands()
    syncCrouching()
  }

  function syncCrouching(): void {
    const me = mySessionId()
    const wanted = new Set<string>()
    for (const game of games.value.values()) for (const id of jackWatchers(game, deps.remotePosition)) if (id !== me) wanted.add(id)
    for (const id of crouched) {
      if (wanted.has(id)) continue
      deps.setCrouching(id, false)
      crouched.delete(id)
    }
    for (const id of wanted) {
      if (crouched.has(id)) continue
      deps.setCrouching(id, true)
      crouched.add(id)
    }
  }

  function wantedHands(): Map<string, Look> {
    const wanted = new Map<string, Look>()
    const now = clientNow.value + clockOffset.value
    for (const game of games.value.values()) {
      if (game.phase === 'between' || !game.thrower || flights.has(game.venue) || now < game.busyUntil) continue
      const team = game.players.find((p) => p.sessionId === game.thrower)?.team
      wanted.set(game.thrower, game.phase === 'jack' ? 'jack' : team === 'blue' ? 'blue' : 'red')
    }
    const me = mySessionId()
    const r = rules.value
    if (r) {
      const circles = new Map(r.pistes.filter((p) => !games.value.has(p.id)).map((p) => [p.id, p.freeCircle]))
      for (const id of freePlayers(lastFreeThrow, circles, r.circleReachM, Date.now(), deps.remotePosition)) if (id !== me) wanted.set(id, 'red')
    }
    const venue = freeVenue.value
    if (me && venue && !myGame.value) {
      const free = frees.value.get(venue)
      if (!free || now >= free.busyUntil) wanted.set(me, freeHasJack(venue) ? 'red' : 'jack')
    }
    return wanted
  }

  function handOf(sessionId: string): THREE.Object3D | null {
    return sessionId === mySessionId() ? deps.rightHand() : deps.remoteHand(sessionId)
  }

  function syncHands(): void {
    const t = templates.value
    if (!t) return
    const wanted = wantedHands()
    for (const [id, h] of held) {
      const hand = handOf(id)
      if (hand && wanted.get(id) === h.look && h.object.parent === hand) continue
      h.object.removeFromParent()
      held.delete(id)
    }
    for (const [id, look] of wanted) {
      const hand = handOf(id)
      if (held.has(id) || !hand) continue
      const object = t[look].clone()
      if (id === mySessionId()) {
        object.position.copy(HAND_GRIP)
        object.scale.setScalar(HAND_SCALE)
      } else {
        hand.updateWorldMatrix(true, false)
        object.scale.setScalar(1 / hand.getWorldScale(new THREE.Vector3()).x)
      }
      hand.add(object)
      held.set(id, { look, object })
    }
  }

  function freeHasJack(venue: string): boolean {
    return frees.value.get(venue)?.balls.some((b) => b.kind === 'jack' && !b.dead) ?? false
  }

  function canThrowNow(): boolean {
    const game = myGame.value
    return myTurn.value && standingInCircle.value && game !== null && Date.now() + clockOffset.value >= game.busyUntil
  }

  function onPointerDown(e: MouseEvent): boolean {
    if (e.button !== 0 || !deps.pointerLocked()) return false
    if (!myGame.value && freeVenue.value) {
      const free = frees.value.get(freeVenue.value)
      if (free && Date.now() + clockOffset.value < free.busyUntil) return true
      deps.gameRoomRef.value?.send('petanque_aim', {})
      chargeStartedAt.value = Date.now()
      return true
    }
    if (!myTurn.value) return false
    if (!canThrowNow()) return true
    deps.gameRoomRef.value?.send('petanque_aim', {})
    chargeStartedAt.value = Date.now()
    return true
  }

  function onMouseUp(e: MouseEvent): void {
    const game = myGame.value
    const camera = deps.getCamera()
    if (e.button !== 0 || chargeStartedAt.value === null || !camera || !rules.value) return
    chargeStartedAt.value = null
    camera.getWorldDirection(forward)
    if (game) {
      const yaw = throwYaw(forward.x, forward.z, game.circle.axisZ, rules.value.maxAimDeg)
      deps.gameRoomRef.value?.send('petanque_throw', { yaw, mode: game.phase === 'jack' ? 'point' : mode.value })
      return
    }
    const venue = freeVenue.value
    if (!venue) return
    const yaw = throwYaw(forward.x, forward.z, -1, rules.value.maxAimDeg)
    deps.gameRoomRef.value?.send('petanque_throw', { yaw, mode: freeHasJack(venue) ? mode.value : 'point' })
  }

  function onWheelStep(): boolean {
    const freeWithJack = !myGame.value && freeVenue.value !== null && freeHasJack(freeVenue.value)
    if (!freeWithJack && (!myTurn.value || myGame.value?.phase !== 'boules')) return false
    mode.value = mode.value === 'point' ? 'shoot' : 'point'
    return true
  }

  function bindRoom(room: Room): void {
    room.onMessage('petanque_state', (data: PetanqueStatePayload) => onState(data))
    room.onMessage('petanque_throw', (data: PetanqueThrowPayload) => onThrow(data))
    room.onMessage('petanque_closed', (data: PetanqueClosedPayload) => onClosed(data))
    room.onMessage('petanque_free', (data: PetanqueFreePayload) => onFree(data))
  }

  watch(deps.gameRoomRef, (room) => {
    for (const venue of [...scenes.keys()]) onClosed({ venue, score: null, reason: 'forfeit' })
    frees.value = new Map()
    if (room) bindRoom(room)
  })
  document.addEventListener('mouseup', onMouseUp)
  void loadRules().catch((error) => console.error('[petanque] rules not loaded:', error))
  void loadModel().catch((error) => console.error('[petanque] boules model not loaded:', error))
  onUnmounted(() => {
    document.removeEventListener('mouseup', onMouseUp)
    root.removeFromParent()
    circleGeometry.dispose()
    markerGeometry.dispose()
    for (const h of held.values()) h.object.removeFromParent()
    for (const m of Object.values(materials)) m.dispose()
  })

  const carreau = computed(() => clientNow.value < carreauUntil.value)
  const turnSecondsLeft = computed(() => {
    const game = myGame.value
    return game ? Math.max(0, Math.ceil((game.turnEndsAt - clientNow.value - clockOffset.value) / 1000)) : 0
  })
  const busy = computed(() => {
    const game = myGame.value
    return game !== null && clientNow.value + clockOffset.value < game.busyUntil
  })

  const freePlay = computed(() => {
    const venue = freeVenue.value
    const r = rules.value
    if (!venue || !r) return null
    const view = frees.value.get(venue)
    const distances = (view?.distancesCm ?? []).slice(0, 4).map((d) => ({ ...d, point: view?.point?.ball === d.id }))
    return { piste: r.pistes.findIndex((p) => p.id === venue) + 1, kind: freeHasJack(venue) ? ('boule' as const) : ('jack' as const), distances, busy: view !== undefined && clientNow.value + clockOffset.value < view.busyUntil }
  })

  return { freePlay, myGame, myTeam, myTurn, standingInCircle, mode, power, carreau, turnSecondsLeft, busy, tick, onPointerDown, onWheelStep, mySessionId }
}
