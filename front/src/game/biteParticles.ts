import * as THREE from 'three'

const COUNT = 14
const LIFETIME_S = 0.7
const GRAVITY = -1.6
/** Burst origin in the first-person container (camera space): just under the eyes, in front of the mouth. */
const ORIGIN = new THREE.Vector3(0, -0.13, -0.32)

/** A short burst of crumbs (food) or droplets (drink) in front of the camera on each bite / sip. */
export function createBiteParticles(container: THREE.Object3D) {
  const positions = new Float32Array(COUNT * 3)
  const velocities = Array.from({ length: COUNT }, () => new THREE.Vector3())
  const attribute = new THREE.BufferAttribute(positions, 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', attribute)
  const material = new THREE.PointsMaterial({ size: 0.012, transparent: true, depthTest: false, sizeAttenuation: true })
  const points = new THREE.Points(geometry, material)
  points.renderOrder = 10
  points.frustumCulled = false
  points.visible = false
  container.add(points)
  let age = LIFETIME_S

  function burst(kind: 'eat' | 'drink'): void {
    material.color.set(kind === 'drink' ? '#85b7eb' : '#c9822f')
    velocities.forEach((v, i) => {
      attribute.setXYZ(i, ORIGIN.x, ORIGIN.y, ORIGIN.z)
      v.set((Math.random() - 0.5) * 0.5, Math.random() * 0.35 + 0.05, (Math.random() - 0.3) * 0.3)
    })
    attribute.needsUpdate = true
    age = 0
    points.visible = true
  }

  function update(dt: number): void {
    if (age >= LIFETIME_S) return
    age += dt
    velocities.forEach((v, i) => {
      v.y += GRAVITY * dt
      attribute.setXYZ(i, attribute.getX(i) + v.x * dt, attribute.getY(i) + v.y * dt, attribute.getZ(i) + v.z * dt)
    })
    attribute.needsUpdate = true
    material.opacity = Math.max(0, 1 - age / LIFETIME_S)
    if (age >= LIFETIME_S) points.visible = false
  }

  function dispose(): void {
    points.removeFromParent()
    geometry.dispose()
    material.dispose()
  }

  return { burst, update, dispose }
}
