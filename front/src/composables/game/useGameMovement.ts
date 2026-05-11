import { ref, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { KEY_BINDINGS, matchesAnyMovementKey } from '../../config/keybindings'
import {
  APARTMENT_CLAMP_MARGIN,
  APARTMENT_DOOR_POS,
  APARTMENT_DOOR_RADIUS,
  APARTMENT_HALF_EXTENT,
  CITY_BUILDING_DOOR_POS,
  CITY_BUILDING_DOOR_RADIUS,
} from '../../game/gameRoomConstants'

export interface UseGameMovementDeps {
  pointerLocked?: Ref<boolean>
  myPosition: { x: number; y: number; z: number }
  direction: THREE.Vector3
  canvasRef: Ref<HTMLCanvasElement | null>
  containerRef: Ref<HTMLElement | null>
  gameRoomRef: ShallowRef<Room | null>
  currentRoomLabel: Ref<'city' | 'apartment'>
  apartmentInventoryOpen: Ref<boolean>
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.PerspectiveCamera | undefined
  getRenderer: () => THREE.WebGLRenderer | undefined
  getFpHands: () => THREE.Group | null
  refreshMyAppearance: Ref<(() => void) | null>
  onNearApartmentDoorInteract: () => Promise<void>
  onNearCityDoorInteract: () => void
  onToggleApartmentInventory: () => void
  onHotbarDigit: (index: number) => void
  nearApartmentDoor: Ref<boolean>
  nearCityDoor: Ref<boolean>
  /** Return `true` if the event was consumed (placement shortcuts, etc.). */
  handleExtraKeyDown?: (e: KeyboardEvent) => boolean
  onCanvasMouseDown?: (e: MouseEvent) => void
  onCanvasMouseUp?: (e: MouseEvent) => void
  /** Called each animation frame after movement. */
  onBeforeRender?: (dt: number) => void
}

export function useGameMovement(deps: UseGameMovementDeps) {
  const pointerLockedOwned = ref(false)
  const pointerLocked = deps.pointerLocked ?? pointerLockedOwned

  const keys = { forward: false, back: false, left: false, right: false }
  const myPosition = deps.myPosition
  const velocity = new THREE.Vector3(0, 0, 0)
  const direction = deps.direction
  const moveSpeed = 8
  let lastEmit = 0
  const emitInterval = 50

  let mouseX = 0
  let mouseY = 0
  let yaw = 0
  let pitch = 0

  let frameId = 0
  let lastTime = performance.now()

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

  function updateMovement(dt: number) {
    const camera = deps.getCamera()
    const room = deps.gameRoomRef.value
    if (!camera) return

    const forward = keys.forward ? 1 : keys.back ? -1 : 0
    const right = keys.right ? 1 : keys.left ? -1 : 0
    yaw -= mouseX * 0.002
    pitch -= mouseY * 0.002
    pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch))
    mouseX = 0
    mouseY = 0
    direction.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    const rightVec = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize()
    velocity.set(0, 0, 0)
    if (forward) velocity.add(direction.clone().multiplyScalar(forward * moveSpeed * dt))
    if (right) velocity.add(rightVec.clone().multiplyScalar(right * moveSpeed * dt))
    myPosition.x += velocity.x
    myPosition.y = 1.6
    myPosition.z += velocity.z
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
    camera.position.set(myPosition.x, myPosition.y, myPosition.z)
    camera.rotation.order = 'YXZ'
    camera.rotation.y = yaw
    camera.rotation.x = pitch
    const now = Date.now()
    if (room && now - lastEmit > emitInterval) {
      lastEmit = now
      room.send('move', { x: myPosition.x, y: myPosition.y, z: myPosition.z })
    }
  }

  function animate() {
    frameId = requestAnimationFrame(animate)
    const now = performance.now()
    const dt = (now - lastTime) / 1000
    lastTime = now
    if (pointerLocked.value) updateMovement(dt)
    deps.onBeforeRender?.(dt)
    const renderer = deps.getRenderer()
    const scene = deps.getScene()
    const camera = deps.getCamera()
    if (renderer && scene && camera) {
      renderer.render(scene, camera)
    }
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
    if (fpHands) {
      fpHands.visible = pointerLocked.value
    }
  }

  function requestPointerLock() {
    deps.canvasRef.value?.requestPointerLock()
  }

  function onMouseMove(e: MouseEvent) {
    if (!pointerLocked.value) return
    mouseX = e.movementX
    mouseY = e.movementY
  }

  function onCanvasMouseDown(e: MouseEvent) {
    deps.onCanvasMouseDown?.(e)
  }

  function onCanvasMouseUp(e: MouseEvent) {
    deps.onCanvasMouseUp?.(e)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (deps.handleExtraKeyDown?.(e)) {
      return
    }
    if (e.code === KEY_BINDINGS.interact) {
      if (deps.currentRoomLabel.value === 'apartment' && deps.nearApartmentDoor.value) {
        void deps.onNearApartmentDoorInteract()
        return
      }
      if (deps.currentRoomLabel.value === 'city' && deps.nearCityDoor.value) {
        deps.onNearCityDoorInteract()
        return
      }
    }
    if (e.code === KEY_BINDINGS.apartmentInventoryToggle && !e.repeat) {
      deps.onToggleApartmentInventory()
      return
    }
    if (deps.currentRoomLabel.value === 'apartment' && !e.repeat) {
      const digit = /^Digit([1-9])$/.exec(e.code)
      if (digit) {
        const index = Number(digit[1]) - 1
        deps.onHotbarDigit(index)
        return
      }
    }
    switch (e.code) {
      case KEY_BINDINGS.moveForward[0]:
      case KEY_BINDINGS.moveForward[1]:
        keys.forward = true
        break
      case KEY_BINDINGS.moveBack[0]:
        keys.back = true
        break
      case KEY_BINDINGS.moveLeft[0]:
      case KEY_BINDINGS.moveLeft[1]:
        keys.left = true
        break
      case KEY_BINDINGS.moveRight[0]:
        keys.right = true
        break
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (matchesAnyMovementKey(e.code, KEY_BINDINGS.moveForward)) {
      keys.forward = false
      return
    }
    if (matchesAnyMovementKey(e.code, KEY_BINDINGS.moveBack)) {
      keys.back = false
      return
    }
    if (matchesAnyMovementKey(e.code, KEY_BINDINGS.moveLeft)) {
      keys.left = false
      return
    }
    if (matchesAnyMovementKey(e.code, KEY_BINDINGS.moveRight)) {
      keys.right = false
    }
  }

  function onVisibilityOrFocus() {
    if (document.visibilityState !== 'visible') return
    deps.refreshMyAppearance.value?.()
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
    startRenderLoop,
    stopRenderLoop,
    onCanvasMouseDown,
    onCanvasMouseUp,
  }
}
