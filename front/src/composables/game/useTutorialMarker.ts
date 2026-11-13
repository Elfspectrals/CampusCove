import { shallowRef, type Ref } from 'vue'
import * as THREE from 'three'
import type { TutorialStep } from '../../api/tutorial'
import { metresTo, screenMarker, tutorialTarget, type ScreenMarker, type TutorialPlaces } from '../../game/tutorialMarker'

const MARKER_HEIGHT = 3
const EDGE_MARGIN = 48

export interface TutorialMarkerDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  step: () => TutorialStep | null
  places: () => TutorialPlaces
}

export function useTutorialMarker(deps: TutorialMarkerDeps) {
  const marker = shallowRef<(ScreenMarker & { metres: number }) | null>(null)
  const projection = new THREE.Vector3()

  function tick(): void {
    const step = deps.step()
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    const target = step && tutorialTarget(step, deps.myPosition, deps.places())
    if (!target || !camera || !canvas) {
      marker.value = null
      return
    }
    projection.set(target[0], target[1] + MARKER_HEIGHT, target[2]).project(camera)
    const rect = canvas.getBoundingClientRect()
    marker.value = {
      ...screenMarker(projection, { width: rect.width, height: rect.height }, EDGE_MARGIN),
      metres: metresTo(deps.myPosition, target),
    }
  }

  return { marker, tick }
}
