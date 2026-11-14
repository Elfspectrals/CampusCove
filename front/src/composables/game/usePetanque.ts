import { computed, onUnmounted, ref, shallowRef, watch, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import {
  PETANQUE_SPORT,
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
  type PetanqueMode,
  type PetanqueStatePayload,
  type PetanqueThrowPayload,
} from '../../game/sports/petanque'
import { sportRulesUrl, type SportsTeam } from '../../game/sports/sportsSignup'
import type { SfxName } from '../../game/sfx'

const GROUND_Y = 0.06
const CIRCLE_RADIUS = 0.25
const MARKER_HEIGHT = 0.35
const BALL_SEGMENTS = 12
const CARREAU_FLASH_MS = 2500

export interface PetanqueDeps {
  gameRoomRef: ShallowRef<Room | null>
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.Camera | undefined
  myPosition: { x: number; z: number }
  pointerLocked: () => boolean
  say: (text: string) => void
  playSound: (name: SfxName) => void
  closedText: (data: PetanqueClosedPayload, mine: boolean) => string
}

interface Flight {
  shot: PetanqueThrowPayload
  startedAt: number
}

interface VenueScene {
  group: THREE.Group
  balls: Map<number, THREE.Mesh>
  circle: THREE.Mesh
  marker: THREE.Mesh
}

export function usePetanque(deps: PetanqueDeps) {
  const rules = shallowRef<PetanqueClientRules | null>(null)
  const games = shallowRef<ReadonlyMap<string, PetanqueStatePayload>>(new Map())
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
  const geometries = { boule: null as THREE.SphereGeometry | null, jack: null as THREE.SphereGeometry | null }
  const circleGeometry = new THREE.RingGeometry(CIRCLE_RADIUS - 0.03, CIRCLE_RADIUS, 24)
  const markerGeometry = new THREE.ConeGeometry(0.05, 0.12, 8)
  const materials = {
    red: new THREE.MeshStandardMaterial({ color: '#b9a3a0', metalness: 0.8, roughness: 0.35 }),
    blue: new THREE.MeshStandardMaterial({ color: '#a0a9b9', metalness: 0.8, roughness: 0.35 }),
    jack: new THREE.MeshStandardMaterial({ color: '#d9452f', roughness: 0.6 }),
    dead: new THREE.MeshStandardMaterial({ color: '#6b6f73', metalness: 0.5, roughness: 0.6 }),
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
    geometries.boule = new THREE.SphereGeometry(rules.value.bouleRadiusM, BALL_SEGMENTS, BALL_SEGMENTS / 2)
    geometries.jack = new THREE.SphereGeometry(rules.value.jackRadiusM, BALL_SEGMENTS, BALL_SEGMENTS / 2)
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

  function ballMaterial(ball: PetanqueBall): THREE.Material {
    if (ball.kind === 'jack') return materials.jack
    if (ball.dead) return materials.dead
    return ball.team === 'blue' ? materials.blue : materials.red
  }

  function radiusOf(kind: PetanqueBall['kind']): number {
    return kind === 'jack' ? rules.value!.jackRadiusM : rules.value!.bouleRadiusM
  }

  function placeBalls(state: PetanqueStatePayload): void {
    if (!rules.value) return
    const scene = sceneOf(state.venue)
    const ids = new Set(state.balls.map((b) => b.id))
    for (const [id, mesh] of scene.balls) {
      if (ids.has(id)) continue
      scene.group.remove(mesh)
      scene.balls.delete(id)
    }
    for (const ball of state.balls) {
      let mesh = scene.balls.get(ball.id)
      if (!mesh) {
        mesh = new THREE.Mesh(ball.kind === 'jack' ? geometries.jack! : geometries.boule!, ballMaterial(ball))
        mesh.castShadow = true
        scene.balls.set(ball.id, mesh)
        scene.group.add(mesh)
      }
      mesh.material = ballMaterial(ball)
      mesh.position.set(ball.x, GROUND_Y + radiusOf(ball.kind), ball.z)
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
    if (state.lastEnd && previous?.phase !== 'between' && state.phase === 'between') deps.playSound('market_sold')
  }

  function onThrow(shot: PetanqueThrowPayload): void {
    if (!rules.value) return
    const scene = sceneOf(shot.venue)
    let mesh = scene.balls.get(shot.ball)
    if (!mesh) {
      const ball = { id: shot.ball, kind: shot.kind, team: shot.team, owner: null, x: shot.from.x, z: shot.from.z, dead: false }
      mesh = new THREE.Mesh(shot.kind === 'jack' ? geometries.jack! : geometries.boule!, ballMaterial(ball))
      mesh.castShadow = true
      scene.balls.set(shot.ball, mesh)
      scene.group.add(mesh)
    }
    scene.marker.visible = false
    flights.set(shot.venue, { shot, startedAt: Date.now() })
    deps.playSound('whoosh')
    if (shot.carreau) carreauUntil.value = Date.now() + CARREAU_FLASH_MS
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
      if (mesh) mesh.position.set(x, mesh.position.y, z)
    }
    if (rolled < rollDurationMs(shot.frames)) return
    flights.delete(venue)
    deps.playSound('impact')
    const state = games.value.get(venue)
    if (state) placeBalls(state)
  }

  function tick(): void {
    const now = Date.now()
    clientNow.value = now
    for (const [venue, flight] of flights) animate(venue, flight, now)
    const game = myGame.value
    standingInCircle.value = game !== null && rules.value !== null && inCircle(deps.myPosition.x, deps.myPosition.z, game.circle, rules.value.circleReachM)
  }

  function canThrowNow(): boolean {
    const game = myGame.value
    return myTurn.value && standingInCircle.value && game !== null && Date.now() + clockOffset.value >= game.busyUntil
  }

  function onPointerDown(e: MouseEvent): boolean {
    if (!myTurn.value || e.button !== 0 || !deps.pointerLocked()) return false
    if (!canThrowNow()) return true
    deps.gameRoomRef.value?.send('petanque_aim', {})
    chargeStartedAt.value = Date.now()
    return true
  }

  function onMouseUp(e: MouseEvent): void {
    const game = myGame.value
    const camera = deps.getCamera()
    if (e.button !== 0 || chargeStartedAt.value === null || !game || !camera || !rules.value) return
    chargeStartedAt.value = null
    camera.getWorldDirection(forward)
    const yaw = throwYaw(forward.x, forward.z, game.circle.axisZ, rules.value.maxAimDeg)
    deps.gameRoomRef.value?.send('petanque_throw', { yaw, mode: game.phase === 'jack' ? 'point' : mode.value })
  }

  function onWheelStep(): boolean {
    if (!myTurn.value || myGame.value?.phase !== 'boules') return false
    mode.value = mode.value === 'point' ? 'shoot' : 'point'
    return true
  }

  function bindRoom(room: Room): void {
    room.onMessage('petanque_state', (data: PetanqueStatePayload) => onState(data))
    room.onMessage('petanque_throw', (data: PetanqueThrowPayload) => onThrow(data))
    room.onMessage('petanque_closed', (data: PetanqueClosedPayload) => onClosed(data))
  }

  watch(deps.gameRoomRef, (room) => {
    for (const venue of [...scenes.keys()]) onClosed({ venue, score: null, reason: 'forfeit' })
    if (room) bindRoom(room)
  })
  document.addEventListener('mouseup', onMouseUp)
  void loadRules().catch((error) => console.error('[petanque] rules not loaded:', error))
  onUnmounted(() => {
    document.removeEventListener('mouseup', onMouseUp)
    root.removeFromParent()
    circleGeometry.dispose()
    markerGeometry.dispose()
    geometries.boule?.dispose()
    geometries.jack?.dispose()
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

  return { myGame, myTeam, myTurn, standingInCircle, mode, power, carreau, turnSecondsLeft, busy, tick, onPointerDown, onWheelStep, mySessionId }
}
