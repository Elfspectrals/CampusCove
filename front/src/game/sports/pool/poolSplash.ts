import * as THREE from 'three'

const SPLASH_S = 0.7
const START_RADIUS = 0.3

interface Splash {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  age: number
  reach: number
}

export function createPoolSplashes(getScene: () => THREE.Scene | undefined) {
  const active: Splash[] = []
  const geometry = new THREE.RingGeometry(0.8, 1, 24)
  geometry.rotateX(-Math.PI / 2)

  function spawn(x: number, y: number, z: number, heightM: number): void {
    const scene = getScene()
    if (!scene) return
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y + 0.02, z)
    mesh.scale.setScalar(START_RADIUS)
    scene.add(mesh)
    active.push({ mesh, age: 0, reach: 1.2 + heightM * 0.35 })
  }

  function tick(dt: number): void {
    for (let i = active.length - 1; i >= 0; i--) {
      const splash = active[i]!
      splash.age += dt
      const t = Math.min(1, splash.age / SPLASH_S)
      splash.mesh.scale.setScalar(START_RADIUS + (splash.reach - START_RADIUS) * t)
      splash.mesh.material.opacity = 0.85 * (1 - t)
      if (t < 1) continue
      splash.mesh.removeFromParent()
      splash.mesh.material.dispose()
      active.splice(i, 1)
    }
  }

  return { spawn, tick }
}
