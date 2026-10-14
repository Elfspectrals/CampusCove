import * as THREE from 'three'
import { HOUSING_CUBE_INTERACT_RADIUS_PAD } from './gameRoomConstants'

export interface HousingUnitSnapshot {
  unit_id: number
  public_id: string
  offer_type: string
  price_coins: number
  rent_duration_hours: number
  pos_x: number
  pos_y: number
  pos_z: number
  size: number
  base_color_hex: string
  status: string
  occupant_account_id: number | null
  lease_expires_at: string | null
  room_public_id: string | null
  template_key: string
}

interface HousingCubeUserData {
  isHousingCube: true
  housingUnitId: string
  unit_id: number
  offer_type: string
  occupant_account_id: number | null
  template_key: string
  status: string
}

function isHousingCubeMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  return obj instanceof THREE.Mesh && (obj.userData as { isHousingCube?: boolean }).isHousingCube === true
}

function unitSize(unit: HousingUnitSnapshot): number {
  return unit.size > 0 ? unit.size : 2.5
}

export function hexToThreeColor(hex: string): THREE.Color {
  const raw = hex.trim()
  const normalized = raw.startsWith('#') ? raw : `#${raw}`
  const color = new THREE.Color()
  try {
    color.set(normalized)
  } catch {
    color.set('#888888')
  }
  return color
}

/** Occupied tint from occupant_account_id (stable HSL). Vacant uses base_color_hex. */
export function housingUnitDisplayColor(unit: HousingUnitSnapshot): THREE.Color {
  if (unit.status !== 'occupied' || unit.occupant_account_id === null) {
    return hexToThreeColor(unit.base_color_hex)
  }
  const hashed = Math.imul(unit.occupant_account_id, 2654435761) >>> 0
  const hue = (hashed % 360) / 360
  return new THREE.Color().setHSL(hue, 0.45, 0.42)
}

function writeCubeUserData(mesh: THREE.Mesh, unit: HousingUnitSnapshot): void {
  const data: HousingCubeUserData = {
    isHousingCube: true,
    housingUnitId: unit.public_id,
    unit_id: unit.unit_id,
    offer_type: unit.offer_type,
    occupant_account_id: unit.occupant_account_id,
    template_key: unit.template_key,
    status: unit.status,
  }
  mesh.userData = data
}

export function createHousingCubeMesh(unit: HousingUnitSnapshot): THREE.Mesh {
  const s = unitSize(unit)
  const geo = new THREE.BoxGeometry(s, s, s)
  const mat = new THREE.MeshStandardMaterial({
    color: housingUnitDisplayColor(unit),
    roughness: 0.72,
    metalness: 0.08,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(unit.pos_x, unit.pos_y, unit.pos_z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  writeCubeUserData(mesh, unit)
  return mesh
}

export function applyHousingCubeAppearance(mesh: THREE.Mesh, unit: HousingUnitSnapshot): void {
  const s = unitSize(unit)
  const geo = mesh.geometry
  if (geo instanceof THREE.BoxGeometry) {
    const params = geo.parameters
    if (params.width !== s || params.height !== s || params.depth !== s) {
      mesh.geometry.dispose()
      mesh.geometry = new THREE.BoxGeometry(s, s, s)
    }
  }
  const mat = mesh.material
  if (mat instanceof THREE.MeshStandardMaterial) {
    mat.color.copy(housingUnitDisplayColor(unit))
  }
  mesh.position.set(unit.pos_x, unit.pos_y, unit.pos_z)
  writeCubeUserData(mesh, unit)
}

function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose()
  const mat = mesh.material
  if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
  else mat.dispose()
}

/** Reuse meshes by public_id; update pose/color; drop stale units. */
export function syncHousingCubes(parent: THREE.Group, units: HousingUnitSnapshot[]): void {
  const wanted = new Set(units.map((u) => u.public_id))
  const byId = new Map<string, THREE.Mesh>()
  for (const child of [...parent.children]) {
    if (!isHousingCubeMesh(child)) continue
    const id = (child.userData as HousingCubeUserData).housingUnitId
    if (!wanted.has(id)) {
      parent.remove(child)
      disposeMesh(child)
      continue
    }
    byId.set(id, child)
  }

  for (const unit of units) {
    const existing = byId.get(unit.public_id)
    if (existing) {
      applyHousingCubeAppearance(existing, unit)
    } else {
      parent.add(createHousingCubeMesh(unit))
    }
  }
}

export function findNearestHousingUnit(
  x: number,
  z: number,
  units: HousingUnitSnapshot[],
  radiusPad: number = HOUSING_CUBE_INTERACT_RADIUS_PAD,
): HousingUnitSnapshot | null {
  let best: HousingUnitSnapshot | null = null
  let bestDistSq = Infinity
  for (const unit of units) {
    const reach = unitSize(unit) / 2 + radiusPad
    const dx = x - unit.pos_x
    const dz = z - unit.pos_z
    const distSq = dx * dx + dz * dz
    if (distSq <= reach * reach && distSq < bestDistSq) {
      bestDistSq = distSq
      best = unit
    }
  }
  return best
}

export function housingCubeInteractPosition(unit: HousingUnitSnapshot): { x: number; y: number; z: number } {
  return { x: unit.pos_x, y: unit.pos_y + unitSize(unit) / 2 + 0.35, z: unit.pos_z }
}
