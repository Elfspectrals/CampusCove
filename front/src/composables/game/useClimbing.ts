import { computed, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { matches } from '../../config/keybindings'
import {
  climbSeconds,
  gripShare,
  holdPosition,
  isOnWall,
  nearestStart,
  parseClimbingSpec,
  ringStage,
  wallNormal,
  type ClimbErrorPayload,
  type ClimbLine,
  type ClimbStatePayload,
  type ClimbingSpec,
} from '../../game/sports/climbing'
import { sportRulesUrl } from '../../game/sports/sportsSignup'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const HOLD_RADIUS = 0.11
const RING_RADIUS = 0.2
const PROMPT_HEIGHT = 1.4
const CLICK_REACH = 6

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
}

interface LineMeshes {
  line: ClimbLine
  mesh: THREE.InstancedMesh
}

export function useClimbing(deps: ClimbingDeps) {
  const spec = shallowRef<ClimbingSpec | null>(null)
  const climbs = shallowRef<ReadonlyMap<string, ClimbStatePayload>>(new Map())
  const clockOffset = ref(0)
  const clientNow = ref(Date.now())
  const lineMeshes = new Map<string, LineMeshes>()
  let group: THREE.Group | null = null
  let ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial> | null = null
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
      grip: gripShare(state),
      reached: state.next,
      holds: state.holds,
      seconds: climbSeconds(state, serverNow),
      duel: state.duel,
      rival: rival.value ? { reached: rival.value.next, holds: rival.value.holds } : null,
      waiting: serverNow < state.litAt,
      startsIn: Math.max(0, Math.ceil((state.litAt - serverNow) / 1000)),
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
    ring = new THREE.Mesh(new THREE.TorusGeometry(RING_RADIUS, 0.018, 6, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false }))
    ring.renderOrder = 10
    ring.visible = false
    group.add(ring)
    scene.add(group)
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
    if (button === 0 && state.phase === 'climbing') deps.gameRoomRef.value?.send('climb_hold', { hold: aimedHold() })
    return true
  }

  function onKeyDown(e: KeyboardEvent): boolean {
    if (!mine.value) return false
    if (!matches('jump', e.code)) return false
    e.preventDefault()
    if (mine.value.phase === 'climbing') deps.gameRoomRef.value?.send('climb_let_go', {})
    return true
  }

  function tick(): void {
    clientNow.value = Date.now()
    if (!ring) return
    const state = mine.value
    const line = myLine.value
    if (!state || !line || !spec.value || state.phase !== 'climbing' || state.next >= line.holds.length) {
      ring.visible = false
      return
    }
    const { stage, scale } = ringStage(state, clientNow.value + clockOffset.value)
    ring.visible = stage !== 'waiting'
    if (!ring.visible) return
    const p = holdPosition(spec.value, line, state.next)
    const n = wallNormal(line)
    ring.position.set(p.x + n.x * 0.05, p.y, p.z + n.z * 0.05)
    ring.rotation.set(0, Math.atan2(n.x, n.z), 0)
    ring.scale.setScalar(scale)
    ring.material.color.set(stage === 'open' ? '#ffe066' : stage === 'late' ? '#ff5a5a' : line.hex)
  }

  function soundFor(state: ClimbStatePayload): ClimbSound | null {
    if (state.event === 'hold') return 'hold'
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
    },
  }

  return {
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
