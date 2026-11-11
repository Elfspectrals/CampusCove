import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type StaticMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material>

function isStatic(node: THREE.Object3D): node is StaticMesh {
  return node instanceof THREE.Mesh
    && !(node instanceof THREE.InstancedMesh)
    && !(node instanceof THREE.SkinnedMesh)
    && node.children.length === 0
    && !Array.isArray(node.material)
    && !node.material.transparent
    && Object.keys(node.geometry.morphAttributes).length === 0
    && node.matrixWorld.determinant() > 0
}

function collectStatic(node: THREE.Object3D, movingNodeNames: ReadonlySet<string>, found: StaticMesh[]): void {
  if (!node.visible || movingNodeNames.has(node.name)) return
  if (isStatic(node)) found.push(node)
  for (const child of node.children) collectStatic(child, movingNodeNames, found)
}

function mergeKey(mesh: StaticMesh): string {
  const { attributes, index } = mesh.geometry
  const layout = Object.keys(attributes).sort().map((name) => {
    const attribute = attributes[name]!
    return `${name}:${attribute.array.constructor.name}:${attribute.itemSize}:${attribute.normalized}`
  })
  return [mesh.material.uuid, index ? 'indexed' : 'unindexed', mesh.castShadow, mesh.receiveShadow, ...layout].join('|')
}

export function mergeStaticMeshes(root: THREE.Object3D, movingNodeNames: ReadonlySet<string>): void {
  root.updateMatrixWorld(true)
  const found: StaticMesh[] = []
  collectStatic(root, movingNodeNames, found)
  const groups = new Map<string, StaticMesh[]>()
  for (const mesh of found) {
    const key = mergeKey(mesh)
    groups.set(key, [...(groups.get(key) ?? []), mesh])
  }
  const toRoot = root.matrixWorld.clone().invert()
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue
    const first = meshes[0]!
    const merged = mergeGeometries(meshes.map((mesh) => mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld))))
    if (!merged) throw new Error(`Could not merge the ${meshes.length} meshes of material ${first.material.name}`)
    const mesh = new THREE.Mesh(merged, first.material)
    mesh.name = `Merged_${first.material.name}`
    mesh.castShadow = first.castShadow
    mesh.receiveShadow = first.receiveShadow
    for (const original of meshes) original.removeFromParent()
    root.add(mesh)
  }
}
