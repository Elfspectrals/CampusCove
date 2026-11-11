import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import { fitWatchToForearm } from './watchFit.ts'

const wrist = new THREE.Vector3(0, 0, -0.3)

function forearm(halfSide: number, halfUp: number, centre: THREE.Vector3): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  for (let z = 0; z >= -0.3; z -= 0.01) {
    for (let k = 0; k < 16; k++) {
      const angle = (k / 16) * Math.PI * 2
      points.push(new THREE.Vector3(centre.x + Math.cos(angle) * halfSide, centre.y + Math.sin(angle) * halfUp, z))
    }
  }
  return points
}

function near(actual: number, expected: number, label: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} != ${expected}`)
}

test('centres the watch on the forearm, 4.5 cm before the wrist', () => {
  const fit = fitWatchToForearm(forearm(0.03, 0.035, new THREE.Vector3(0.01, -0.005, 0)), wrist, 0.035)
  near(fit.position.x, 0.01, 'side')
  near(fit.position.y, -0.005, 'up')
  near(fit.position.z, -0.255, 'along')
})

test('scales the strap to the thicker half of the forearm plus slack', () => {
  near(fitWatchToForearm(forearm(0.03, 0.035, new THREE.Vector3()), wrist, 0.035).scale, 0.039 / 0.035, 'bare arm')
  near(fitWatchToForearm(forearm(0.047, 0.04, new THREE.Vector3()), wrist, 0.035).scale, 0.051 / 0.035, 'thickest strapped forearm')
})

test('squeezes a thick sleeve instead of growing past the thickest strapped forearm', () => {
  near(fitWatchToForearm(forearm(0.055, 0.05, new THREE.Vector3()), wrist, 0.035).scale, 0.051 / 0.035, 'hoodie sleeve')
})

test('turns the face to the back of the wrist and the model -Z to the hand', () => {
  const fit = fitWatchToForearm(forearm(0.03, 0.03, new THREE.Vector3()), new THREE.Vector3(-0.1, 0.01, -0.25), 0.035)
  const face = new THREE.Vector3(0, 1, 0).applyQuaternion(fit.quaternion)
  const towardsHand = new THREE.Vector3(0, 0, -1).applyQuaternion(fit.quaternion)
  const along = new THREE.Vector3(-0.1, 0.01, -0.25).normalize()
  near(towardsHand.dot(along), 1, 'towards the hand')
  near(face.dot(along), 0, 'face across the forearm')
  assert.ok(face.y > 0.99, `face points up: ${face.y}`)
})

test('refuses a forearm with nothing where the watch goes', () => {
  assert.throws(() => fitWatchToForearm([new THREE.Vector3(0, 0, -0.01)], wrist, 0.035), /no forearm vertex/)
})

test('refuses a missing strap opening', () => {
  assert.throws(() => fitWatchToForearm(forearm(0.03, 0.03, new THREE.Vector3()), wrist, Number.NaN), /invalid strap opening/)
})
