import { ref } from 'vue'
import type * as THREE from 'three'

const REFRESH_SECONDS = 0.5

export function useRenderStats(getRenderer: () => THREE.WebGLRenderer | undefined) {
  const label = ref<string | null>(null)
  let sinceRefresh = 0

  function tick(dt: number): void {
    const renderer = getRenderer()
    if (!renderer) return
    renderer.info.autoReset = false
    sinceRefresh += dt
    if (sinceRefresh >= REFRESH_SECONDS) {
      sinceRefresh = 0
      const { calls, triangles } = renderer.info.render
      label.value = `${calls} draws · ${triangles} tris`
    }
    renderer.info.reset()
  }

  return { label, tick }
}
