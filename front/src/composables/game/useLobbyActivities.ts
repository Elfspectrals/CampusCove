import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  type Ref,
} from 'vue'
import {
  FALLBACK_COVE_RUSH_CONFIG,
  parseCoveRushConfig,
  parseCoveRushError,
  parseCoveRushFinishedState,
  parseCoveRushQueueState,
  parseCoveRushRunState,
  type CoveRushConfig,
  type CoveRushErrorState,
  type CoveRushFinishedState,
  type CoveRushParticleLevel,
  type CoveRushQueueState,
  type CoveRushRunState,
  type CoveRushWorldPoint,
} from '../../game/lobbyActivities'

const HUB_CYAN = 0x22d3ee
const HUB_FUCHSIA = 0xe879f9
const HUB_NAVY = 0x071326
const MAX_CONFETTI = 64
const MAX_HUB_MOTES = 40
const MAX_TARGET_MOTES = 32

export interface LobbyActivitiesDeps {
  getScene: () => THREE.Scene | undefined
  getRoom: () => Room | null
  myPosition: { x: number; y: number; z: number }
  currentRoomLabel: Ref<'city' | 'apartment'>
  getParticleLevel: () => CoveRushParticleLevel
}

interface CoveRushVisuals {
  root: THREE.Group
  hubRing: THREE.Mesh
  hubCore: THREE.Mesh
  beacon: THREE.Mesh
  targetGroup: THREE.Group
  targetOrb: THREE.Mesh
  targetRing: THREE.Mesh
  targetGroundRing: THREE.Mesh
  routeMarkers: THREE.Mesh[]
  routeIdleMaterial: THREE.MeshStandardMaterial
  routeCompleteMaterial: THREE.MeshStandardMaterial
  hubMotes: THREE.Points
  targetMotes: THREE.Points
  confetti: THREE.Points
  confettiPositions: Float32Array
  confettiVelocities: Float32Array
  geometries: Set<THREE.BufferGeometry>
  materials: Set<THREE.Material>
  textures: Set<THREE.Texture>
  elapsed: number
  confettiAge: number
}

function cloneFallbackConfig(): CoveRushConfig {
  return {
    ...FALLBACK_COVE_RUSH_CONFIG,
    hub: { ...FALLBACK_COVE_RUSH_CONFIG.hub },
    route: FALLBACK_COVE_RUSH_CONFIG.route.map((checkpoint) => ({
      ...checkpoint,
    })),
  }
}

function createPointGeometry(
  count: number,
  radius: number,
  height: number,
): THREE.BufferGeometry {
  const positions = new Float32Array(count * 3)
  for (let index = 0; index < count; index += 1) {
    const ratio = index / count
    const angle = index * 2.399963229728653
    const radial = radius * (0.35 + 0.65 * ((index * 17) % count) / count)
    positions[index * 3] = Math.cos(angle) * radial
    positions[index * 3 + 1] = 0.25 + ratio * height
    positions[index * 3 + 2] = Math.sin(angle) * radial
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setDrawRange(0, 0)
  return geometry
}

function createSignTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) return null

  const gradient = context.createLinearGradient(0, 0, canvas.width, 0)
  gradient.addColorStop(0, '#22d3ee')
  gradient.addColorStop(1, '#e879f9')
  context.fillStyle = 'rgba(3, 10, 25, 0.94)'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = gradient
  context.lineWidth = 14
  context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20)
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.shadowColor = '#22d3ee'
  context.shadowBlur = 20
  context.fillStyle = '#f8fafc'
  context.font = '800 76px system-ui, sans-serif'
  context.fillText('COVE RUSH', canvas.width / 2, 96)
  context.shadowBlur = 0
  context.fillStyle = '#a5f3fc'
  context.font = '700 31px system-ui, sans-serif'
  context.fillText('ORB RUSH  •  SOLO  •  1v1', canvas.width / 2, 177)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

function createCoveRushVisuals(config: CoveRushConfig): CoveRushVisuals {
  const root = new THREE.Group()
  root.name = 'CoveRushActivity'
  root.renderOrder = 2

  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  const ownGeometry = <T extends THREE.BufferGeometry>(geometry: T): T => {
    geometries.add(geometry)
    return geometry
  }
  const ownMaterial = <T extends THREE.Material>(material: T): T => {
    materials.add(material)
    return material
  }

  const hubGroup = new THREE.Group()
  hubGroup.position.set(config.hub.x, config.hub.y, config.hub.z)
  root.add(hubGroup)

  const padGeometry = ownGeometry(
    new THREE.CylinderGeometry(3.45, 3.7, 0.18, 48),
  )
  const padMaterial = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: HUB_NAVY,
      emissive: 0x082f49,
      emissiveIntensity: 0.55,
      metalness: 0.55,
      roughness: 0.28,
    }),
  )
  const hubCore = new THREE.Mesh(padGeometry, padMaterial)
  hubCore.position.y = 0.08
  hubCore.receiveShadow = true
  hubGroup.add(hubCore)

  const hubRingGeometry = ownGeometry(new THREE.TorusGeometry(3.55, 0.09, 8, 64))
  const hubRingMaterial = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: HUB_CYAN,
      emissive: HUB_CYAN,
      emissiveIntensity: 2,
      metalness: 0.25,
      roughness: 0.2,
    }),
  )
  const hubRing = new THREE.Mesh(hubRingGeometry, hubRingMaterial)
  hubRing.position.y = 0.2
  hubRing.rotation.x = Math.PI / 2
  hubGroup.add(hubRing)

  const insetRing = new THREE.Mesh(
    ownGeometry(new THREE.TorusGeometry(2.55, 0.035, 6, 64)),
    ownMaterial(
      new THREE.MeshBasicMaterial({
        color: HUB_FUCHSIA,
        transparent: true,
        opacity: 0.72,
        toneMapped: false,
      }),
    ),
  )
  insetRing.position.y = 0.19
  insetRing.rotation.x = Math.PI / 2
  hubGroup.add(insetRing)

  const beacon = new THREE.Mesh(
    ownGeometry(new THREE.CylinderGeometry(0.035, 0.12, 4.6, 12, 1, true)),
    ownMaterial(
      new THREE.MeshBasicMaterial({
        color: HUB_CYAN,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    ),
  )
  beacon.position.y = 2.35
  hubGroup.add(beacon)

  const beaconCap = new THREE.Mesh(
    ownGeometry(new THREE.OctahedronGeometry(0.24, 0)),
    ownMaterial(
      new THREE.MeshBasicMaterial({
        color: HUB_FUCHSIA,
        toneMapped: false,
      }),
    ),
  )
  beaconCap.position.y = 4.55
  hubGroup.add(beaconCap)

  const signTexture = createSignTexture()
  if (signTexture) {
    textures.add(signTexture)
    const signMaterial = ownMaterial(
      new THREE.SpriteMaterial({
        map: signTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    const sign = new THREE.Sprite(signMaterial)
    sign.position.set(0, 3.15, 0)
    sign.scale.set(5.4, 1.8, 1)
    hubGroup.add(sign)
  }

  const hubMoteGeometry = ownGeometry(
    createPointGeometry(MAX_HUB_MOTES, 3.25, 2.8),
  )
  const moteMaterial = ownMaterial(
    new THREE.PointsMaterial({
      color: HUB_CYAN,
      size: 0.095,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  )
  const hubMotes = new THREE.Points(hubMoteGeometry, moteMaterial)
  hubGroup.add(hubMotes)

  const routeIdleMaterial = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x164e63,
      emissive: 0x083344,
      emissiveIntensity: 0.65,
      transparent: true,
      opacity: 0.48,
      roughness: 0.38,
      metalness: 0.25,
    }),
  )
  const routeCompleteMaterial = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: HUB_FUCHSIA,
      emissive: HUB_FUCHSIA,
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 0.85,
      roughness: 0.25,
    }),
  )
  const routeGeometry = ownGeometry(new THREE.TorusGeometry(1, 0.055, 8, 40))
  const routeMarkers = config.route.map((checkpoint) => {
    const marker = new THREE.Mesh(routeGeometry, routeIdleMaterial)
    marker.position.set(checkpoint.x, checkpoint.y + 0.045, checkpoint.z)
    marker.rotation.x = Math.PI / 2
    marker.scale.setScalar(checkpoint.radius)
    marker.userData.coveRushCheckpointIndex = checkpoint.index
    root.add(marker)
    return marker
  })

  const targetGroup = new THREE.Group()
  targetGroup.name = 'CoveRushAuthoritativeTarget'
  targetGroup.visible = false
  root.add(targetGroup)

  const targetOrb = new THREE.Mesh(
    ownGeometry(new THREE.IcosahedronGeometry(0.46, 2)),
    ownMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xecfeff,
        emissive: HUB_CYAN,
        emissiveIntensity: 3.4,
        metalness: 0.15,
        roughness: 0.12,
      }),
    ),
  )
  targetOrb.castShadow = true
  targetGroup.add(targetOrb)

  const targetRing = new THREE.Mesh(
    ownGeometry(new THREE.TorusGeometry(0.76, 0.045, 8, 48)),
    ownMaterial(
      new THREE.MeshBasicMaterial({
        color: HUB_FUCHSIA,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    ),
  )
  targetGroup.add(targetRing)

  const targetGroundRing = new THREE.Mesh(
    ownGeometry(new THREE.TorusGeometry(1, 0.045, 8, 48)),
    ownMaterial(
      new THREE.MeshBasicMaterial({
        color: HUB_CYAN,
        transparent: true,
        opacity: 0.8,
        toneMapped: false,
      }),
    ),
  )
  targetGroundRing.position.y = -0.76
  targetGroundRing.rotation.x = Math.PI / 2
  targetGroup.add(targetGroundRing)

  const targetBeam = new THREE.Mesh(
    ownGeometry(new THREE.CylinderGeometry(0.035, 0.16, 4.7, 12, 1, true)),
    ownMaterial(
      new THREE.MeshBasicMaterial({
        color: HUB_FUCHSIA,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    ),
  )
  targetBeam.position.y = 1.6
  targetGroup.add(targetBeam)

  const targetMoteGeometry = ownGeometry(
    createPointGeometry(MAX_TARGET_MOTES, 1.1, 1.6),
  )
  const targetMotes = new THREE.Points(
    targetMoteGeometry,
    ownMaterial(
      new THREE.PointsMaterial({
        color: HUB_FUCHSIA,
        size: 0.11,
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    ),
  )
  targetMotes.position.y = -0.7
  targetGroup.add(targetMotes)

  const confettiPositions = new Float32Array(MAX_CONFETTI * 3)
  const confettiVelocities = new Float32Array(MAX_CONFETTI * 3)
  const confettiColors = new Float32Array(MAX_CONFETTI * 3)
  const cyan = new THREE.Color(HUB_CYAN)
  const fuchsia = new THREE.Color(HUB_FUCHSIA)
  for (let index = 0; index < MAX_CONFETTI; index += 1) {
    const color = index % 2 === 0 ? cyan : fuchsia
    confettiColors[index * 3] = color.r
    confettiColors[index * 3 + 1] = color.g
    confettiColors[index * 3 + 2] = color.b
  }
  const confettiGeometry = ownGeometry(new THREE.BufferGeometry())
  confettiGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(confettiPositions, 3),
  )
  confettiGeometry.setAttribute(
    'color',
    new THREE.BufferAttribute(confettiColors, 3),
  )
  confettiGeometry.setDrawRange(0, 0)
  const confetti = new THREE.Points(
    confettiGeometry,
    ownMaterial(
      new THREE.PointsMaterial({
        vertexColors: true,
        size: 0.13,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    ),
  )
  root.add(confetti)

  return {
    root,
    hubRing,
    hubCore,
    beacon,
    targetGroup,
    targetOrb,
    targetRing,
    targetGroundRing,
    routeMarkers,
    routeIdleMaterial,
    routeCompleteMaterial,
    hubMotes,
    targetMotes,
    confetti,
    confettiPositions,
    confettiVelocities,
    geometries,
    materials,
    textures,
    elapsed: 0,
    confettiAge: Number.POSITIVE_INFINITY,
  }
}

function disposeCoveRushVisuals(visuals: CoveRushVisuals): void {
  visuals.root.removeFromParent()
  for (const geometry of visuals.geometries) geometry.dispose()
  for (const material of visuals.materials) material.dispose()
  for (const texture of visuals.textures) texture.dispose()
  visuals.root.clear()
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function particleCount(
  level: CoveRushParticleLevel,
  low: number,
  high: number,
): number {
  if (prefersReducedMotion() || level === 'off') return 0
  return level === 'high' ? high : low
}

function triggerAuthoritativeConfetti(
  visuals: CoveRushVisuals,
  config: CoveRushConfig,
  level: CoveRushParticleLevel,
): void {
  const count = particleCount(level, 24, MAX_CONFETTI)
  visuals.confetti.geometry.setDrawRange(0, count)
  visuals.confettiAge = count > 0 ? 0 : Number.POSITIVE_INFINITY

  const target = visuals.targetGroup.visible
    ? visuals.targetGroup.position
    : config.hub
  for (let index = 0; index < count; index += 1) {
    const angle = index * 2.399963229728653
    const radial = 0.15 + (index % 7) * 0.055
    visuals.confettiPositions[index * 3] =
      target.x + Math.cos(angle) * radial
    visuals.confettiPositions[index * 3 + 1] =
      target.y + 0.25 + (index % 5) * 0.07
    visuals.confettiPositions[index * 3 + 2] =
      target.z + Math.sin(angle) * radial
    visuals.confettiVelocities[index * 3] = Math.cos(angle) * (1.1 + radial)
    visuals.confettiVelocities[index * 3 + 1] = 2.5 + (index % 6) * 0.16
    visuals.confettiVelocities[index * 3 + 2] =
      Math.sin(angle) * (1.1 + radial)
  }
  const positionAttribute = visuals.confetti.geometry.getAttribute('position')
  if (positionAttribute instanceof THREE.BufferAttribute) {
    positionAttribute.needsUpdate = true
  }
}

function updateConfetti(visuals: CoveRushVisuals, deltaSeconds: number): void {
  if (!Number.isFinite(visuals.confettiAge)) return
  visuals.confettiAge += deltaSeconds
  if (visuals.confettiAge >= 1.8) {
    visuals.confetti.geometry.setDrawRange(0, 0)
    visuals.confettiAge = Number.POSITIVE_INFINITY
    return
  }

  const count = visuals.confetti.geometry.drawRange.count
  if (
    !Number.isInteger(count) ||
    count < 0 ||
    count * 3 > visuals.confettiPositions.length ||
    count * 3 > visuals.confettiVelocities.length
  ) {
    throw new RangeError('Confetti draw range exceeds buffer capacity.')
  }

  for (let index = 0; index < count; index += 1) {
    const xIndex = index * 3
    const yIndex = xIndex + 1
    const zIndex = xIndex + 2
    const velocityX = visuals.confettiVelocities[xIndex]!
    const velocityY =
      visuals.confettiVelocities[yIndex]! - 4.4 * deltaSeconds
    const velocityZ = visuals.confettiVelocities[zIndex]!

    visuals.confettiVelocities[yIndex] = velocityY
    visuals.confettiPositions[xIndex] =
      visuals.confettiPositions[xIndex]! + velocityX * deltaSeconds
    visuals.confettiPositions[yIndex] =
      visuals.confettiPositions[yIndex]! + velocityY * deltaSeconds
    visuals.confettiPositions[zIndex] =
      visuals.confettiPositions[zIndex]! + velocityZ * deltaSeconds
  }
  const positionAttribute = visuals.confetti.geometry.getAttribute('position')
  if (positionAttribute instanceof THREE.BufferAttribute) {
    positionAttribute.needsUpdate = true
  }
}

function updateCoveRushVisuals(
  visuals: CoveRushVisuals,
  runState: CoveRushRunState | null,
  nearHub: boolean,
  particleLevel: CoveRushParticleLevel,
  deltaSeconds: number,
): void {
  const reducedMotion = prefersReducedMotion()
  visuals.elapsed += deltaSeconds
  const pulse = reducedMotion
    ? 1
    : 1 + Math.sin(visuals.elapsed * 2.4) * (nearHub ? 0.035 : 0.018)
  visuals.hubRing.scale.setScalar(pulse)
  visuals.beacon.rotation.y += deltaSeconds * (reducedMotion ? 0.08 : 0.34)
  visuals.hubMotes.rotation.y += deltaSeconds * (reducedMotion ? 0 : 0.16)
  visuals.hubCore.scale.y = nearHub ? 1.12 : 1
  const hubMaterial = visuals.hubRing.material
  if (hubMaterial instanceof THREE.MeshStandardMaterial) {
    hubMaterial.emissiveIntensity = nearHub ? 3.1 : 2
  }

  visuals.hubMotes.geometry.setDrawRange(
    0,
    particleCount(particleLevel, 14, MAX_HUB_MOTES),
  )
  visuals.targetMotes.geometry.setDrawRange(
    0,
    particleCount(particleLevel, 12, MAX_TARGET_MOTES),
  )

  const target = runState?.target ?? null
  visuals.targetGroup.visible = target !== null
  for (const marker of visuals.routeMarkers) {
    const index = marker.userData.coveRushCheckpointIndex
    marker.material =
      typeof index === 'number' &&
      runState !== null &&
      index < runState.checkpointIndex
        ? visuals.routeCompleteMaterial
        : visuals.routeIdleMaterial
  }

  if (target) {
    visuals.targetGroup.position.set(target.x, target.y + 0.82, target.z)
    visuals.targetGroundRing.scale.setScalar(target.radius)
    const targetScale = reducedMotion
      ? 1
      : 1 + Math.sin(visuals.elapsed * 4.8) * 0.08
    visuals.targetOrb.scale.setScalar(targetScale)
    visuals.targetRing.rotation.x += deltaSeconds * (reducedMotion ? 0 : 0.9)
    visuals.targetRing.rotation.y += deltaSeconds * (reducedMotion ? 0 : 1.35)
    visuals.targetMotes.rotation.y -= deltaSeconds * (reducedMotion ? 0 : 0.5)
  }

  updateConfetti(visuals, deltaSeconds)
}

/**
 * Cove Rush controller. All checkpoint progress and outcomes are accepted only
 * from server messages; the client proximity check is limited to opening the hub.
 */
export function useLobbyActivities(deps: LobbyActivitiesDeps) {
  const config = shallowRef<CoveRushConfig>(cloneFallbackConfig())
  const nearHub = ref(false)
  const panelOpen = ref(false)
  const runState = shallowRef<CoveRushRunState | null>(null)
  const queueState = shallowRef<CoveRushQueueState | null>(null)
  const resultState = shallowRef<CoveRushFinishedState | null>(null)
  const activityError = shallowRef<CoveRushErrorState | null>(null)

  const hubPromptPosition = computed<CoveRushWorldPoint>(() => ({
    x: config.value.hub.x,
    y: config.value.hub.y + 2.35,
    z: config.value.hub.z,
  }))

  let visuals: CoveRushVisuals | null = null
  let attachedScene: THREE.Scene | null = null
  let boundRoom: Room | null = null
  let roomListenerDisposers: Array<() => void> = []
  let bindingVersion = 0
  let lastFinishedActivityId: string | null = null
  let disposed = false

  function clearAuthoritativeState(): void {
    runState.value = null
    queueState.value = null
    resultState.value = null
    activityError.value = null
    lastFinishedActivityId = null
  }

  function ensureVisuals(): CoveRushVisuals | null {
    const scene = deps.getScene()
    if (!scene || disposed) return null
    if (!visuals) visuals = createCoveRushVisuals(config.value)
    if (attachedScene !== scene) {
      visuals.root.removeFromParent()
      scene.add(visuals.root)
      attachedScene = scene
    }
    return visuals
  }

  function rebuildVisuals(): void {
    if (visuals) disposeCoveRushVisuals(visuals)
    visuals = null
    attachedScene = null
  }

  function setConfig(raw: unknown): boolean {
    if (disposed) return false
    const parsed = parseCoveRushConfig(raw)
    config.value = parsed ?? cloneFallbackConfig()
    rebuildVisuals()
    return parsed !== null
  }

  function isCurrentBinding(room: Room, version: number): boolean {
    return (
      !disposed &&
      version === bindingVersion &&
      room === boundRoom &&
      room === deps.getRoom()
    )
  }

  function setInvalidPayloadError(eventName: string): void {
    activityError.value = {
      code: 'invalid_activity_payload',
      message: `Cove Rush ignored an invalid ${eventName} message.`,
    }
  }

  function trackRoomDisposer(candidate: unknown): void {
    if (typeof candidate === 'function') {
      roomListenerDisposers.push(candidate as () => void)
    }
  }

  function removeRoomListeners(): void {
    for (const removeListener of roomListenerDisposers) removeListener()
    roomListenerDisposers = []
  }

  function bindRoom(room: Room): void {
    if (disposed || room === boundRoom) return
    removeRoomListeners()
    boundRoom = room
    bindingVersion += 1
    const version = bindingVersion
    clearAuthoritativeState()

    trackRoomDisposer(
      room.onMessage('init', (raw: unknown) => {
        if (!isCurrentBinding(room, version)) return
        setConfig(raw)
      }),
    )

    trackRoomDisposer(
      room.onMessage('activity_state', (raw: unknown) => {
        if (!isCurrentBinding(room, version)) return
        const parsed = parseCoveRushRunState(raw)
        if (!parsed) {
          setInvalidPayloadError('activity_state')
          return
        }
        if (parsed.activityId === lastFinishedActivityId) return
        const currentRun = runState.value
        if (
          currentRun?.activityId === parsed.activityId &&
          parsed.serverNow < currentRun.serverNow
        ) {
          return
        }
        runState.value = parsed
        resultState.value = null
        activityError.value = null
        if (parsed.mode === 'duel') {
          queueState.value = null
        }
        panelOpen.value = false
      }),
    )

    trackRoomDisposer(
      room.onMessage('activity_queue_state', (raw: unknown) => {
        if (!isCurrentBinding(room, version)) return
        const parsed = parseCoveRushQueueState(raw)
        if (!parsed) {
          setInvalidPayloadError('activity_queue_state')
          return
        }
        if (
          parsed.activityId !== null &&
          parsed.activityId === lastFinishedActivityId
        ) {
          return
        }
        if (
          queueState.value !== null &&
          parsed.serverNow < queueState.value.serverNow
        ) {
          return
        }
        queueState.value = parsed
        activityError.value = null
        if (parsed.status === 'matched') panelOpen.value = false
      }),
    )

    trackRoomDisposer(
      room.onMessage('activity_finished', (raw: unknown) => {
        if (!isCurrentBinding(room, version)) return
        const parsed = parseCoveRushFinishedState(raw)
        if (!parsed) {
          setInvalidPayloadError('activity_finished')
          return
        }
        if (
          runState.value !== null &&
          parsed.activityId !== runState.value.activityId
        ) {
          return
        }
        if (
          parsed.activityId === lastFinishedActivityId ||
          (resultState.value !== null &&
            parsed.serverNow < resultState.value.serverNow)
        ) {
          return
        }
        lastFinishedActivityId = parsed.activityId
        resultState.value = parsed
        runState.value = null
        queueState.value = null
        activityError.value = null
        if (parsed.result === 'completed' || parsed.result === 'win') {
          const activeVisuals = ensureVisuals()
          if (activeVisuals) {
            triggerAuthoritativeConfetti(
              activeVisuals,
              config.value,
              deps.getParticleLevel(),
            )
          }
        }
      }),
    )

    trackRoomDisposer(
      room.onMessage('activity_error', (raw: unknown) => {
        if (!isCurrentBinding(room, version)) return
        const parsed = parseCoveRushError(raw)
        if (!parsed) {
          setInvalidPayloadError('activity_error')
          return
        }
        activityError.value = parsed
      }),
    )

    trackRoomDisposer(
      room.onLeave(() => {
        if (!isCurrentBinding(room, version)) return
        bindingVersion += 1
        boundRoom = null
        clearAuthoritativeState()
        panelOpen.value = false
      }),
    )
  }

  function send(eventName: string, payload: Record<string, unknown>): boolean {
    const room = deps.getRoom()
    if (
      !room ||
      room !== boundRoom ||
      deps.currentRoomLabel.value !== 'city'
    ) {
      activityError.value = {
        code: 'activity_unavailable',
        message: 'Cove Rush is unavailable until the city connection is ready.',
      }
      return false
    }
    try {
      room.send(eventName, payload)
      activityError.value = null
      return true
    } catch {
      activityError.value = {
        code: 'activity_send_failed',
        message: 'Cove Rush could not reach the server. Please try again.',
      }
      return false
    }
  }

  function openPanel(): void {
    if (nearHub.value) panelOpen.value = true
  }

  function closePanel(): void {
    panelOpen.value = false
  }

  function handleInteract(): boolean {
    if (!nearHub.value || runState.value !== null) return false
    panelOpen.value = true
    return true
  }

  function startSolo(): boolean {
    if (!nearHub.value) return false
    const sent = send('activity_start', { mode: 'solo' })
    if (sent) panelOpen.value = false
    return sent
  }

  function queueDuel(): boolean {
    if (!nearHub.value) return false
    return send('activity_queue', {})
  }

  function cancel(): boolean {
    const sent = send('activity_cancel', {})
    if (sent) panelOpen.value = false
    return sent
  }

  function dismissResult(): void {
    resultState.value = null
  }

  function tick(deltaSeconds: number): void {
    const inCity = deps.currentRoomLabel.value === 'city'
    const deltaX = deps.myPosition.x - config.value.hub.x
    const deltaZ = deps.myPosition.z - config.value.hub.z
    nearHub.value =
      inCity &&
      deltaX * deltaX + deltaZ * deltaZ <=
        config.value.hub.radius * config.value.hub.radius

    const activeVisuals = ensureVisuals()
    if (!activeVisuals) return
    activeVisuals.root.visible = inCity
    if (!inCity) return
    const safeDelta = Number.isFinite(deltaSeconds)
      ? Math.min(Math.max(deltaSeconds, 0), 0.1)
      : 0
    updateCoveRushVisuals(
      activeVisuals,
      runState.value,
      nearHub.value,
      deps.getParticleLevel(),
      safeDelta,
    )
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    bindingVersion += 1
    boundRoom = null
    removeRoomListeners()
    nearHub.value = false
    panelOpen.value = false
    clearAuthoritativeState()
    rebuildVisuals()
  }

  onScopeDispose(dispose)

  return {
    config,
    nearHub,
    panelOpen,
    runState,
    queueState,
    resultState,
    activityError,
    hubPromptPosition,
    setConfig,
    bindRoom,
    openPanel,
    closePanel,
    handleInteract,
    startSolo,
    queueDuel,
    cancel,
    dismissResult,
    tick,
    dispose,
  }
}
