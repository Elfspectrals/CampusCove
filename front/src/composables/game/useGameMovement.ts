import { ref, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { isActionPressed, matchesAction } from '../../config/keybindings'
import {
  GAME_ACTIONS,
  getGameSettings,
  type ControlSettings,
  type FpsCap,
} from '../../game/gameSettings'
import {
  APARTMENT_CLAMP_MARGIN,
  APARTMENT_DOOR_POS,
  APARTMENT_DOOR_RADIUS,
  APARTMENT_HALF_EXTENT,
  CITY_BUILDING_DOOR_POS,
  CITY_BUILDING_DOOR_RADIUS,
} from '../../game/gameRoomConstants'
import { resolveWorldMovement } from './useWorldCollision'

const PLAYER_EYE_HEIGHT = 1.6
const MAX_FRAME_DELTA_SECONDS = 0.05
const MOVE_EMIT_INTERVAL_MS = 50
const MOVE_HEARTBEAT_MS = 2_000
const MOVE_POSITION_EPSILON_SQ = 0.0001

export interface UseGameMovementDeps {
  pointerLocked?: Ref<boolean>
  myPosition: { x: number; y: number; z: number }
  direction: THREE.Vector3
  canvasRef: Ref<HTMLCanvasElement | null>
  containerRef: Ref<HTMLElement | null>
  gameRoomRef: ShallowRef<Room | null>
  currentRoomLabel: Ref<'city' | 'apartment'>
  inventoryOpen: Ref<boolean>
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.PerspectiveCamera | undefined
  getRenderer: () => THREE.WebGLRenderer | undefined
  getFpHands: () => THREE.Group | null
  refreshMyAppearance: Ref<(() => void) | null>
  onNearApartmentDoorInteract: () => Promise<void>
  onNearCityDoorInteract: () => void
  onToggleInventory: () => void
  onHotbarDigit: (index: number) => void
  nearApartmentDoor: Ref<boolean>
  nearCityDoor: Ref<boolean>
  /** Return `true` if the event was consumed (placement shortcuts, etc.). */
  handleExtraKeyDown?: (e: KeyboardEvent) => boolean
  /** Optional key-up companion for feature-specific held actions such as push-to-talk. */
  handleExtraKeyUp?: (e: KeyboardEvent) => boolean
  onCanvasMouseDown?: (e: MouseEvent) => void
  onCanvasMouseUp?: (e: MouseEvent) => void
  /** Called each animation frame after movement. */
  onBeforeRender?: (dt: number) => void
  /** Optional renderer pipeline hook (composer or direct renderer). */
  renderFrame?: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => void
  /** Optional renderer pipeline resize hook. */
  resizeRenderer?: (width: number, height: number) => void
  /** Current remappable controls. The persisted settings are used when omitted. */
  getControlSettings?: () => ControlSettings
  /** Blocks gameplay input while a settings/dialog surface is active. */
  inputBlocked?: Ref<boolean> | (() => boolean)
  /** Freezes player translation while preserving pointer-look, such as during a race countdown. */
  translationBlocked?: Ref<boolean> | (() => boolean)
  /** Caps renderer calls only; simulation and network updates continue on every RAF. */
  getFpsCap?: () => FpsCap
}

export function useGameMovement(deps: UseGameMovementDeps) {
  const pointerLockedOwned = ref(false)
  const pointerLocked = deps.pointerLocked ?? pointerLockedOwned

  const pressedCodes = new Set<string>()
  const myPosition = deps.myPosition
  const velocity = new THREE.Vector3(0, 0, 0)
  const direction = deps.direction
  const worldUp = new THREE.Vector3(0, 1, 0)
  const rightVector = new THREE.Vector3()
  const moveSpeed = 8
  let lastEmit = 0
  let lastSentX = Number.NaN
  let lastSentY = Number.NaN
  let lastSentZ = Number.NaN
  let lastSentRoomSessionId = ''

  let mouseX = 0
  let mouseY = 0
  let yaw = 0
  let pitch = 0

  let frameId = 0
  let lastTime = performance.now()
  let lastRenderTime = 0

  function controlSettings(): ControlSettings {
    return deps.getControlSettings?.() ?? getGameSettings().controls
  }

  function inputIsBlocked(): boolean {
    const blocked = deps.inputBlocked
    return typeof blocked === 'function' ? blocked() : (blocked?.value ?? false)
  }

  function translationIsBlocked(): boolean {
    const blocked = deps.translationBlocked
    return typeof blocked === 'function' ? blocked() : (blocked?.value ?? false)
  }

  function resetInputState(): void {
    pressedCodes.clear()
    mouseX = 0
    mouseY = 0
    lastTime = performance.now()
    lastRenderTime = 0
  }

  function containerSize(): { w: number; h: number } {
    const el = deps.containerRef.value
    if (el && el.clientWidth > 0 && el.clientHeight > 0) {
      return { w: el.clientWidth, h: el.clientHeight }
    }
    return { w: window.innerWidth, h: window.innerHeight }
  }

  function clampMyPositionToApartment() {
    const lim = APARTMENT_HALF_EXTENT - APARTMENT_CLAMP_MARGIN
    myPosition.x = Math.max(-lim, Math.min(lim, myPosition.x))
    myPosition.z = Math.max(-lim, Math.min(lim, myPosition.z))
  }

  function updateDoorProximity() {
    if (deps.currentRoomLabel.value === 'apartment') {
      clampMyPositionToApartment()
      const dx = myPosition.x - APARTMENT_DOOR_POS.x
      const dz = myPosition.z - APARTMENT_DOOR_POS.z
      deps.nearApartmentDoor.value = dx * dx + dz * dz <= APARTMENT_DOOR_RADIUS * APARTMENT_DOOR_RADIUS
      deps.nearCityDoor.value = false
    } else {
      deps.nearApartmentDoor.value = false
      const dx = myPosition.x - CITY_BUILDING_DOOR_POS.x
      const dz = myPosition.z - CITY_BUILDING_DOOR_POS.z
      deps.nearCityDoor.value = dx * dx + dz * dz <= CITY_BUILDING_DOOR_RADIUS * CITY_BUILDING_DOOR_RADIUS
    }
  }

  function updateMovement(dt: number) {
    const camera = deps.getCamera()
    const room = deps.gameRoomRef.value
    if (!camera) return

    const controls = controlSettings()
    const forward =
      Number(isActionPressed(pressedCodes, 'moveForward', controls)) -
      Number(isActionPressed(pressedCodes, 'moveBack', controls))
    const right =
      Number(isActionPressed(pressedCodes, 'moveRight', controls)) -
      Number(isActionPressed(pressedCodes, 'moveLeft', controls))
    const fov = Math.min(100, Math.max(60, controls.fov))
    if (Math.abs(camera.fov - fov) > 0.001) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    const sensitivity = Math.min(3, Math.max(0.1, controls.mouseSensitivity))
    yaw -= mouseX * 0.002 * sensitivity
    pitch += mouseY * 0.002 * sensitivity * (controls.invertY ? 1 : -1)
    pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch))
    mouseX = 0
    mouseY = 0
    direction.set(0, 0, -1).applyAxisAngle(worldUp, yaw)
    rightVector.crossVectors(direction, worldUp).normalize()
    velocity.set(0, 0, 0)
    if (
      !deps.inventoryOpen.value &&
      !inputIsBlocked() &&
      !translationIsBlocked()
    ) {
      if (forward) velocity.addScaledVector(direction, forward)
      if (right) velocity.addScaledVector(rightVector, right)
      if (velocity.lengthSq() > 1) velocity.normalize()
      velocity.multiplyScalar(moveSpeed * dt)
      const resolved = resolveWorldMovement(myPosition, velocity.x, velocity.z)
      myPosition.x = resolved.x
      myPosition.z = resolved.z
    }
    myPosition.y = PLAYER_EYE_HEIGHT
    updateDoorProximity()
    camera.position.set(myPosition.x, myPosition.y, myPosition.z)
    camera.rotation.order = 'YXZ'
    camera.rotation.y = yaw
    camera.rotation.x = pitch

    const now = Date.now()
    if (!room) return
    const roomChanged = room.sessionId !== lastSentRoomSessionId
    const dx = myPosition.x - lastSentX
    const dy = myPosition.y - lastSentY
    const dz = myPosition.z - lastSentZ
    const hasLastPosition =
      Number.isFinite(lastSentX) && Number.isFinite(lastSentY) && Number.isFinite(lastSentZ)
    const moved =
      roomChanged || !hasLastPosition || dx * dx + dy * dy + dz * dz > MOVE_POSITION_EPSILON_SQ
    const heartbeatDue = now - lastEmit >= MOVE_HEARTBEAT_MS
    if ((moved && now - lastEmit >= MOVE_EMIT_INTERVAL_MS) || heartbeatDue) {
      lastEmit = now
      lastSentX = myPosition.x
      lastSentY = myPosition.y
      lastSentZ = myPosition.z
      lastSentRoomSessionId = room.sessionId
      room.send('move', { x: myPosition.x, y: myPosition.y, z: myPosition.z })
    }
  }

  function shouldRender(now: number): boolean {
    const cap = deps.getFpsCap?.() ?? getGameSettings().graphics.fpsCap
    if (cap === 0) {
      lastRenderTime = now
      return true
    }
    const interval = 1000 / cap
    if (lastRenderTime === 0) {
      lastRenderTime = now
      return true
    }
    const elapsed = now - lastRenderTime
    if (elapsed + 0.5 < interval) return false
    lastRenderTime = now - (elapsed % interval)
    return true
  }

  function animate() {
    frameId = requestAnimationFrame(animate)
    const now = performance.now()
    const dt = Math.min(MAX_FRAME_DELTA_SECONDS, Math.max(0, (now - lastTime) / 1000))
    lastTime = now
    if (pointerLocked.value && !inputIsBlocked()) {
      updateMovement(dt)
    } else {
      // Keep door prompts / interaction zones accurate even without pointer lock.
      updateDoorProximity()
    }
    deps.onBeforeRender?.(dt)
    const renderer = deps.getRenderer()
    const scene = deps.getScene()
    const camera = deps.getCamera()
    if (renderer && scene && camera && shouldRender(now)) {
      if (deps.renderFrame) {
        deps.renderFrame(scene, camera)
      } else {
        renderer.render(scene, camera)
      }
    }
  }

  function startRenderLoop() {
    if (frameId !== 0) return
    lastTime = performance.now()
    lastRenderTime = 0
    animate()
  }

  function stopRenderLoop() {
    cancelAnimationFrame(frameId)
    frameId = 0
    resetInputState()
  }

  function onResize() {
    const camera = deps.getCamera()
    const renderer = deps.getRenderer()
    if (!camera || !renderer) return
    const { w, h } = containerSize()
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    if (deps.resizeRenderer) {
      deps.resizeRenderer(w, h)
    } else {
      renderer.setSize(w, h)
    }
  }

  function onPointerLockChange() {
    pointerLocked.value = document.pointerLockElement === deps.canvasRef.value
    if (!pointerLocked.value) resetInputState()
    const fpHands = deps.getFpHands()
    if (fpHands) {
      fpHands.visible = pointerLocked.value
    }
  }

  function requestPointerLock() {
    deps.canvasRef.value?.requestPointerLock()
  }

  function onMouseMove(e: MouseEvent) {
    if (!pointerLocked.value || inputIsBlocked()) return
    mouseX += e.movementX
    mouseY += e.movementY
  }

  function onCanvasMouseDown(e: MouseEvent) {
    deps.onCanvasMouseDown?.(e)
  }

  function onCanvasMouseUp(e: MouseEvent) {
    deps.onCanvasMouseUp?.(e)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (deps.handleExtraKeyDown?.(e)) {
      e.preventDefault()
      return
    }
    if (inputIsBlocked()) return
    const controls = controlSettings()
    if (GAME_ACTIONS.some((action) => matchesAction(e, action, controls))) {
      e.preventDefault()
    }
    pressedCodes.add(e.code)
    if (matchesAction(e, 'interact', controls)) {
      // Recompute proximity on the key press itself so interaction works even if the
      // last movement frame was skipped (pointer unlock, lag, etc.).
      updateDoorProximity()
      if (deps.currentRoomLabel.value === 'apartment' && deps.nearApartmentDoor.value) {
        void deps.onNearApartmentDoorInteract()
        return
      }
      if (deps.currentRoomLabel.value === 'city' && deps.nearCityDoor.value) {
        deps.onNearCityDoorInteract()
        return
      }
    }
    if (matchesAction(e, 'inventory', controls) && !e.repeat) {
      deps.onToggleInventory()
      return
    }
    if (!e.repeat) {
      const digit = /^Digit([1-9])$/.exec(e.code)
      if (digit) {
        const index = Number(digit[1]) - 1
        deps.onHotbarDigit(index)
        return
      }
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    pressedCodes.delete(e.code)
    if (deps.handleExtraKeyUp?.(e)) {
      e.preventDefault()
      return
    }
    if (inputIsBlocked()) return
    const controls = controlSettings()
    if (GAME_ACTIONS.some((action) => matchesAction(e, action, controls))) {
      e.preventDefault()
    }
  }

  function onVisibilityOrFocus() {
    resetInputState()
    if (document.visibilityState !== 'visible') return
    deps.refreshMyAppearance.value?.()
  }

  function onWindowBlur() {
    resetInputState()
  }

  return {
    pointerLocked,
    myPosition,
    direction,
    containerSize,
    onKeyDown,
    onKeyUp,
    onMouseMove,
    onPointerLockChange,
    onResize,
    requestPointerLock,
    onVisibilityOrFocus,
    onWindowBlur,
    startRenderLoop,
    stopRenderLoop,
    onCanvasMouseDown,
    onCanvasMouseUp,
    resetInputState,
    isCodePressed: (code: string) => pressedCodes.has(code),
  }
}
