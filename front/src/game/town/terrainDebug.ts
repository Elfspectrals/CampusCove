/**
 * Overlay of the walk heights (H key in /game, dev only): every zone heightmap as a wireframe sheet drawn through
 * the depth buffer, coloured from blue (y = 0) to red (highest point). Where the sheet floats above the drawn
 * ground or dives under it, the walk height does not follow the terrain (`npm run topo:check` finds those spots).
 */
import * as THREE from 'three'
import { terrainHeightmaps, type TerrainHeightmap } from './terrainHeight'

const LIFT = 0.05
let debugGroup: THREE.Group | null = null

function sheet(map: TerrainHeightmap, top: number): THREE.Mesh {
  const positions: number[] = []
  const colors: number[] = []
  const color = new THREE.Color()
  for (let j = 0; j < map.rows; j++) {
    for (let i = 0; i < map.cols; i++) {
      const h = map.heights[j * map.cols + i]!
      positions.push(map.x0 + i * map.cell, h + LIFT, map.z0 + j * map.cell)
      color.setHSL(0.66 * (1 - Math.min(h / top, 1)), 0.9, 0.5)
      colors.push(color.r, color.g, color.b)
    }
  }
  const indices: number[] = []
  for (let j = 0; j < map.rows - 1; j++) {
    for (let i = 0; i < map.cols - 1; i++) {
      const a = j * map.cols + i
      indices.push(a, a + map.cols, a + 1, a + 1, a + map.cols, a + map.cols + 1)
    }
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geom.setIndex(indices)
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true, transparent: true, opacity: 0.8 })
  return new THREE.Mesh(geom, mat)
}

function dispose(): void {
  debugGroup?.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      ;(obj.material as THREE.Material).dispose()
    }
  })
  debugGroup?.parent?.remove(debugGroup)
  debugGroup = null
}

/** Show or hide the overlay; rebuilt on each show so a zone loaded since then appears. Returns the zones shown. */
export function toggleTerrainDebug(scene: THREE.Scene): string[] | null {
  if (debugGroup) {
    dispose()
    return null
  }
  const maps = terrainHeightmaps()
  const top = Math.max(1, ...[...maps.values()].flatMap((m) => m.heights))
  debugGroup = new THREE.Group()
  debugGroup.name = 'TerrainDebug'
  for (const [key, map] of maps) {
    const mesh = sheet(map, top)
    mesh.name = `TerrainDebug_${key}`
    debugGroup.add(mesh)
  }
  scene.add(debugGroup)
  return [...maps.keys()]
}
