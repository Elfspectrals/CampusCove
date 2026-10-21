import { ref, type Ref } from 'vue'
import * as THREE from 'three'
import { APARTMENT_DOOR_POS, APARTMENT_DOOR_RADIUS } from '../../game/gameRoomConstants'
import { findNearestFishingSpot, type FishingSpot } from '../../game/town/fishingSpots'
import {
  canRenewUnit,
  findNearestHousingUnit,
  housingActionFor,
  housingInteractPosition,
  housingPromptLabel,
  type HousingUnit,
} from '../../game/town/housing'
import type { TownLayout } from '../../game/assets/catalog'
import { findNearestWorkDoor, type WorkLot } from '../../game/town/workBuildings'

export interface ScreenPrompt {
  x: number
  y: number
  action: string
  detail?: string
}

export interface InteractionTargetsDeps {
  currentRoomLabel: Ref<'city' | 'apartment'>
  myPosition: { x: number; y: number; z: number }
  myAccountId: Ref<number | null>
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  /** Prompts are hidden while one of these is true (inventory open, housing request running). */
  promptsHidden: () => boolean
  housingUnits: Ref<HousingUnit[]>
  nearbyHousingUnit: Ref<HousingUnit | null>
  onExitDoor: () => void
  onHousingDoor: () => void
  onWorkDoor: (lot: WorkLot) => void
  onFishingSpot: (spot: FishingSpot) => void
}

/**
 * What the player can interact with where they stand (inside: the exit door; in town: a house door, a work
 * building door or a fishing spot, in that priority), the left-click / I action on it, and the prompt bubbles
 * projected on screen above it.
 */
export function useInteractionTargets(deps: InteractionTargetsDeps) {
  const nearApartmentDoor = ref(false)
  const workLots = ref<WorkLot[]>([])
  const nearbyWork = ref<WorkLot | null>(null)
  const fishingSpots = ref<FishingSpot[]>([])
  const nearbyFishingSpot = ref<FishingSpot | null>(null)
  const doorPrompt = ref<ScreenPrompt | null>(null)
  /** Second bubble next to a rented house whose lease ends soon (U key). */
  const renewPrompt = ref<{ x: number; y: number } | null>(null)
  const projection = new THREE.Vector3()

  /** The town layout lists the work buildings and the pond's fishing spots. */
  function setTownLayout(layout: TownLayout): void {
    workLots.value = layout.work ?? []
    fishingSpots.value = layout.pond?.fishingSpots ?? []
  }

  function updateProximity(): void {
    const { x, z } = deps.myPosition
    if (deps.currentRoomLabel.value === 'apartment') {
      const dx = x - APARTMENT_DOOR_POS.x
      const dz = z - APARTMENT_DOOR_POS.z
      nearApartmentDoor.value = dx * dx + dz * dz <= APARTMENT_DOOR_RADIUS * APARTMENT_DOOR_RADIUS
      deps.nearbyHousingUnit.value = null
      nearbyWork.value = null
      nearbyFishingSpot.value = null
      return
    }
    nearApartmentDoor.value = false
    const unit = findNearestHousingUnit(x, z, deps.housingUnits.value)
    deps.nearbyHousingUnit.value = unit
    nearbyWork.value = unit ? null : findNearestWorkDoor(x, z, workLots.value)
    nearbyFishingSpot.value = unit || nearbyWork.value ? null : findNearestFishingSpot(x, z, fishingSpots.value)
  }

  /** Use whatever the player stands at. Returns true if there was something. */
  function tryInteract(): boolean {
    // Recompute on the input itself so it works even if the last movement frame was skipped.
    updateProximity()
    if (deps.currentRoomLabel.value === 'apartment') {
      if (!nearApartmentDoor.value) return false
      deps.onExitDoor()
      return true
    }
    const work = nearbyWork.value
    const spot = nearbyFishingSpot.value
    if (deps.nearbyHousingUnit.value) deps.onHousingDoor()
    else if (work) deps.onWorkDoor(work)
    else if (spot) deps.onFishingSpot(spot)
    else return false
    return true
  }

  function projectToScreen(wx: number, wy: number, wz: number): { x: number; y: number } | null {
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!camera || !canvas) return null
    projection.set(wx, wy, wz).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: (projection.x * 0.5 + 0.5) * rect.width,
      y: (-projection.y * 0.5 + 0.5) * rect.height,
    }
  }

  function currentPrompt(): { prompt: ScreenPrompt | null; renew: { x: number; y: number } | null } {
    const none = { prompt: null, renew: null }
    if (deps.promptsHidden()) return none
    if (deps.currentRoomLabel.value === 'apartment') {
      if (!nearApartmentDoor.value) return none
      const screen = projectToScreen(APARTMENT_DOOR_POS.x, 1.5, APARTMENT_DOOR_POS.z)
      return { prompt: screen && { ...screen, action: 'Exit' }, renew: null }
    }
    const unit = deps.nearbyHousingUnit.value
    if (unit) {
      const action = housingActionFor(unit, deps.myAccountId.value)
      const pos = housingInteractPosition(unit)
      const screen = projectToScreen(pos.x, pos.y, pos.z)
      if (!screen || !action) return none
      return {
        prompt: { ...screen, ...housingPromptLabel(unit, action) },
        renew: canRenewUnit(unit, deps.myAccountId.value) ? { x: screen.x + 72, y: screen.y } : null,
      }
    }
    const work = nearbyWork.value
    if (work) {
      const screen = projectToScreen(work.door[0], 1.5, work.door[2])
      return { prompt: screen && { ...screen, action: 'Enter', detail: work.name }, renew: null }
    }
    const spot = nearbyFishingSpot.value
    if (spot) {
      const screen = projectToScreen(spot.lookAt[0], spot.lookAt[1] + 0.8, spot.lookAt[2])
      return { prompt: screen && { ...screen, action: 'Fish' }, renew: null }
    }
    return none
  }

  /** Every frame, after the camera moved. */
  function updatePrompts(): void {
    const { prompt, renew } = currentPrompt()
    doorPrompt.value = prompt
    renewPrompt.value = renew
  }

  return {
    nearApartmentDoor,
    doorPrompt,
    renewPrompt,
    setTownLayout,
    updateProximity,
    tryInteract,
    updatePrompts,
  }
}
