import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DOOR_SOUND_RADIUS, hearsDoor, lockChanges } from './doors.ts'
import type { HousingUnit, Player } from './types.ts'

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
