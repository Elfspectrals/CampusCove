import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DOOR_SOUND_RADIUS, doorInReach, doorPoint, hearsDoor, lockChanges } from './doors.ts'
import type { HousingUnit, Player } from './types.ts'
import type { WorldHouse } from './world.ts'

function unit(publicId: string, doorLocked: boolean): HousingUnit {
  return { public_id: publicId, template_key: 'house', model_key: 'house_01', status: 'occupied', door_locked: doorLocked, occupant_account_id: 1, pos_x: 0, pos_z: 0 }
}

function at(x: number, z: number): Player {
  return { x, y: 0, z } as Player
}

test('players within the door sound radius hear it, farther ones do not', () => {
  assert.equal(hearsDoor(at(3, 4), 0, 0), true)
  assert.equal(hearsDoor(at(DOOR_SOUND_RADIUS, 0), 0, 0), true)
  assert.equal(hearsDoor(at(DOOR_SOUND_RADIUS + 0.1, 0), 0, 0), false)
})

test('a lock that changes between snapshots makes a lock or unlock sound', () => {
  const changes = lockChanges([unit('a', false), unit('b', true), unit('c', true)], [unit('a', true), unit('b', false), unit('c', true)])
  assert.deepEqual(changes.map((c) => [c.unit.public_id, c.sound]), [['a', 'lock'], ['b', 'unlock']])
})

test('a house that was not in the previous snapshot makes no sound', () => {
  assert.deepEqual(lockChanges([], [unit('a', true)]), [])
})

const tidewater: WorldHouse = { position: { x: 0, y: 0, z: 0 }, rotationY: Math.PI, interiorOffset: { x: 0, y: 0.2, z: -1.405 }, backDoor: { x: 0, y: 1.25, z: 12 } }

test('the back door is in reach from the garden and the front door from the street', () => {
  assert.equal(doorInReach(at(0, 13), unit('a', false), tidewater), 'back')
  assert.equal(doorInReach(at(0, -1), unit('a', false), tidewater), 'front')
})

test('the nearer door wins when both are in reach', () => {
  const close: WorldHouse = { ...tidewater, backDoor: { x: 0, y: 1.25, z: 4 } }
  assert.equal(doorInReach(at(0, 1.5), unit('a', false), close), 'front')
  assert.equal(doorInReach(at(0, 2.5), unit('a', false), close), 'back')
})

test('no door is in reach 3.1 m from both points', () => {
  assert.equal(doorInReach(at(3.1, 0), unit('a', false), tidewater), null)
  assert.equal(doorInReach(at(3.1, 12), unit('a', false), tidewater), null)
})

test('a house without a back door only has its front door', () => {
  assert.equal(doorInReach(at(0, 2.9), unit('a', false), null), 'front')
  assert.equal(doorInReach(at(0, 3.1), unit('a', false), null), null)
  assert.throws(() => doorPoint(unit('a', false), null, 'back'), /no back door/)
})
