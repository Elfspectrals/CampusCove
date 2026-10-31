import * as THREE from 'three'

const FLASH_S = 0.08

let flashMaterial: THREE.MeshBasicMaterial | null = null

function whiteFlashMaterial(): THREE.MeshBasicMaterial {
  if (!flashMaterial) flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  return flashMaterial
}

/**
 * The real material of every mesh currently flashing, and how many flashes hold it white. Shared by all flashes so
 * overlapping hits (two attackers, or punches bunched after a lag spike / a background tab) never take the white
 * flash material for the original and leave the avatar white for good.
 */
const flashing = new WeakMap<THREE.Mesh, { original: THREE.Material | THREE.Material[]; holders: number }>()

function hold(mesh: THREE.Mesh): void {
  const entry = flashing.get(mesh)
  if (entry) {
    entry.holders += 1
    return
  }
  flashing.set(mesh, { original: mesh.material, holders: 1 })
  mesh.material = whiteFlashMaterial()
}

function release(mesh: THREE.Mesh): void {
  const entry = flashing.get(mesh)
  if (!entry) return
  entry.holders -= 1
  if (entry.holders > 0) return
  flashing.delete(mesh)
  mesh.material = entry.original
}

/** Turns the avatar white for a blink once `delay` has passed (the punch landing). */
export function createHitFlash(avatar: THREE.Object3D, delay: number) {
  const held: THREE.Mesh[] = []
  let age = -delay
  let started = false

  function end(): void {
    for (const mesh of held) release(mesh)
    held.length = 0
  }

  function update(dt: number): boolean {
    age += dt
    if (age >= FLASH_S) {
      end()
      return false
    }
    if (age < 0 || started) return true
    started = true
    avatar.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      hold(obj)
      held.push(obj)
    })
    return true
  }

  return { avatar, update, end }
}
