/**
 * Walk heights of the open world. Each zone with relief ships a heightmap (a 1 m grid in its layout JSON, see
 * docs/ASSETS_STYLE_GUIDE.md "Relief"); everywhere else the ground is flat at y = 0. Zones register their grid by
 * key, so loading a second zone with relief never replaces the first. `npm run topo:check` compares these grids
 * with the ground actually drawn in every zone GLB.
 */
export interface TerrainHeightmap {
  x0: number
  z0: number
  cell: number
  cols: number
  rows: number
  heights: number[]
}

const heightmaps = new Map<string, TerrainHeightmap>()

export function setTerrainHeightmap(zoneKey: string, heightmap: TerrainHeightmap): void {
  const expected = heightmap.cols * heightmap.rows
  if (heightmap.heights.length !== expected) {
    throw new Error(`Terrain heightmap ${zoneKey} has ${heightmap.heights.length} heights, expected ${expected}`)
  }
  heightmaps.set(zoneKey, heightmap)
}

export function terrainHeightmaps(): ReadonlyMap<string, TerrainHeightmap> {
  return heightmaps
}

/** Bilinear height inside one grid, or null outside it. */
export function heightmapAt(map: TerrainHeightmap, x: number, z: number): number | null {
  const fx = (x - map.x0) / map.cell
  const fz = (z - map.z0) / map.cell
  if (fx < 0 || fz < 0 || fx > map.cols - 1 || fz > map.rows - 1) return null
  const i = Math.min(Math.floor(fx), map.cols - 2)
  const j = Math.min(Math.floor(fz), map.rows - 2)
  const tx = fx - i
  const tz = fz - j
  const h = map.heights
  const row = j * map.cols
  const near = h[row + i]! * (1 - tx) + h[row + i + 1]! * tx
  const far = h[row + map.cols + i]! * (1 - tx) + h[row + map.cols + i + 1]! * tx
  return near * (1 - tz) + far * tz
}

/** Highest walk height of the grids covering (x, z): grids may overlap at a shared edge, both then fade to 0. */
export function terrainHeightIn(maps: Iterable<TerrainHeightmap>, x: number, z: number): number {
  let best: number | null = null
  for (const map of maps) {
    const h = heightmapAt(map, x, z)
    if (h !== null && (best === null || h > best)) best = h
  }
  return best ?? 0
}

export function terrainHeightAt(x: number, z: number): number {
  return terrainHeightIn(heightmaps.values(), x, z)
}
