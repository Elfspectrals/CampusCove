import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import { HUMAN_TORSO, createAnimBlender, humanBodyLayers, torsoDelta } from './animBlender.ts'

const YAW_30 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 6)
const PITCH_20 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 9)

function rig() {
  const root = new THREE.Object3D()
  const hips = new THREE.Bone()
  hips.name = 'Hips'
  const spine = new THREE.Bone()
  spine.name = 'Spine'
  root.add(hips)
  hips.add(spine)
  return { root, hips, spine }
}

function hold(name: string, duration: number, hips: THREE.Quaternion, spine: THREE.Quaternion): THREE.AnimationClip {
  return new THREE.AnimationClip(name, duration, [
    new THREE.QuaternionKeyframeTrack('Hips.quaternion', [0, duration], [...hips.toArray(), ...hips.toArray()]),
    new THREE.QuaternionKeyframeTrack('Spine.quaternion', [0, duration], [...spine.toArray(), ...spine.toArray()]),
  ])
}

function stride(name: string, duration: number): THREE.AnimationClip {
  return new THREE.AnimationClip(name, duration, [new THREE.VectorKeyframeTrack('Hips.position', [0, duration], [0, 0, 0, 1, 0, 0])])
}

function run(blender: ReturnType<typeof createAnimBlender>, mixer: THREE.AnimationMixer, seconds: number, step = 1 / 60) {
  for (let t = 0; t < seconds - 1e-9; t += step) {
    blender.update(step)
    mixer.update(step)
    blender.correctTorso()
  }
}

test('the torso delta turns the actual hips into the authored ones', () => {
  const out = torsoDelta(YAW_30, new THREE.Quaternion(), new THREE.Quaternion())
  assert.ok(YAW_30.clone().multiply(out).angleTo(new THREE.Quaternion()) < 1e-6)
})

test('an upper-body clip over another clip keeps its torso as authored, whatever the hips under it do', () => {
  const { root, hips, spine } = rig()
  const mixer = new THREE.AnimationMixer(root)
  const blender = createAnimBlender(mixer, root, humanBodyLayers(), HUMAN_TORSO)
  blender.add([hold('Walk', 1, YAW_30, new THREE.Quaternion()), hold('Eat', 1, new THREE.Quaternion(), PITCH_20)])
  blender.play('lower', 'Walk')
  blender.play('upper', 'Walk')
  run(blender, mixer, 0.1)
  blender.play('upper', 'Eat', { fadeS: 0 })
  run(blender, mixer, 0.1)
  assert.ok(hips.quaternion.angleTo(YAW_30) < 1e-3, 'the legs keep walking')
  const torso = hips.quaternion.clone().multiply(spine.quaternion)
  assert.ok(torso.angleTo(PITCH_20) < 1e-3, `torso off by ${torso.angleTo(PITCH_20)}`)
})

test('the same clip on both layers is left alone', () => {
  const { root, hips, spine } = rig()
  const mixer = new THREE.AnimationMixer(root)
  const blender = createAnimBlender(mixer, root, humanBodyLayers(), HUMAN_TORSO)
  blender.add([hold('Walk', 1, YAW_30, PITCH_20)])
  blender.play('lower', 'Walk')
  blender.play('upper', 'Walk')
  run(blender, mixer, 0.2)
  assert.ok(hips.quaternion.angleTo(YAW_30) < 1e-3)
  assert.ok(spine.quaternion.angleTo(PITCH_20) < 1e-3)
})

test('walk and run blend on the same foot phase, so the stride does not jump', () => {
  const { root, hips } = rig()
  const mixer = new THREE.AnimationMixer(root)
  const blender = createAnimBlender(mixer, root, humanBodyLayers())
  blender.add([stride('Walk', 1), stride('Run', 0.6)])
  blender.play('lower', 'Walk')
  run(blender, mixer, 0.25)
  const before = hips.position.x
  blender.play('lower', 'Run', { timeScale: 1.4 })
  run(blender, mixer, 1 / 60)
  assert.ok(Math.abs(hips.position.x - before) < 0.05, `stride jumped from ${before} to ${hips.position.x}`)
  run(blender, mixer, 0.1)
  const walkPhase = hips.position.x
  run(blender, mixer, 0.1)
  assert.ok(hips.position.x > walkPhase, 'both clips move forward together')
})

test('a clip that has faded out stops running, and comes back when played again', () => {
  const { root, hips } = rig()
  const mixer = new THREE.AnimationMixer(root)
  const blender = createAnimBlender(mixer, root, humanBodyLayers())
  blender.add([stride('Idle', 1), stride('Walk', 1)])
  blender.play('lower', 'Idle')
  run(blender, mixer, 0.1)
  blender.play('lower', 'Walk', { fadeS: 0.1 })
  run(blender, mixer, 0.3)
  const running = (mixer as unknown as { _nActiveActions: number })._nActiveActions
  assert.equal(running, 1)
  blender.play('lower', 'Idle', { fadeS: 0 })
  run(blender, mixer, 0.1)
  assert.ok(hips.position.x > 0 && hips.position.x < 0.2, `Idle restarted, got ${hips.position.x}`)
})

test('a one-shot started on a frame with no time passing still plays', () => {
  const { root, hips } = rig()
  const mixer = new THREE.AnimationMixer(root)
  const blender = createAnimBlender(mixer, root, humanBodyLayers())
  blender.add([stride('Idle', 1), stride('Kick', 1)])
  blender.play('lower', 'Idle')
  run(blender, mixer, 0.1)
  let done = false
  blender.play('lower', 'Kick', { once: true, fadeS: 0.1, onDone: () => (done = true) })
  blender.update(0)
  mixer.update(0)
  assert.equal(done, false)
  run(blender, mixer, 0.5)
  assert.equal(done, false)
  assert.ok(hips.position.x > 0.3, `the kick played, at ${hips.position.x}`)
})

test('releasing the boxing clips leaves the avatar\'s own clip of the same name', () => {
  const { root } = rig()
  const mixer = new THREE.AnimationMixer(root)
  const blender = createAnimBlender(mixer, root, humanBodyLayers())
  blender.add([stride('Idle', 1), stride('Block', 1)])
  blender.add([stride('boxing/Block', 1)])
  blender.play('upper', 'boxing/Block')
  run(blender, mixer, 0.1)
  blender.play('upper', 'Idle', { fadeS: 0.05 })
  blender.release(['boxing/Block'])
  run(blender, mixer, 0.2)
  assert.equal(blender.has('boxing/Block'), false)
  assert.equal(blender.has('Block'), true)
})
