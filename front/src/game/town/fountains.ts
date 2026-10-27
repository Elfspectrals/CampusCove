import * as THREE from 'three'
import { DRINKING_FOUNTAIN_URL } from '../assets/catalog'
import { createGltfLoader } from '../gltfLoaderFactory'
import { terrainHeightAt } from './terrainHeight'

/** Same reach as FOUNTAIN_REACH in socket/src/survival.js (the server re-checks it). */
const FOUNTAIN_REACH = 2.0

export type Fountain = { x: number; y: number; z: number }

/** Drinking fountains of the world manifest, put on the terrain. */
export function createFountains(points: ReadonlyArray<[number, number, number]>) {
  const group = new THREE.Group()
  group.name = 'DrinkingFountains'
  const fountains: Fountain[] = points.map(([x, , z]) => ({ x, y: terrainHeightAt(x, z), z }))

  void createGltfLoader()
    .loadAsync(DRINKING_FOUNTAIN_URL)
    .then((gltf) => {
      for (const f of fountains) {
        const model = gltf.scene.clone()
        model.position.set(f.x, f.y, f.z)
        group.add(model)
      }
    })
    .catch((err: unknown) => console.error('[fountains] load failed', err))

  function nearest(x: number, z: number): Fountain | null {
    let best: Fountain | null = null
    let bestDist = FOUNTAIN_REACH
    for (const f of fountains) {
      const d = Math.hypot(f.x - x, f.z - z)
      if (d <= bestDist) {
        bestDist = d
        best = f
      }
    }
    return best
  }

  return { group, nearest }
}
