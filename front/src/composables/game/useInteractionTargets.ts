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
import {
  fishingSpots as manifestFishingSpots,
  storeBuildings,
  workBuildings,
  type StoreBuilding,
  type WorldManifest,
} from '../../game/world/worldManifest'
import { findNearestWorkDoor, type WorkLot } from '../../game/town/workBuildings'

export interface ScreenPrompt {
  x: number
  y: number
  key?: string
  action: string
  detail?: string
}

/** Something else the player can use where they stand, checked after the doors in the order given. */
export interface InteractionSource {
  prompt: () => ScreenPrompt | null
  /** Returns true when it used the interaction. */
  interact: () => boolean
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
  isWorkDoorOpen: (lot: PublicLot) => boolean
  onHousingDoor: () => void
  onWorkDoor: (lot: PublicLot) => void
  onFishingSpot: (spot: FishingSpot) => void
  /** Inside Cove Home: the item being looked at (its price-tag anchor + prompt text), and buying it. */
  storeTarget: () => { position: [number, number, number]; detail: string } | null
  onStoreTarget: () => void
  /** Lower-priority targets (pub counters, seats, games), in priority order. */
  sources?: InteractionSource[]
}

type PublicLot = WorkLot | StoreBuilding

/**
 * What the player can interact with where they stand (a house door, a work building door or a fishing spot, in
 * that priority), the left-click / I action on it, and the prompt bubbles projected on screen above it.
 */
export function useInteractionTargets(deps: InteractionTargetsDeps) {
  const workLots = ref<PublicLot[]>([])
  const nearbyWork = ref<PublicLot | null>(null)
  const fishingSpots = ref<FishingSpot[]>([])
  const nearbyFishingSpot = ref<FishingSpot | null>(null)
  const doorPrompt = ref<ScreenPrompt | null>(null)
  const projection = new THREE.Vector3()

  /** The world manifest lists the work buildings and the pond's fishing spots. */
  function setWorldManifest(manifest: WorldManifest): void {
    workLots.value = [...workBuildings(manifest), ...storeBuildings(manifest)]
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
    if (deps.storeTarget()) {
      deps.onStoreTarget()
      return true
    }
    const work = nearbyWork.value
    const spot = nearbyFishingSpot.value
    if (deps.nearbyHousingUnit.value) deps.onHousingDoor()
    else if (work) deps.onWorkDoor(work)
    else if (spot) deps.onFishingSpot(spot)
    else return (deps.sources ?? []).some((source) => source.interact())
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
    const item = deps.storeTarget()
    if (item) {
      const [tx, ty, tz] = item.position
      const screen = projectToScreen(tx, ty + 0.55, tz)
      return screen && { ...screen, action: 'Buy', detail: item.detail }
    }
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
    for (const source of deps.sources ?? []) {
      const prompt = source.prompt()
      if (prompt) return prompt
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
