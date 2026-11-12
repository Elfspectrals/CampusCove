import * as THREE from 'three'

function bakePiece(piece: THREE.SkinnedMesh, toFigure: THREE.Matrix4): THREE.Mesh {
  const geometry = piece.geometry.clone()
  const position = geometry.getAttribute('position')
  if (!(position.array instanceof Float32Array)) throw new Error(`Cannot bake ${piece.name}: its positions are not 32-bit floats`)
  const directions = [geometry.getAttribute('normal'), geometry.getAttribute('tangent')].filter((attribute) => attribute !== undefined)
  const pieceToFigure = new THREE.Matrix4().multiplyMatrices(toFigure, piece.matrixWorld)
  const rest = new THREE.Vector3()
  const posed = new THREE.Vector3()
  const tip = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    rest.fromBufferAttribute(position, i)
    piece.applyBoneTransform(i, posed.copy(rest))
    for (const direction of directions) {
      piece.applyBoneTransform(i, tip.fromBufferAttribute(direction, i).add(rest)).sub(posed).transformDirection(pieceToFigure)
      direction.setXYZ(i, tip.x, tip.y, tip.z)
    }
    posed.applyMatrix4(pieceToFigure)
    position.setXYZ(i, posed.x, posed.y, posed.z)
  }
  geometry.deleteAttribute('skinIndex')
  geometry.deleteAttribute('skinWeight')
  geometry.boundingBox = null
  geometry.boundingSphere = null
  const mesh = new THREE.Mesh(geometry, piece.material)
  mesh.name = piece.name
  mesh.castShadow = piece.castShadow
  mesh.receiveShadow = piece.receiveShadow
  mesh.userData = { ...piece.userData, sharedGeometry: false }
  return mesh
}

function collectShown(node: THREE.Object3D, found: THREE.SkinnedMesh[]): void {
  if (!node.visible) return
  if (node instanceof THREE.SkinnedMesh) found.push(node)
  for (const child of node.children) collectShown(child, found)
}

export function bakeStaticFigure(character: THREE.Object3D): THREE.Group {
  character.updateMatrixWorld(true)
  const toFigure = character.matrixWorld.clone().invert()
  const shown: THREE.SkinnedMesh[] = []
  collectShown(character, shown)
  const figure = new THREE.Group()
  figure.name = character.name
  figure.position.copy(character.position)
  figure.quaternion.copy(character.quaternion)
  figure.scale.copy(character.scale)
  figure.add(...shown.map((piece) => bakePiece(piece, toFigure)))
  return figure
}
