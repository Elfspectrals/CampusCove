import * as THREE from 'three'
import { storeBuildings, workBuildings, houseBuildings, type WorldBounds, type WorldManifest } from './worldManifest.ts'

/**
 * The world map: one top-down orthographic shot of the whole town, taken once when it loads, with markers drawn
 * over it by the HUD. North (-Z) is up, east (+X) is right. Nothing is rendered per frame.
 */

export type MapMarkerKind = 'store' | 'work' | 'home'

export interface MapMarker {
  id: string
  kind: MapMarkerKind
  name: string
  x: number
  z: number
}

export interface WorldMapImage {
  url: string
  area: WorldBounds
}

/** Ground around the playable zones kept in the shot, in metres. */
const AREA_MARGIN = 12
/** Longest side of the shot, in pixels. */
const MAP_MAX_PX = 2048
const CAMERA_HEIGHT = 400

/** Smallest rectangle around every zone (the manifest's own bounds are the far-away world limits), plus a margin. */
export function mapAreaOf(manifest: WorldManifest): WorldBounds {
  const area = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
  for (const { bounds } of manifest.zones) {
    area.minX = Math.min(area.minX, bounds.minX)
    area.maxX = Math.max(area.maxX, bounds.maxX)
    area.minZ = Math.min(area.minZ, bounds.minZ)
    area.maxZ = Math.max(area.maxZ, bounds.maxZ)
  }
  if (!Number.isFinite(area.minX)) return { ...manifest.bounds }
  return { minX: area.minX - AREA_MARGIN, maxX: area.maxX + AREA_MARGIN, minZ: area.minZ - AREA_MARGIN, maxZ: area.maxZ + AREA_MARGIN }
}

/** Where a world point falls on the map, as fractions of its width (u) and height (v) from the top-left corner. */
export function worldToMap(x: number, z: number, area: WorldBounds): { u: number; v: number } {
  return { u: (x - area.minX) / (area.maxX - area.minX), v: (z - area.minZ) / (area.maxZ - area.minZ) }
}

/** Clockwise screen rotation (degrees) of an arrow pointing where a camera with this yaw looks (yaw 0 faces -Z, north). */
export function headingDegrees(yaw: number): number {
  return (-yaw * 180) / Math.PI
}

/** Shops, workplaces, and the house the player lives in. */
export function mapMarkers(manifest: WorldManifest, homeKey: string | null): MapMarker[] {
  const at = (id: string, kind: MapMarkerKind, name: string, position: [number, number, number]): MapMarker => ({
    id,
    kind,
    name,
    x: position[0],
    z: position[2],
  })
  const markers = [
    ...storeBuildings(manifest).map((b) => at(b.key, 'store', b.name, b.position)),
    ...workBuildings(manifest).map((b) => at(b.key, 'work', b.name, b.position)),
  ]
  const home = homeKey ? houseBuildings(manifest).find((b) => b.key === homeKey) : undefined
  if (home) markers.push(at(home.key, 'home', home.name, home.position))
  return markers
}

/** Approximate width of one label character, in pixels of the full map. */
const LABEL_CHAR_PX = 6
const LABEL_HEIGHT_PX = 14

/** Label rows tried in order: under the pin, above it, then one row further each way. */
const LABEL_ROWS = [1, -1, 2, -2]

/**
 * Vertical offset of each full-map label, in label rows from its pin (1 = just under it): a label moves above, then
 * further out, when it would overlap a neighbour's (shops in a row). `u` / `v` are map fractions, `mapPx` its size.
 */
export function labelRows(pins: Array<{ u: number; v: number; name: string }>, mapPx: { w: number; h: number }): number[] {
  const rows: number[] = pins.map(() => 1)
  const placed: Array<{ x: number; y: number; half: number }> = []
  const order = pins.map((pin, i) => ({ pin, i })).sort((a, b) => a.pin.u - b.pin.u)
  for (const { pin, i } of order) {
    const boxAt = (row: number) => ({ x: pin.u * mapPx.w, y: pin.v * mapPx.h + row * LABEL_HEIGHT_PX, half: (pin.name.length * LABEL_CHAR_PX) / 2 })
    const clashes = (box: { x: number; y: number; half: number }) =>
      placed.some((p) => Math.abs(p.x - box.x) < p.half + box.half && Math.abs(p.y - box.y) < LABEL_HEIGHT_PX)
    const row = LABEL_ROWS.find((r) => !clashes(boxAt(r))) ?? 1
    rows[i] = row
    placed.push(boxAt(row))
  }
  return rows
}

/**
 * Renders the scene from straight above `area` and returns it as an image. Must run right before the frame's
 * normal render (same task): the canvas is resized for the shot, copied, then put back.
 */
export function captureWorldMap(renderer: THREE.WebGLRenderer, scene: THREE.Scene, area: WorldBounds): WorldMapImage {
  const width = area.maxX - area.minX
  const depth = area.maxZ - area.minZ
  const scale = MAP_MAX_PX / Math.max(width, depth)
  const px = { w: Math.round(width * scale), h: Math.round(depth * scale) }

  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, depth / 2, -depth / 2, 1, CAMERA_HEIGHT * 2)
  camera.position.set((area.minX + area.maxX) / 2, CAMERA_HEIGHT, (area.minZ + area.maxZ) / 2)
  camera.up.set(0, 0, -1)
  camera.lookAt(camera.position.x, 0, camera.position.z)
  camera.updateMatrixWorld()

  const previousSize = renderer.getSize(new THREE.Vector2())
  const previousRatio = renderer.getPixelRatio()
  const fog = scene.fog
  scene.fog = null
  renderer.setPixelRatio(1)
  renderer.setSize(px.w, px.h, false)
  renderer.render(scene, camera)

  const canvas = document.createElement('canvas')
  canvas.width = px.w
  canvas.height = px.h
  canvas.getContext('2d')?.drawImage(renderer.domElement, 0, 0, px.w, px.h, 0, 0, px.w, px.h)

  scene.fog = fog
  renderer.setPixelRatio(previousRatio)
  renderer.setSize(previousSize.x, previousSize.y, false)
  return { url: canvas.toDataURL('image/jpeg', 0.85), area }
}
