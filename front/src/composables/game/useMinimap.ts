import { computed, reactive, ref, shallowRef } from 'vue'
import type * as THREE from 'three'
import { matches } from '../../config/keybindings'
import { captureWorldMap, headingDegrees, mapAreaOf, mapMarkers, type WorldMapImage } from '../../game/world/minimap'
import type { WorldManifest } from '../../game/world/worldManifest'

export interface MinimapDeps {
  getRenderer: () => THREE.WebGLRenderer | undefined
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.Camera | undefined
  myPosition: { x: number; z: number }
  /** Key of the house the player lives in, if any. */
  homeKey: () => string | null
  /** Key of the building the player stands in, if any. */
  buildingKey: () => string | null
}

/** HUD refresh of the player arrow; the map itself never re-renders. */
const PLAYER_UPDATE_MS = 50

/** Corner map and full map (M): one top-down shot of the town taken when it loads, markers and the player on top. */
export function useMinimap(deps: MinimapDeps) {
  const manifest = shallowRef<WorldManifest | null>(null)
  const image = shallowRef<WorldMapImage | null>(null)
  const fullOpen = ref(false)
  const player = reactive({ x: deps.myPosition.x, z: deps.myPosition.z, heading: 0 })
  let pendingCapture = false
  let lastPlayerUpdate = 0

  const markers = computed(() => (manifest.value ? mapMarkers(manifest.value, deps.homeKey()) : []))
  const insideName = computed(() => {
    const key = deps.buildingKey()
    if (!key || !manifest.value) return null
    for (const zone of manifest.value.zones) {
      const building = zone.buildings?.find((b) => b.key === key)
      if (building) return building.name
    }
    return null
  })

  /** The town group is added to the scene right after this: the shot is taken on the next frame. */
  function onTownLoaded(next: WorldManifest): void {
    manifest.value = next
    pendingCapture = true
  }

  /** Called every frame before the normal render. */
  function tick(): void {
    const renderer = deps.getRenderer()
    const scene = deps.getScene()
    if (pendingCapture && manifest.value && renderer && scene) {
      pendingCapture = false
      image.value = captureWorldMap(renderer, scene, mapAreaOf(manifest.value))
    }
    const now = performance.now()
    if (now - lastPlayerUpdate < PLAYER_UPDATE_MS) return
    lastPlayerUpdate = now
    player.x = deps.myPosition.x
    player.z = deps.myPosition.z
    player.heading = headingDegrees(deps.getCamera()?.rotation.y ?? 0)
  }

  function onKeyDown(e: KeyboardEvent): boolean {
    if (matches('map', e.code) && !e.repeat) {
      fullOpen.value = !fullOpen.value
      return true
    }
    if (fullOpen.value && e.code === 'Escape') {
      fullOpen.value = false
      return false
    }
    return false
  }

  return { image, markers, player, insideName, fullOpen, onTownLoaded, tick, onKeyDown }
}
