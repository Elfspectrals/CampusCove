import type { Ref, ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { matches, type BindableAction } from '../../config/keybindings'

const HOTBAR_ACTIONS: BindableAction[] = ['hotbar1', 'hotbar2', 'hotbar3', 'hotbar4', 'hotbar5', 'hotbar6', 'hotbar7', 'hotbar8', 'hotbar9']
import { EYE_HEIGHT, SPRINT_SPEED, WALK_SPEED } from '../../game/gameRoomConstants'
import { resolveWorldMovement } from '../../game/collision/worldCollision'
import { terrainHeightAt } from '../../game/town/terrainHeight'
import { buildingFloorAt, capsuleLiftInBuilding, updateOpenHouseVisibility } from '../../game/town/openHouses'
import { createCameraShake, createKnockback } from '../../game/punch'
import { advanceHitStop, cameraJolt, idleHitStop, punchKick, scheduleHitStop } from '../../game/punchFeel'
import { cameraMotionScale, createStepSmoother, verticalFovFor } from '../../game/comfort'
import { comfortSettings } from './useComfortSettings'

/** Takeoff speed and gravity (m/s, m/s²): a ~0.95 m hop that lasts ~0.6 s. */
const JUMP_VELOCITY = 6.5
const GRAVITY = 22
const MAX_FRAME_DT = 0.1
const MOUSE_SENSITIVITY = 0.002
/** Position updates sent to the server at most this often (ms). */
const EMIT_INTERVAL_MS = 50

export interface UseGameMovementDeps {
  pointerLocked: Ref<boolean>
  myPosition: { x: number; y: number; z: number }
  canvasRef: Ref<HTMLCanvasElement | null>
  containerRef: Ref<HTMLElement | null>
  gameRoomRef: ShallowRef<Room | null>
  inventoryOpen: Ref<boolean>
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.PerspectiveCamera | undefined
  getRenderer: () => THREE.WebGLRenderer | undefined
  getFpHands: () => THREE.Group | null
  refreshMyAppearance: Ref<(() => void) | null>
  /** Refresh what the player stands next to (doors, fishing spots). */
  updateProximity: () => void
  onToggleInventory: () => void
  onHotbarDigit: (index: number) => void
  /** Mouse wheel over the game: +1 = next hotbar slot, -1 = previous (wraps). */
  onHotbarScroll: (step: 1 | -1) => void
  /** Return `true` if the event was consumed (placement shortcuts, etc.). */
  handleExtraKeyDown: (e: KeyboardEvent) => boolean
  /** Return `true` if the click was consumed (apartment placement), so it doesn't also open a door. */
  onCanvasMouseDown: (e: MouseEvent) => boolean
  /** Walking speed multiplier (survival: slower when starving, faster after a coffee, 0 when passed out). */
  speedFactor: () => number
  /** Space pressed on the ground: pay the jump in stamina; false = too tired, no jump. */
  trySpendJump: () => boolean
  /** Shift held while moving, each frame: pay the sprint in stamina; false = walk. */
  trySpendSprint: (dt: number, wasSprinting: boolean) => boolean
  /** Called each animation frame after movement, before rendering. */
  onBeforeRender: (dt: number) => void
  /** Seated on a pub seat: the mouse still looks around, but the body stays put and no `move` is sent. */
  movementLocked?: () => boolean
  /** Runs once the camera is placed each frame, for extra camera motion (drunken sway). */
  afterCameraPlaced?: (camera: THREE.PerspectiveCamera, dt: number) => void
}

/** First-person controls (WASD/ZQSD + pointer-lock mouse look), position sync, and the render loop. */
export function useGameMovement(deps: UseGameMovementDeps) {
  const { pointerLocked, myPosition } = deps
  const keys = { forward: false, back: false, left: false, right: false, sprint: false }
  let sprinting = false
  let jumpRequested = false
  /** Height of the feet above the ground while jumping, and its vertical speed. */
  let airY = 0
  let airVelocity = 0
  const direction = new THREE.Vector3(0, 0, -1)
  const rightVec = new THREE.Vector3()
  let lastEmit = 0
  let mouseX = 0
  let mouseY = 0
  let yaw = 0
  let pitch = 0
  let frameId = 0
  let lastTime = performance.now()
  const cameraShake = createCameraShake()
  const cameraHitStop = idleHitStop()
  let kickT = Infinity
  let shake = { pitch: 0, roll: 0 }
  /** Eases the camera over stair steps / floor snaps; myPosition.y itself stays exact. */
  const eyeSmoother = createStepSmoother()
  const knockback = createKnockback()

  function containerSize(): { w: number; h: number } {
    const el = deps.containerRef.value
    if (el && el.clientWidth > 0 && el.clientHeight > 0) return { w: el.clientWidth, h: el.clientHeight }
    return { w: window.innerWidth, h: window.innerHeight }
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

    const feetY = myPosition.y - EYE_HEIGHT - airY
    const push = knockback.step(dt)
    const locked = deps.movementLocked?.() ?? false
    if (!deps.inventoryOpen.value && !locked) {
      const forward = keys.forward ? 1 : keys.back ? -1 : 0
      const right = keys.right ? 1 : keys.left ? -1 : 0
      const speedFactor = deps.speedFactor()
      const moving = (forward !== 0 || right !== 0) && speedFactor > 0
      sprinting = keys.sprint && moving && deps.trySpendSprint(dt, sprinting)
      if (jumpRequested && airY === 0 && speedFactor > 0 && deps.trySpendJump()) airVelocity = JUMP_VELOCITY
      const step = (sprinting ? SPRINT_SPEED : WALK_SPEED) * speedFactor * dt
      const pushFactor = speedFactor > 0 ? 1 : 0
      const dx = direction.x * forward * step + rightVec.x * right * step + push.dx * pushFactor
      const dz = direction.z * forward * step + rightVec.z * right * step + push.dz * pushFactor
      const liftY = capsuleLiftInBuilding(myPosition.x, myPosition.z, feetY)
      const resolved = resolveWorldMovement(myPosition, dx, dz, liftY)
      myPosition.x = resolved.x
      myPosition.z = resolved.z
    } else {
      sprinting = false
    }
    jumpRequested = false
    if (!locked) {
      if (airY > 0 || airVelocity > 0) {
        airVelocity -= GRAVITY * dt
        airY = Math.max(0, airY + airVelocity * dt)
        if (airY === 0) airVelocity = 0
      }
      myPosition.y = EYE_HEIGHT + airY + (buildingFloorAt(myPosition.x, myPosition.z, feetY) ?? terrainHeightAt(myPosition.x, myPosition.z))
    }
    updateOpenHouseVisibility(myPosition.x, myPosition.z)

    camera.position.set(myPosition.x, eyeSmoother.update(myPosition.y, dt), myPosition.z)
    camera.rotation.order = 'YXZ'
    const cameraDt = advanceHitStop(cameraHitStop, dt)
    kickT += cameraDt
    if (cameraDt > 0) shake = cameraShake.update(cameraDt)
    const kick = punchKick(kickT)
    // comfort: shake / roll / fov kick scaled down (or off), fov from the settings
    const motion = cameraMotionScale(comfortSettings.reduceCameraMotion)
    camera.rotation.y = yaw
    camera.rotation.x = pitch + (shake.pitch + kick.pitch) * motion.shake
    camera.rotation.z = shake.roll * motion.roll
    const fov = verticalFovFor(comfortSettings.fov, camera.aspect) + kick.fov * motion.fovKick
    if (fov !== camera.fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    deps.afterCameraPlaced?.(camera, dt)

    const room = deps.gameRoomRef.value
    const now = Date.now()
    if (room && !locked && now - lastEmit > EMIT_INTERVAL_MS) {
      lastEmit = now
      room.send('move', { x: myPosition.x, y: myPosition.y, z: myPosition.z, ry: yaw, sprint: sprinting })
    }
  }

  function animate() {
    frameId = requestAnimationFrame(animate)
    const now = performance.now()
    const dt = Math.min((now - lastTime) / 1000, MAX_FRAME_DT)
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

  function setLook(nextYaw: number, nextPitch: number) {
    yaw = nextYaw
    pitch = nextPitch
    const camera = deps.getCamera()
    if (!camera) return
    camera.rotation.order = 'YXZ'
    camera.rotation.y = yaw
    camera.rotation.x = pitch
  }

  function kickCamera(): void {
    kickT = 0
  }

  function freezeCamera(seconds: number): void {
    scheduleHitStop(cameraHitStop, 0, seconds)
  }

  function joltCamera(dirX: number, dirZ: number, strength: number): void {
    const jolt = cameraJolt(dirX, dirZ, yaw, strength)
    cameraShake.jolt(jolt.pitch, jolt.roll)
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
    // add up: several mousemove events can arrive in one frame, keeping only the last made the look judder
    mouseX += e.movementX
    mouseY += e.movementY
  }

  function onCanvasMouseDown(e: MouseEvent) {
    deps.onCanvasMouseDown(e)
  }

  function setMoveKey(code: string, down: boolean): void {
    if (code === 'ShiftLeft' || code === 'ShiftRight') keys.sprint = down
    else if (matches('moveForward', code)) keys.forward = down
    else if (matches('moveBack', code)) keys.back = down
    else if (matches('moveLeft', code)) keys.left = down
    else if (matches('moveRight', code)) keys.right = down
  }

  function onKeyDown(e: KeyboardEvent) {
    if (deps.handleExtraKeyDown(e)) return
    if (matches('inventory', e.code) && !e.repeat) {
      deps.onToggleInventory()
      return
    }
    const slot = e.repeat ? -1 : HOTBAR_ACTIONS.findIndex((a) => matches(a, e.code))
    if (slot >= 0) {
      deps.onHotbarDigit(slot)
      return
    }
    if (matches('jump', e.code)) {
      // Space would otherwise press a focused button or scroll the page
      e.preventDefault()
      if (!e.repeat && pointerLocked.value) jumpRequested = true
      return
    }
    setMoveKey(e.code, true)
  }

  /** Trackpads send many tiny deltas; add them up so one notch of a mouse wheel = one slot. */
  let wheelAccum = 0
  function onWheel(e: WheelEvent) {
    if (!pointerLocked.value || deps.inventoryOpen.value) return
    e.preventDefault()
    // deltaMode 1 = lines, 2 = pages; normalize to pixels
    wheelAccum += e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1)
    if (Math.abs(wheelAccum) < 50) return
    deps.onHotbarScroll(wheelAccum > 0 ? 1 : -1)
    wheelAccum = 0
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
    // not passive: preventDefault keeps the wheel from scrolling anything behind the game
    document.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      document.removeEventListener('wheel', onWheel)
      for (const [name, fn] of windowEvents) window.removeEventListener(name, fn)
      for (const [name, fn] of documentEvents) document.removeEventListener(name, fn)
    }
  }

  return {
    containerSize,
    requestPointerLock,
    setLook,
    onCanvasMouseDown,
    startRenderLoop,
    stopRenderLoop,
    bindInputListeners,
    shakeCamera: cameraShake.add,
    kickCamera,
    freezeCamera,
    joltCamera,
    knockBack: knockback.push,
  }
}
