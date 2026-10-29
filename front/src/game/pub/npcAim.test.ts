import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isAimingAtNpc } from './npcAim.ts'

const bartender: [number, number, number] = [0, 0, -2]
const eye = { x: 0, y: 1.6, z: 0 }
const ahead = { x: 0, y: 0, z: -1 }

test('aiming at an NPC needs the reach and the crosshair on them', () => {
  assert.equal(isAimingAtNpc(eye, ahead, bartender, 2.6), true)
  assert.equal(isAimingAtNpc(eye, { x: 1, y: 0, z: 0 }, bartender, 2.6), false)
  assert.equal(isAimingAtNpc({ x: 0, y: 1.6, z: 0.5 }, ahead, bartender, 2.6), true)
  assert.equal(isAimingAtNpc({ x: 0, y: 1.6, z: 0.7 }, ahead, bartender, 2.6), false)
  assert.equal(isAimingAtNpc({ x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: -1 }, bartender, 2.6), false)
})
