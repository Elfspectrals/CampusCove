import assert from 'node:assert/strict'
import { test } from 'node:test'
import { metresTo, screenMarker, tutorialTarget, type TutorialPlaces } from './tutorialMarker.ts'

const places: TutorialPlaces = {
  trees: [[-40, 0, -100], [-30, 0, -90]],
  farmer: [-29, 0, -94.5],
  atms: [[0, 0, 20], [-24.5, 0, -93]],
  dartsOche: [84, 0, -139.6],
}

test('each step points at its place, the nearest tree or ATM, and eating points nowhere', () => {
  const atOrchard = { x: -28, z: -88 }
  assert.deepEqual(tutorialTarget('pick_apples', atOrchard, places), [-30, 0, -90])
  assert.equal(tutorialTarget('eat_apple', atOrchard, places), null)
  assert.deepEqual(tutorialTarget('sell_apples', atOrchard, places), [-29, 0, -94.5])
  assert.deepEqual(tutorialTarget('deposit_cash', atOrchard, places), [-24.5, 0, -93])
  assert.deepEqual(tutorialTarget('deposit_cash', { x: 0, z: 10 }, places), [0, 0, 20])
  assert.deepEqual(tutorialTarget('play_darts', atOrchard, places), [84, 0, -139.6])
})

test('a place missing from the world gives no target', () => {
  const empty: TutorialPlaces = { trees: [], farmer: null, atms: [], dartsOche: null }
  assert.equal(tutorialTarget('pick_apples', { x: 0, z: 0 }, empty), null)
  assert.equal(tutorialTarget('sell_apples', { x: 0, z: 0 }, empty), null)
  assert.equal(tutorialTarget('deposit_cash', { x: 0, z: 0 }, empty), null)
  assert.equal(tutorialTarget('play_darts', { x: 0, z: 0 }, empty), null)
})

test('the distance is in whole metres on the ground, height ignored', () => {
  assert.equal(metresTo({ x: 0, z: 0 }, [3, 50, 4]), 5)
  assert.equal(metresTo({ x: 0, z: 0 }, [41.6, 0, 0]), 42)
  assert.equal(metresTo({ x: 0, z: 0 }, [0.4, 0, 0]), 0)
})

const viewport = { width: 800, height: 600 }

test('a target in view sits where it projects', () => {
  assert.deepEqual(screenMarker({ x: 0, y: 0, z: 0.5 }, viewport, 40), { x: 400, y: 300, onScreen: true, angle: 0 })
  assert.deepEqual(screenMarker({ x: 1, y: -1, z: 0.5 }, viewport, 40), { x: 800, y: 600, onScreen: true, angle: 0 })
})

test('a target off to the right sticks to the right edge, arrow pointing right', () => {
  const marker = screenMarker({ x: 3, y: 0, z: 0.5 }, viewport, 40)
  assert.deepEqual({ x: marker.x, y: marker.y, onScreen: marker.onScreen }, { x: 760, y: 300, onScreen: false })
  assert.equal(Math.abs(marker.angle), 0)
})

test('a target behind the camera sticks to the edge on the side it really is', () => {
  const marker = screenMarker({ x: 0.5, y: 0.2, z: 1.2 }, viewport, 40)
  assert.equal(marker.onScreen, false)
  assert.equal(marker.x, 40)
  assert.ok(marker.y > 300)
  assert.ok(Math.abs(marker.angle) > Math.PI / 2)
})
