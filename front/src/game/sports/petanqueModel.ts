import * as THREE from 'three'

export const PETANQUE_BOULES_URL = '/assets/decor/petanque_boules/model.glb'
export const BOULE_STEEL = 'DC_PetanqueBouleSteel'
export const BOULE_GROOVE = 'DC_PetanqueBouleGroove'
export const JACK_WOOD = 'DC_PetanqueJack'

function positionKey(p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number): string {
  return `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`
}

function triangleIndices(geometry: THREE.BufferGeometry): number[][] {
  const count = geometry.index ? geometry.index.count : geometry.getAttribute('position').count
  const at = (i: number) => (geometry.index ? geometry.index.getX(i) : i)
  const triangles: number[][] = []
  for (let i = 0; i + 2 < count; i += 3) triangles.push([at(i), at(i + 1), at(i + 2)])
  return triangles
}

function pick(geometry: THREE.BufferGeometry, keep: (triangle: number[], index: number) => boolean): THREE.BufferGeometry {
  const source = geometry.index ? geometry.toNonIndexed() : geometry
  const kept = triangleIndices(geometry).map((t, i) => [i, keep(t, i)] as const).filter(([, k]) => k).map(([i]) => i)
  const out = new THREE.BufferGeometry()
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const size = attribute.itemSize
    const array = new Float32Array(kept.length * 3 * size)
    kept.forEach((triangle, k) => {
      for (let v = 0; v < 3; v++) for (let c = 0; c < size; c++) array[(k * 3 + v) * size + c] = attribute.getComponent(triangle * 3 + v, c)
    })
    out.setAttribute(name, new THREE.BufferAttribute(array, size))
  }
  return out
}

export function firstComponent(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = geometry.getAttribute('position')
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    let root = k
    while (parent.get(root) !== root) root = parent.get(root) as string
    parent.set(k, root)
    return root
  }
  const triangles = triangleIndices(geometry)
  const keys = triangles.map((t) => t.map((i) => positionKey(position, i)))
  for (const corner of keys) for (const k of corner) if (!parent.has(k)) parent.set(k, k)
  for (const [a, b, c] of keys) {
    parent.set(find(b as string), find(a as string))
    parent.set(find(c as string), find(a as string))
  }
  if (keys.length === 0) throw new Error('petanque model: empty boule mesh')
  const root = find(keys[0]![0] as string)
  const inFirst = new Set(keys.map((k, i) => (find(k[0] as string) === root ? i : -1)).filter((i) => i >= 0))
  return pick(geometry, (_triangle, i) => inFirst.has(i))
}

export function trianglesNear(geometry: THREE.BufferGeometry, center: THREE.Vector3, maxDistance: number): THREE.BufferGeometry {
  const position = geometry.getAttribute('position')
  const centroid = new THREE.Vector3()
  return pick(geometry, ([a, b, c]) => {
    centroid.set(
      (position.getX(a!) + position.getX(b!) + position.getX(c!)) / 3,
      (position.getY(a!) + position.getY(b!) + position.getY(c!)) / 3,
      (position.getZ(a!) + position.getZ(b!) + position.getZ(c!)) / 3,
    )
    return centroid.distanceTo(center) <= maxDistance
  })
}

function meshByMaterial(scene: THREE.Object3D, material: string): THREE.Mesh {
  let found: THREE.Mesh | null = null
  scene.updateMatrixWorld(true)
  scene.traverse((o) => {
    if (found || !(o instanceof THREE.Mesh)) return
    const m = Array.isArray(o.material) ? o.material[0] : o.material
    if (m?.name === material) found = o
  })
  if (!found) throw new Error(`petanque model: no mesh with material ${material}`)
  return found
}

function worldGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  return mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
}

export interface PetanquePieces {
  boule: THREE.Group
  jack: THREE.Mesh
  bouleRadius: number
  jackRadius: number
}

export function petanquePieces(scene: THREE.Object3D): PetanquePieces {
  const steelMesh = meshByMaterial(scene, BOULE_STEEL)
  const steel = firstComponent(worldGeometry(steelMesh))
  steel.computeBoundingBox()
  const box = steel.boundingBox as THREE.Box3
  const center = box.getCenter(new THREE.Vector3())
  const bouleRadius = box.getSize(new THREE.Vector3()).x / 2
  const groove = trianglesNear(worldGeometry(meshByMaterial(scene, BOULE_GROOVE)), center, bouleRadius * 1.2)
  steel.translate(-center.x, -center.y, -center.z)
  groove.translate(-center.x, -center.y, -center.z)
  const boule = new THREE.Group()
  boule.add(new THREE.Mesh(steel, steelMesh.material), new THREE.Mesh(groove, meshByMaterial(scene, BOULE_GROOVE).material))
  const jackMesh = meshByMaterial(scene, JACK_WOOD)
  const jackGeometry = worldGeometry(jackMesh)
  jackGeometry.computeBoundingBox()
  const jackBox = jackGeometry.boundingBox as THREE.Box3
  const jackCenter = jackBox.getCenter(new THREE.Vector3())
  jackGeometry.translate(-jackCenter.x, -jackCenter.y, -jackCenter.z)
  const jack = new THREE.Mesh(jackGeometry, jackMesh.material)
  return { boule, jack, bouleRadius, jackRadius: jackBox.getSize(new THREE.Vector3()).x / 2 }
}
