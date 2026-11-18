import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import { attachAvatarAnimations, setAvatarDancing, setAvatarEating, setCharacterClips, updateAvatarAnimation } from './glbCharacter.ts'

function spinePose(name: string, angle: number, duration = 5): THREE.AnimationClip {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle).toArray()
  return new THREE.AnimationClip(name, duration, [new THREE.QuaternionKeyframeTrack('Spine.quaternion', [0, duration], [...q, ...q])])
}

function avatar() {
  const root = new THREE.Object3D()
  const hips = new THREE.Bone()
  hips.name = 'Hips'
  const spine = new THREE.Bone()
  spine.name = 'Spine'
  root.add(hips)
  hips.add(spine)
  setCharacterClips(root, [spinePose('Idle', 0.1), spinePose('Dance', 0.6), spinePose('Drink', 1.1), spinePose('Walk', 0.1), spinePose('Run', 0.1)])
  attachAvatarAnimations(root)
  return { root, spine }
}

function frames(root: THREE.Object3D, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) updateAvatarAnimation(root, 1 / 60, 0)
}

const angleOf = (spine: THREE.Object3D) => 2 * Math.acos(Math.min(1, Math.abs(spine.quaternion.w)))

test('a drink cut by a dance does not keep the upper body on the dance once the dance ends', () => {
  const { root, spine } = avatar()
  frames(root, 0.2)
  setAvatarDancing(root, { clip: 'Dance', timeScale: 1 })
  frames(root, 0.5)
  setAvatarEating(root, 'drink')
  frames(root, 0.5)
  setAvatarDancing(root, null)
  frames(root, 1)
  assert.ok(Math.abs(angleOf(spine) - 0.1) < 0.01, `upper body at ${angleOf(spine)} rad, expected the Idle 0.1`)
})

test('a drink while standing plays and then returns to Idle', () => {
  const { root, spine } = avatar()
  frames(root, 0.2)
  setAvatarEating(root, 'drink')
  frames(root, 0.5)
  assert.ok(Math.abs(angleOf(spine) - 1.1) < 0.01, `drinking at ${angleOf(spine)}`)
  frames(root, 5)
  assert.ok(Math.abs(angleOf(spine) - 0.1) < 0.01, `back at ${angleOf(spine)}`)
})
