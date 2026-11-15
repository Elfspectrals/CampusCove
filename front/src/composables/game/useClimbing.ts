import { computed, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { matches } from '../../config/keybindings'
import { getGraphicsQuality } from '../../game/graphicsQuality'
import {
  climbSeconds,
  gripShare,
  holdMark,
  holdPosition,
  isOnWall,
  nearestStart,
  needleAngle,
  parseClimbingSpec,
  wallNormal,
  climbAnimation,
  type ClimbErrorPayload,
  type ClimbMove,
  type ClimbPose,
  type ClimbLine,
  type ClimbStatePayload,
  type ClimbingSpec,
} from '../../game/sports/climbing'
import { sportRulesUrl } from '../../game/sports/sportsSignup'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const HOLD_RADIUS = 0.11
const RING_RADIUS = 0.2
const RING_PULSE_MS = 900
const PROMPT_HEIGHT = 1.4
const CLICK_REACH = 6
const SPECTATOR_OPACITY = 0.45
const PUFF_PARTICLES = 14
const PUFF_SECONDS = 0.6
const PUFF_SPREAD = 0.35

export type ClimbSound = 'hold' | 'miss' | 'fall' | 'top'

export interface ClimbingDeps {
  myPosition: { x: number; y: number; z: number }
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  startPrompt: (line: ClimbLine) => { action: string; detail?: string }
  resultText: (state: ClimbStatePayload) => string
  errorText: (error: ClimbErrorPayload) => string
  say: (text: string) => void
  play: (sound: ClimbSound) => void
  animate: (sessionId: string, pose: ClimbPose, move: ClimbMove | null) => void
  animateSelf: (pose: ClimbPose, move: ClimbMove | null) => void
}

interface LineMeshes {
  line: ClimbLine
  mesh: THREE.InstancedMesh
}

type Ring = THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>

interface Puff {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  velocities: Float32Array
  age: number
}

export function useClimbing(deps: ClimbingDeps) {
  const spec = shallowRef<ClimbingSpec | null>(null)
  const climbs = shallowRef<ReadonlyMap<string, ClimbStatePayload>>(new Map())
  const clockOffset = ref(0)
  const clientNow = ref(Date.now())
  const lineMeshes = new Map<string, LineMeshes>()
  let group: THREE.Group | null = null
  let ring: Ring | null = null
  const spectatorRings = new Map<string, Ring>()
  const puffs: Puff[] = []
  let lastTickAt = performance.now()
  const raycaster = new THREE.Raycaster()
  const forward = new THREE.Vector3()
  const projection = new THREE.Vector3()
  const center = new THREE.Vector2(0, 0)

  function mySessionId(): string | null {
    return deps.gameRoomRef.value?.sessionId ?? null
  }

  const mine = computed(() => {
    const me = mySessionId()
    const state = me ? climbs.value.get(me) : undefined
    return isOnWall(state) ? state : null
  })
  const myLine = computed(() => (mine.value && spec.value ? spec.value.lines.find((l) => l.id === mine.value?.line) ?? null : null))
  const rival = computed(() => {
    const me = mySessionId()
    if (!mine.value?.duel) return null
    return [...climbs.value.values()].find((s) => s.duel && s.sessionId !== me && isOnWall(s)) ?? null
  })
  const hud = computed(() => {
    const state = mine.value
    const line = myLine.value
    if (!state || !line) return null
    const serverNow = clientNow.value + clockOffset.value
    return {
      name: line.name,
      colour: line.colour,
      hex: line.hex,
      kind: line.kind,
      phase: state.phase,
      grip: gripShare(state, serverNow),
      recovering: state.gripPerSec > 0,
      check: state.check ? { angle: needleAngle(state.check, serverNow), zoneStart: state.check.zoneStart, zoneSize: state.check.zoneSize, greatSize: state.check.greatSize } : null,
      reached: state.next,
      holds: state.holds,
      seconds: climbSeconds(state, serverNow),
      duel: state.duel,
      rival: rival.value ? { reached: rival.value.next, holds: rival.value.holds } : null,
      waiting: serverNow < state.readyAt,
      startsIn: Math.max(0, Math.ceil((state.readyAt - serverNow) / 1000)),
    }
  })

  function buildHolds(scene: THREE.Scene, loaded: ClimbingSpec): void {
    group = new THREE.Group()
    group.name = 'ClimbingHolds'
    const geometry = new THREE.IcosahedronGeometry(HOLD_RADIUS, 0)
    geometry.scale(1.3, 0.9, 0.7)
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3(1, 1, 1)
    const at = new THREE.Vector3()
    for (const line of loaded.lines) {
      const material = new THREE.MeshStandardMaterial({ color: line.hex, roughness: 0.7, emissive: line.hex, emissiveIntensity: 0.08 })
      const mesh = new THREE.InstancedMesh(geometry, material, line.holds.length)
      const n = wallNormal(line)
      quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(n.x, n.z))
      line.holds.forEach((_, i) => {
        const p = holdPosition(loaded, line, i)
        mesh.setMatrixAt(i, matrix.compose(at.set(p.x, p.y, p.z), quaternion, scale))
      })
      mesh.name = `ClimbingHolds_${line.id}`
      mesh.userData.climbLine = line.id
      mesh.computeBoundingSphere()
      group.add(mesh)
      lineMeshes.set(line.id, { line, mesh })
    }
    ring = makeRing(0.9)
    scene.add(group)
  }

  function makeRing(opacity: number): Ring {
    const made: Ring = new THREE.Mesh(new THREE.TorusGeometry(RING_RADIUS, 0.018, 6, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity, depthTest: false }))
    made.renderOrder = 10
    made.visible = false
    group?.add(made)
    return made
  }

  function lineOf(state: ClimbStatePayload): ClimbLine | null {
    return lineMeshes.get(state.line)?.line ?? null
  }

  function placeRing(target: Ring, state: ClimbStatePayload, line: ClimbLine, serverNow: number): void {
    if (!spec.value || state.phase !== 'climbing' || state.next >= line.holds.length) {
      target.visible = false
      return
    }
    const mark = holdMark(state, serverNow)
    target.visible = mark !== 'waiting'
    if (!target.visible) return
    const p = holdPosition(spec.value, line, state.next)
    const n = wallNormal(line)
    target.position.set(p.x + n.x * 0.05, p.y, p.z + n.z * 0.05)
    target.rotation.set(0, Math.atan2(n.x, n.z), 0)
    target.scale.setScalar(mark === 'checking' ? 1 : 1.25 + 0.25 * Math.sin((serverNow / RING_PULSE_MS) * 2 * Math.PI))
    target.material.color.set(mark === 'checking' ? '#ffffff' : '#ffe066')
  }

  function spawnPuff(state: ClimbStatePayload): void {
    const line = lineOf(state)
    if (!group || !spec.value || !line || state.next < 1 || getGraphicsQuality() === 'low') return
    const p = holdPosition(spec.value, line, Math.min(state.next, line.holds.length) - 1)
    const positions = new Float32Array(PUFF_PARTICLES * 3)
    const velocities = new Float32Array(PUFF_PARTICLES * 3)
    const n = wallNormal(line)
    for (let i = 0; i < PUFF_PARTICLES; i++) {
      positions.set([p.x, p.y, p.z], i * 3)
      const a = Math.random() * Math.PI * 2
      velocities.set([Math.cos(a) * PUFF_SPREAD + n.x * 0.3, Math.random() * 0.4 - 0.1, Math.sin(a) * PUFF_SPREAD + n.z * 0.3], i * 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#f4f1ea', size: 0.06, transparent: true, opacity: 0.85, depthWrite: false }))
    group.add(points)
    puffs.push({ points, velocities, age: 0 })
  }

  function tickPuffs(dt: number): void {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const puff = puffs[i]!
      puff.age += dt
      const attribute = puff.points.geometry.getAttribute('position') as THREE.BufferAttribute
      const array = attribute.array as Float32Array
      for (let k = 0; k < array.length; k++) array[k]! += puff.velocities[k]! * dt
      attribute.needsUpdate = true
      puff.points.material.opacity = 0.85 * Math.max(0, 1 - puff.age / PUFF_SECONDS)
      if (puff.age < PUFF_SECONDS) continue
      group?.remove(puff.points)
      puff.points.geometry.dispose()
      puff.points.material.dispose()
      puffs.splice(i, 1)
    }
  }

  function tickSpectatorRings(serverNow: number): void {
    const me = mySessionId()
    for (const [sessionId, target] of spectatorRings) {
      if (climbs.value.has(sessionId)) continue
      group?.remove(target)
      target.geometry.dispose()
      target.material.dispose()
      spectatorRings.delete(sessionId)
    }
    for (const state of climbs.value.values()) {
      const line = lineOf(state)
      if (state.sessionId === me || !line) continue
      let target = spectatorRings.get(state.sessionId)
      if (!target) {
        target = makeRing(SPECTATOR_OPACITY)
        spectatorRings.set(state.sessionId, target)
      }
      placeRing(target, state, line, serverNow)
    }
  }

  async function load(): Promise<void> {
    const url = sportRulesUrl('climbing')
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    spec.value = parseClimbingSpec(await response.json())
  }

  function onTownLoaded(): void {
    const scene = deps.getScene()
    if (!scene || group) return
    void load().then(
      () => {
        if (spec.value && !group) buildHolds(scene, spec.value)
      },
      (err: unknown) => console.error('[climbing] rules failed to load', err),
    )
  }

  function startLine(): ClimbLine | null {
    if (!spec.value || mine.value) return null
    return nearestStart(spec.value, deps.myPosition.x, deps.myPosition.z)
  }

  function prompt(): ScreenPrompt | null {
    if (deps.promptsHidden()) return null
    const line = startLine()
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!line || !camera || !canvas || !spec.value) return null
    camera.getWorldDirection(forward)
    const n = wallNormal(line)
    if (forward.x * n.x + forward.z * n.z > -0.3) return null
    projection.set(line.base.x, spec.value.floorY + PROMPT_HEIGHT, line.base.z).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height, ...deps.startPrompt(line) }
  }

  function interact(): boolean {
    const room = deps.gameRoomRef.value
    const line = startLine()
    if (!room || !line || prompt() === null) return false
    room.send('climb_start', { line: line.id })
    return true
  }

  function aimedHold(): number {
    const camera = deps.getCamera()
    const entry = mine.value ? lineMeshes.get(mine.value.line) : undefined
    if (!camera || !entry) return -1
    raycaster.setFromCamera(center, camera)
    raycaster.far = CLICK_REACH
    const hit = raycaster.intersectObject(entry.mesh, false)[0]
    return hit?.instanceId ?? -1
  }

  function onMouseDown(button: number): boolean {
    const state = mine.value
    if (!state) return false
    if (button !== 0 || state.phase !== 'climbing') return true
    if (state.check) deps.gameRoomRef.value?.send('climb_check', {})
    else deps.gameRoomRef.value?.send('climb_hold', { hold: aimedHold() })
    return true
  }

  function onKeyDown(e: KeyboardEvent): boolean {
    if (!mine.value) return false
    if (!matches('jump', e.code)) return false
    e.preventDefault()
    if (e.repeat || mine.value.phase !== 'climbing') return true
    deps.gameRoomRef.value?.send(mine.value.check ? 'climb_check' : 'climb_let_go', {})
    return true
  }

  function tick(): void {
    const now = performance.now()
    const dt = Math.min(0.1, (now - lastTickAt) / 1000)
    lastTickAt = now
    clientNow.value = Date.now()
    if (!ring) return
    const serverNow = clientNow.value + clockOffset.value
    const state = mine.value
    const line = myLine.value
    if (state && line) placeRing(ring, state, line, serverNow)
    else ring.visible = false
    tickSpectatorRings(serverNow)
    tickPuffs(dt)
  }

  function soundFor(state: ClimbStatePayload): ClimbSound | null {
    if (state.event === 'hold' || state.event === 'great') return 'hold'
    if (state.event === 'miss') return 'miss'
    if (state.event === 'fall') return 'fall'
    if (state.event === 'top') return 'top'
    return null
  }

  const handlers = {
    onState(data: ClimbStatePayload): void {
      clockOffset.value = data.serverNow - Date.now()
      const next = new Map(climbs.value)
      if (data.phase === 'ended') next.delete(data.sessionId)
      else next.set(data.sessionId, data)
      climbs.value = next
      if (data.event === 'hold' || data.event === 'great' || data.event === 'top') spawnPuff(data)
      const { pose, move } = climbAnimation(data, lineOf(data))
      if (data.sessionId === mySessionId()) deps.animateSelf(pose, move)
      else deps.animate(data.sessionId, pose, move)
      if (data.sessionId !== mySessionId()) return
      const sound = soundFor(data)
      if (sound) deps.play(sound)
      if (data.phase === 'ended') deps.say(deps.resultText(data))
    },
    onError(data: ClimbErrorPayload): void {
      deps.say(deps.errorText(data))
    },
    onRoomJoined(): void {
      climbs.value = new Map()
      deps.animateSelf(null, null)
    },
  }

  return {
    spec,
    hud,
    climbing: computed(() => mine.value !== null),
    onTownLoaded,
    onMouseDown,
    onKeyDown,
    tick,
    source: { prompt, interact } as InteractionSource,
    handlers,
  }
}
