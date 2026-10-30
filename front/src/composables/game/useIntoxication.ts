import { computed, ref, type Ref } from 'vue'
import type * as THREE from 'three'
import { cameraSway, drunkScreenEffects, drunkWalkFactor, intoxicationStage, swayAmplitude } from '../../game/pub/intoxication'
import { comfortSettings } from './useComfortSettings'

/** Edge blur at the black-out, in CSS pixels. */
const MAX_BLUR_PX = 2.5
/** SVG filter in GameDrunkEffects.vue that draws the faint second image. */
export const DOUBLE_VISION_FILTER_ID = 'cc-drunk-double'

export interface IntoxicationDeps {
  /** Survival's "reduced effects" accessibility setting. */
  reducedEffects: Ref<boolean>
}

/**
 * Alcohol as the player feels it: the level pushed by the server with the survival stats, the camera sway,
 * the screen effects (GameDrunkEffects.vue + a filter on the canvas) and the slower walk.
 */
export function useIntoxication(deps: IntoxicationDeps) {
  const value = ref(0)
  const stage = computed(() => intoxicationStage(value.value))
  const effects = computed(() => drunkScreenEffects(value.value, deps.reducedEffects.value))
  const canvasFilter = computed(() => {
    const { blur, doubleVision } = effects.value
    const parts: string[] = []
    if (blur > 0) parts.push(`blur(${(blur * MAX_BLUR_PX).toFixed(2)}px)`)
    if (doubleVision > 0) parts.push(`url(#${DOUBLE_VISION_FILTER_ID})`)
    return parts.join(' ')
  })
  let elapsed = 0

  function set(intoxication: number): void {
    value.value = intoxication
  }

  function walkFactor(): number {
    return drunkWalkFactor(value.value)
  }

  /** After useGameMovement placed the camera: a slow roll and a sideways swing, none with reduced camera motion. */
  function applyToCamera(camera: THREE.PerspectiveCamera, dt: number): void {
    elapsed += dt
    const amplitude = swayAmplitude(value.value, comfortSettings.reduceCameraMotion)
    if (amplitude === 0) return
    const { roll, lateral } = cameraSway(amplitude, elapsed)
    camera.rotation.z += roll
    const yaw = camera.rotation.y
    camera.position.x += Math.cos(yaw) * lateral
    camera.position.z -= Math.sin(yaw) * lateral
  }

  return { value, stage, effects, canvasFilter, set, walkFactor, applyToCamera }
}
