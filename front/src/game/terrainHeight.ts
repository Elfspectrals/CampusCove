export interface TerrainHeightmap {
  x0: number
  z0: number
  cell: number
  cols: number
  rows: number
  heights: number[]
}

let activeHeightmap: TerrainHeightmap | null = null

export function setTerrainHeightmap(heightmap: TerrainHeightmap): void {
  const expected = heightmap.cols * heightmap.rows
  if (heightmap.heights.length !== expected) {
    throw new Error(`Terrain heightmap has ${heightmap.heights.length} heights, expected ${expected}`)
  }
  activeHeightmap = heightmap
}

export function terrainHeightAt(x: number, z: number): number {
  const map = activeHeightmap
  if (!map) return 0
  const fx = (x - map.x0) / map.cell
  const fz = (z - map.z0) / map.cell
  if (fx < 0 || fz < 0 || fx > map.cols - 1 || fz > map.rows - 1) return 0
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
