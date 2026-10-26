import type { Ref, ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { KEY_BINDINGS, matchesAnyMovementKey } from '../../config/keybindings'
import { APARTMENT_CLAMP_MARGIN, APARTMENT_HALF_EXTENT, EYE_HEIGHT } from '../../game/gameRoomConstants'
import { resolveWorldMovement } from '../../game/collision/worldCollision'
import { terrainHeightAt } from '../../game/town/terrainHeight'
import { buildingFloorAt, updateOpenHouseVisibility } from '../../game/town/openHouses'

const MOVE_SPEED = 8
const MOUSE_SENSITIVITY = 0.002
/** Position updates sent to the server at most this often (ms). */
const EMIT_INTERVAL_MS = 50

export interface UseGameMovementDeps {
  pointerLocked: Ref<boolean>
  myPosition: { x: number; y: number; z: number }
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
  /** Refresh what the player stands next to (doors, fishing spots). */
  updateProximity: () => void
  /** Left click / I: use what the player stands next to. Returns true if something was used. */
  tryInteract: () => boolean
  onToggleInventory: () => void
  onHotbarDigit: (index: number) => void
  /** Return `true` if the event was consumed (placement shortcuts, etc.). */
  handleExtraKeyDown: (e: KeyboardEvent) => boolean
  /** Return `true` if the click was consumed (apartment placement), so it doesn't also open a door. */
  onCanvasMouseDown: (e: MouseEvent) => boolean
  /** Called each animation frame after movement, before rendering. */
  onBeforeRender: (dt: number) => void
}

/** First-person controls (WASD/ZQSD + pointer-lock mouse look), position sync, and the render loop. */
export function useGameMovement(deps: UseGameMovementDeps) {
  const { pointerLocked, myPosition } = deps
  const keys = { forward: false, back: false, left: false, right: false }
  const direction = new THREE.Vector3(0, 0, -1)
  const rightVec = new THREE.Vector3()
  let lastEmit = 0
  let mouseX = 0
  let mouseY = 0
  let yaw = 0
  let pitch = 0
  let frameId = 0
  let lastTime = performance.now()

  function containerSize(): { w: number; h: number } {
    const el = deps.containerRef.value
    if (el && el.clientWidth > 0 && el.clientHeight > 0) return { w: el.clientWidth, h: el.clientHeight }
    return { w: window.innerWidth, h: window.innerHeight }
  }

  /** Outer safety clamp inside a house (walls themselves collide via the interior collision file). */
  function clampToApartment() {
    const lim = APARTMENT_HALF_EXTENT - APARTMENT_CLAMP_MARGIN
    myPosition.x = Math.max(-lim, Math.min(lim, myPosition.x))
    myPosition.z = Math.max(-lim, Math.min(lim, myPosition.z))
  }

  function updateMovement(dt: number) {
    const camera = deps.getCamera()
    if (!camera) return

    yaw -= mouseX * MOUSE_SENSITIVITY
    pitch -= mouseY * MOUSE_SENSITIVITY
    pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch))
    mouseX = 0
    mouseY = 0
    direction.set(0, 0, -1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw)
    rightVec.crossVectors(direction, THREE.Object3D.DEFAULT_UP).normalize()

    if (!deps.inventoryOpen.value) {
      const forward = keys.forward ? 1 : keys.back ? -1 : 0
      const right = keys.right ? 1 : keys.left ? -1 : 0
      const step = MOVE_SPEED * dt
      const dx = direction.x * forward * step + rightVec.x * right * step
      const dz = direction.z * forward * step + rightVec.z * right * step
      const resolved = resolveWorldMovement(myPosition, dx, dz)
      myPosition.x = resolved.x
      myPosition.z = resolved.z
    }
    const inCity = deps.currentRoomLabel.value === 'city'
    if (!inCity) clampToApartment()
    myPosition.y = EYE_HEIGHT + (inCity ? (buildingFloorAt(myPosition.x, myPosition.z) ?? terrainHeightAt(myPosition.x, myPosition.z)) : 0)
    if (inCity) updateOpenHouseVisibility(myPosition.x, myPosition.z)

    camera.position.set(myPosition.x, myPosition.y, myPosition.z)
    camera.rotation.order = 'YXZ'
    camera.rotation.y = yaw
    camera.rotation.x = pitch

    const room = deps.gameRoomRef.value
    const now = Date.now()
    if (room && now - lastEmit > EMIT_INTERVAL_MS) {
      lastEmit = now
      room.send('move', { x: myPosition.x, y: myPosition.y, z: myPosition.z, ry: yaw })
    }
  }

  function animate() {
    frameId = requestAnimationFrame(animate)
    const now = performance.now()
    const dt = (now - lastTime) / 1000
    lastTime = now
    // without pointer lock the player stands still, but door prompts must stay accurate
    if (pointerLocked.value) updateMovement(dt)
    deps.updateProximity()
    deps.onBeforeRender(dt)
    const renderer = deps.getRenderer()
    const scene = deps.getScene()
    const camera = deps.getCamera()
    if (renderer && scene && camera) renderer.render(scene, camera)
  }

  function startRenderLoop() {
    lastTime = performance.now()
    animate()
  }

  function stopRenderLoop() {
    cancelAnimationFrame(frameId)
  }

  function onResize() {
    const camera = deps.getCamera()
    const renderer = deps.getRenderer()
    if (!camera || !renderer) return
    const { w, h } = containerSize()
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }

  function onPointerLockChange() {
    pointerLocked.value = document.pointerLockElement === deps.canvasRef.value
    const fpHands = deps.getFpHands()
    if (fpHands) fpHands.visible = pointerLocked.value
  }

  /** Browsers refuse the lock without a user gesture or when the page is hidden; the overlay stays up then. */
  function requestPointerLock() {
    const canvas = deps.canvasRef.value
    if (canvas) void Promise.resolve(canvas.requestPointerLock()).catch(() => undefined)
  }

  function onMouseMove(e: MouseEvent) {
    if (!pointerLocked.value) return
    mouseX = e.movementX
    mouseY = e.movementY
  }

  function onCanvasMouseDown(e: MouseEvent) {
    if (deps.onCanvasMouseDown(e)) return
    // left click on a door; the click that locks the pointer is not an interaction
    if (e.button === 0 && pointerLocked.value) deps.tryInteract()
  }

  function setMoveKey(code: string, down: boolean): void {
    if (matchesAnyMovementKey(code, KEY_BINDINGS.moveForward)) keys.forward = down
    else if (matchesAnyMovementKey(code, KEY_BINDINGS.moveBack)) keys.back = down
    else if (matchesAnyMovementKey(code, KEY_BINDINGS.moveLeft)) keys.left = down
    else if (matchesAnyMovementKey(code, KEY_BINDINGS.moveRight)) keys.right = down
  }

  function onKeyDown(e: KeyboardEvent) {
    if (deps.handleExtraKeyDown(e)) return
    // keyboard fallback for the left-click door interaction
    if (e.code === KEY_BINDINGS.interact && deps.tryInteract()) return
    if (e.code === KEY_BINDINGS.apartmentInventoryToggle && !e.repeat) {
      deps.onToggleInventory()
      return
    }
    const digit = e.repeat ? null : /^Digit([1-9])$/.exec(e.code)
    if (digit) {
      deps.onHotbarDigit(Number(digit[1]) - 1)
      return
    }
    setMoveKey(e.code, true)
  }

  function onKeyUp(e: KeyboardEvent) {
    setMoveKey(e.code, false)
  }

  function onVisibilityOrFocus() {
    if (document.visibilityState === 'visible') deps.refreshMyAppearance.value?.()
  }

  /** Window / document listeners for the lifetime of the game view; returns the unbind function. */
  function bindInputListeners(): () => void {
    const windowEvents: Array<[string, EventListener]> = [
      ['resize', onResize],
      ['focus', onVisibilityOrFocus],
    ]
    const documentEvents: Array<[string, EventListener]> = [
      ['visibilitychange', onVisibilityOrFocus],
      ['pointerlockchange', onPointerLockChange],
      ['keydown', onKeyDown as EventListener],
      ['keyup', onKeyUp as EventListener],
      ['mousemove', onMouseMove as EventListener],
    ]
    for (const [name, fn] of windowEvents) window.addEventListener(name, fn)
    for (const [name, fn] of documentEvents) document.addEventListener(name, fn)
    return () => {
      for (const [name, fn] of windowEvents) window.removeEventListener(name, fn)
      for (const [name, fn] of documentEvents) document.removeEventListener(name, fn)
    }
  }

  return {
    containerSize,
    requestPointerLock,
    onCanvasMouseDown,
    startRenderLoop,
    stopRenderLoop,
    bindInputListeners,
  }
}
