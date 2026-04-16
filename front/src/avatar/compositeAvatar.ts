import * as THREE from 'three'

/** Known wearable codes from backend seed (visual hints for low-poly v1). */
const DEFAULT_BODY = 'COS_WEAR_BODY_DEFAULT'
const DEFAULT_HAIR = 'COS_WEAR_HAIR_DEFAULT'
const DEFAULT_TOP = 'COS_WEAR_TOP_DEFAULT'
const DEFAULT_BOTTOM = 'COS_WEAR_BOTTOM_DEFAULT'
const DEFAULT_SHOES = 'COS_WEAR_SHOES_DEFAULT'
const HEAD_EMPTY = 'COS_WEAR_HEAD_EMPTY'

function hashHue(code: string): number {
  let h = 0
  for (let i = 0; i < code.length; i += 1) h = (h * 31 + code.charCodeAt(i)) >>> 0
  return (h % 360) / 360
}

function hslColor(h: number, s: number, l: number): number {
  const c = new THREE.Color().setHSL(h, s, l)
  return c.getHex()
}

function partColor(code: string | null, fallbackHue: number, lightness: number): number {
  if (!code || code === HEAD_EMPTY) return 0x2a2a3e
  const h = (hashHue(code) * 0.15 + fallbackHue) % 1
  return hslColor(h, 0.45, lightness)
}

export interface AppearanceCodes {
  body: string | null
  hair: string | null
  top: string | null
  bottom: string | null
  shoes: string | null
  head_accessory: string | null
}

function resolveCode(slot: keyof AppearanceCodes, codes: Partial<AppearanceCodes> | null): string | null {
  const v = codes?.[slot]
  if (v !== undefined && v !== null && v !== '') return v
  switch (slot) {
    case 'body':
      return DEFAULT_BODY
    case 'hair':
      return DEFAULT_HAIR
    case 'top':
      return DEFAULT_TOP
    case 'bottom':
      return DEFAULT_BOTTOM
    case 'shoes':
      return DEFAULT_SHOES
    case 'head_accessory':
      return HEAD_EMPTY
    default:
      return null
  }
}

/**
 * Low-poly composite avatar (static pose). Group origin at feet; placed at world (x, playerY, z) with playerY ~ eye height from game — caller sets position.
 */
export function buildCompositeAvatar(codes: Partial<AppearanceCodes> | null, accentColor: number): THREE.Group {
  const g = new THREE.Group()
  const hsl = { h: 0, s: 0, l: 0 }
  new THREE.Color(accentColor).getHSL(hsl)
  const accentHue = hsl.h

  const bodyCode = resolveCode('body', codes)
  const hairCode = resolveCode('hair', codes)
  const topCode = resolveCode('top', codes)
  const bottomCode = resolveCode('bottom', codes)
  const shoesCode = resolveCode('shoes', codes)
  const headCode = resolveCode('head_accessory', codes)

  const bodyMat = new THREE.MeshStandardMaterial({
    color: partColor(bodyCode, accentHue, 0.42),
    roughness: 0.85,
    metalness: 0.05,
  })
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.75, 4, 10), bodyMat)
  torso.position.y = 0.55
  torso.castShadow = true
  torso.receiveShadow = true
  g.add(torso)

  const topMat = new THREE.MeshStandardMaterial({
    color: partColor(topCode, (accentHue + 0.08) % 1, 0.48),
    roughness: 0.8,
    metalness: 0.05,
  })
  const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.45, 0.36), topMat)
  shirt.position.y = 0.78
  shirt.castShadow = true
  shirt.receiveShadow = true
  g.add(shirt)

  const legMat = new THREE.MeshStandardMaterial({
    color: partColor(bottomCode, (accentHue + 0.12) % 1, 0.38),
    roughness: 0.88,
    metalness: 0.05,
  })
  const legGeo = new THREE.CylinderGeometry(0.1, 0.11, 0.45, 8)
  const legL = new THREE.Mesh(legGeo, legMat)
  legL.position.set(-0.12, 0.2, 0)
  legL.castShadow = true
  const legR = new THREE.Mesh(legGeo.clone(), legMat)
  legR.position.set(0.12, 0.2, 0)
  legR.castShadow = true
  g.add(legL, legR)

  const shoeMat = new THREE.MeshStandardMaterial({
    color: partColor(shoesCode, (accentHue + 0.05) % 1, 0.35),
    roughness: 0.9,
    metalness: 0.1,
  })
  const shoeGeo = new THREE.BoxGeometry(0.22, 0.1, 0.38)
  const shoeL = new THREE.Mesh(shoeGeo, shoeMat)
  shoeL.position.set(-0.12, 0.05, 0.04)
  shoeL.castShadow = true
  const shoeR = new THREE.Mesh(shoeGeo.clone(), shoeMat)
  shoeR.position.set(0.12, 0.05, 0.04)
  shoeR.castShadow = true
  g.add(shoeL, shoeR)

  const hairMat = new THREE.MeshStandardMaterial({
    color: partColor(hairCode, (accentHue + 0.15) % 1, 0.5),
    roughness: 0.75,
    metalness: 0.05,
  })
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), hairMat)
  hair.position.y = 1.12
  hair.castShadow = true
  g.add(hair)

  if (headCode && headCode !== HEAD_EMPTY) {
    const accMat = new THREE.MeshStandardMaterial({
      color: partColor(headCode, (accentHue + 0.2) % 1, 0.55),
      roughness: 0.6,
      metalness: 0.2,
    })
    const acc = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 8, 16), accMat)
    acc.position.set(0, 1.18, 0.22)
    acc.rotation.x = Math.PI / 2
    acc.castShadow = true
    g.add(acc)
  }

  return g
}

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      const m = obj.material
      if (Array.isArray(m)) m.forEach((x) => x.dispose())
      else m.dispose()
    }
  })
}

/** Simple FPS-style hands parented to camera (local space). */
export function buildFirstPersonHands(accentColor: number): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.7,
    metalness: 0.1,
  })
  const geo = new THREE.BoxGeometry(0.12, 0.12, 0.38)
  const left = new THREE.Mesh(geo, mat)
  left.position.set(0.38, -0.28, -0.55)
  const right = new THREE.Mesh(geo.clone(), mat)
  right.position.set(-0.38, -0.28, -0.55)
  g.add(left, right)
  return g
}
