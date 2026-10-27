import { ref, type Ref } from 'vue'
import * as THREE from 'three'
import { findNearestFishingSpot, type FishingSpot } from '../../game/town/fishingSpots'
import {
  findNearestHousingUnit,
  housingInteractPosition,
  housingPromptLabel,
  type HousingAction,
  type HousingUnit,
} from '../../game/town/housing'
import { fishingSpots as manifestFishingSpots, workBuildings, type WorldManifest } from '../../game/world/worldManifest'
import { findNearestWorkDoor, type WorkLot } from '../../game/town/workBuildings'

export interface ScreenPrompt {
  x: number
  y: number
  key?: string
  action: string
  detail?: string
}

export interface InteractionTargetsDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  /** Prompts are hidden while one of these is true (inventory open, housing request running). */
  promptsHidden: () => boolean
  housingUnits: Ref<HousingUnit[]>
  nearbyHousingUnit: Ref<HousingUnit | null>
  housingActionFor: (unit: HousingUnit) => HousingAction | null
  isWorkDoorOpen: (lot: WorkLot) => boolean
  onHousingDoor: () => void
  onWorkDoor: (lot: WorkLot) => void
  onFishingSpot: (spot: FishingSpot) => void
}

/**
 * What the player can interact with where they stand (a house door, a work building door or a fishing spot, in
 * that priority), the left-click / I action on it, and the prompt bubbles projected on screen above it.
 */
export function useInteractionTargets(deps: InteractionTargetsDeps) {
  const workLots = ref<WorkLot[]>([])
  const nearbyWork = ref<WorkLot | null>(null)
  const fishingSpots = ref<FishingSpot[]>([])
  const nearbyFishingSpot = ref<FishingSpot | null>(null)
  const doorPrompt = ref<ScreenPrompt | null>(null)
  const projection = new THREE.Vector3()

  /** The world manifest lists the work buildings and the pond's fishing spots. */
  function setWorldManifest(manifest: WorldManifest): void {
    workLots.value = workBuildings(manifest)
    fishingSpots.value = manifestFishingSpots(manifest)
  }

  function updateProximity(): void {
    const { x, z } = deps.myPosition
    const unit = findNearestHousingUnit(x, z, deps.housingUnits.value)
    deps.nearbyHousingUnit.value = unit
    nearbyWork.value = unit ? null : findNearestWorkDoor(x, z, workLots.value)
    nearbyFishingSpot.value = unit || nearbyWork.value ? null : findNearestFishingSpot(x, z, fishingSpots.value)
  }

  /** Use whatever the player stands at. Returns true if there was something. */
  function tryInteract(): boolean {
    // Recompute on the input itself so it works even if the last movement frame was skipped.
    updateProximity()
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

  function currentPrompt(): ScreenPrompt | null {
    if (deps.promptsHidden()) return null
    const unit = deps.nearbyHousingUnit.value
    if (unit) {
      const action = deps.housingActionFor(unit)
      const pos = housingInteractPosition(unit)
      const screen = projectToScreen(pos.x, pos.y, pos.z)
      return screen && action && { ...screen, ...housingPromptLabel(unit, action) }
    }
    const work = nearbyWork.value
    if (work) {
      const screen = projectToScreen(work.door[0], 1.5, work.door[2])
      return screen && { ...screen, action: deps.isWorkDoorOpen(work) ? 'Close' : 'Open', detail: work.name }
    }
    const spot = nearbyFishingSpot.value
    if (spot) {
      const screen = projectToScreen(spot.lookAt[0], spot.lookAt[1] + 0.8, spot.lookAt[2])
      return screen && { ...screen, action: 'Fish' }
    }
    return null
  }

  /** Every frame, after the camera moved. */
  function updatePrompts(): void {
    doorPrompt.value = currentPrompt()
  }

  return {
    doorPrompt,
    setWorldManifest,
    updateProximity,
    tryInteract,
    updatePrompts,
  }
}
