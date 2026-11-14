import { computed, ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { createGltfLoader } from '../../game/gltfLoaderFactory'
import { configureRoomMeshShadows, normalizeRoomMaterials } from '../../game/sceneLighting'
import type { SfxName } from '../../game/sfx'
import { terrainHeightAt } from '../../game/town/terrainHeight'
import { EYE_HEIGHT } from '../../game/gameRoomConstants'
import { boardableBus, createBusTrack, inBusFrame, stopName, type BusId, type BusLineLayout, type BusSnapshot, type BusSyncPayload, type XZ } from '../../game/bus/townBus'
import type { WorldManifest } from '../../game/world/worldManifest'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const PROMPT_HEIGHT = 1.6

export interface TownBusRide {
  bus: BusId
  slot: XZ
  floorY: number
}

export interface TownBusHud {
  nextStop: string
  dockedAt: string | null
  departsInS: number
  gettingOffAt: string | null
}

export interface TownBusDeps {
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  myPosition: { x: number; y: number; z: number }
  promptsHidden: () => boolean
  canRide: () => boolean
  teleport: (x: number, y: number, z: number) => void
  playOn: (name: SfxName, object: THREE.Object3D) => void
  say: (text: string) => void
  t: (key: string, values?: Record<string, unknown>) => string
}

export function useTownBus(deps: TownBusDeps) {
  const line = shallowRef<BusLineLayout | null>(null)
  const buses = shallowRef<BusSnapshot[]>([])
  const ride = ref<TownBusRide | null>(null)
  const gettingOffAt = ref<string | null>(null)
  const riding = computed(() => ride.value !== null)
  const tracks = new Map<BusId, ReturnType<typeof createBusTrack>>()
  const meshes = new Map<BusId, THREE.Object3D>()
  const projection = new THREE.Vector3()
  const loader = createGltfLoader()
  let busTemplate: Promise<THREE.Object3D> | null = null

  async function loadModel(url: string): Promise<THREE.Object3D> {
    const gltf = await loader.loadAsync(url)
    configureRoomMeshShadows(gltf.scene)
    normalizeRoomMaterials(gltf.scene, 'city')
    return gltf.scene
  }

  async function onTownLoaded(manifest: WorldManifest): Promise<void> {
    const next = manifest.bus ?? null
    line.value = next
    if (!next) return
    const scene = deps.getScene()
    if (!scene) throw new Error('town bus: no scene')
    busTemplate ??= loadModel(next.busModelUrl)
    const [stops, bus] = await Promise.all([loadModel(next.modelUrl), busTemplate])
    stops.name = 'BusLine'
    scene.add(stops)
    for (const id of ['A', 'B'] as const) {
      if (meshes.has(id)) continue
      const copy = bus.clone()
      copy.name = `TownBus_${id}`
      copy.visible = false
      scene.add(copy)
      meshes.set(id, copy)
    }
  }

  function trackOf(id: BusId) {
    let track = tracks.get(id)
    if (!track) {
      track = createBusTrack()
      tracks.set(id, track)
    }
    return track
  }

  function onSync(data: BusSyncPayload): void {
    const now = performance.now()
    buses.value = data.buses
    for (const bus of data.buses) trackOf(bus.id).push(now, { x: bus.x, z: bus.z, yaw: bus.yaw })
  }

  function busOf(id: BusId): BusSnapshot | undefined {
    return buses.value.find((b) => b.id === id)
  }

  function playAtBus(id: BusId, name: SfxName): void {
    const mesh = meshes.get(id)
    if (mesh) deps.playOn(name, mesh)
  }

  function onBoarded(data: TownBusRide): void {
    ride.value = data
    gettingOffAt.value = null
    playAtBus(data.bus, 'door_open')
  }

  function onAlighted(data: { x: number; y: number; z: number }): void {
    const bus = ride.value?.bus
    ride.value = null
    gettingOffAt.value = null
    deps.teleport(data.x, terrainHeightAt(data.x, data.z) + EYE_HEIGHT, data.z)
    if (bus) playAtBus(bus, 'door_close')
  }

  function onLeft(): void {
    ride.value = null
    gettingOffAt.value = null
  }

  function bindRoom(room: Room): void {
    room.onMessage('bus_sync', onSync)
    room.onMessage('bus_boarded', onBoarded)
    room.onMessage('bus_alighted', onAlighted)
    room.onMessage('bus_left', onLeft)
    room.onMessage('bus_alight_planned', (data: { stop: string }) => {
      gettingOffAt.value = data.stop
    })
    room.onMessage('bus_error', (data: { reason: string }) => deps.say(deps.t(`bus.errors.${data.reason}`)))
  }

  watch(deps.gameRoomRef, (room) => {
    ride.value = null
    gettingOffAt.value = null
    if (room) bindRoom(room)
  }, { immediate: true })

  function tick(): void {
    const now = performance.now()
    for (const [id, mesh] of meshes) {
      const pose = tracks.get(id)?.poseAt(now)
      mesh.visible = pose !== null && pose !== undefined
      if (!pose) continue
      mesh.position.set(pose.x, terrainHeightAt(pose.x, pose.z), pose.z)
      mesh.rotation.set(0, pose.yaw, 0)
    }
    const current = ride.value
    if (!current) return
    const pose = tracks.get(current.bus)?.poseAt(now)
    if (!pose) return
    const seat = inBusFrame(pose, current.slot)
    const y = terrainHeightAt(seat.x, seat.z) + current.floorY + EYE_HEIGHT
    Object.assign(deps.myPosition, { x: seat.x, y, z: seat.z })
    deps.getCamera()?.position.set(seat.x, y, seat.z)
  }

  function projectToScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!camera || !canvas) return null
    projection.set(x, y, z).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height }
  }

  function boardTarget() {
    const stops = line.value?.stops
    if (!stops || riding.value || !deps.canRide()) return null
    return boardableBus(buses.value, stops, deps.myPosition)
  }

  function prompt(): ScreenPrompt | null {
    if (deps.promptsHidden()) return null
    const target = boardTarget()
    if (!target) return null
    const [x, z] = target.door
    const screen = projectToScreen(x, terrainHeightAt(x, z) + PROMPT_HEIGHT, z)
    const detail = deps.t('bus.boardDetail', { stop: stopName(line.value!.stops, target.bus.next), s: Math.ceil(target.bus.departsInMs / 1000) })
    return screen && { ...screen, action: deps.t('bus.board'), detail }
  }

  function interact(): boolean {
    const room = deps.gameRoomRef.value
    if (!room) return false
    if (ride.value) {
      room.send('bus_alight', {})
      return true
    }
    const target = boardTarget()
    if (!target) return false
    room.send('bus_board', { bus: target.bus.id })
    return true
  }

  function alightAt(stop: string): void {
    if (ride.value) deps.gameRoomRef.value?.send('bus_alight', { stop })
  }

  const hud = computed<TownBusHud | null>(() => {
    const current = ride.value
    const stops = line.value?.stops
    if (!current || !stops) return null
    const bus = busOf(current.bus)
    if (!bus) return null
    return {
      nextStop: stopName(stops, bus.next),
      dockedAt: bus.stop ? stopName(stops, bus.stop) : null,
      departsInS: Math.ceil(bus.departsInMs / 1000),
      gettingOffAt: gettingOffAt.value ? stopName(stops, gettingOffAt.value) : null,
    }
  })

  const stopsList = computed(() => line.value?.stops.map((stop) => ({ id: stop.id, name: stop.name })) ?? [])

  const source: InteractionSource = { prompt, interact }

  return { onTownLoaded, tick, source, riding, hud, stops: stopsList, alightAt }
}
