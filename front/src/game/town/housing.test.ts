import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findNearestHousingUnit, housingInteractPosition, isFlatmate, type HousingUnit } from './housing.ts'

function unit(publicId: string, modelKey: string, x: number, z: number): HousingUnit {
  return {
    unit_id: 1, public_id: publicId, offer_type: 'buy', price_coins: 14000, tax_coins: 0, pos_x: x, pos_y: 1.25, pos_z: z, size: 2.5,
    base_color_hex: '#F0D98C', model_key: modelKey, status: 'occupied', occupant_account_id: 1, occupant_name: null, tax_due_at: null,
    door_locked: false, room_public_id: null, template_key: 'house', key_holder_account_ids: [],
  }
}

const tidewater = unit('b01', 'cove_home_b01', -273.5, -191.8)
const backDoors = new Map([['cove_home_b01', { x: -273.5, z: -178.99 }]])

test('the back door is found from the garden, the front door from the street', () => {
  const garden = findNearestHousingUnit(-273.5, -178.0, [tidewater], backDoors)
  assert.deepEqual(garden && { id: garden.unit.public_id, side: garden.side, x: garden.x, z: garden.z }, { id: 'b01', side: 'back', x: -273.5, z: -178.99 })
  assert.equal(findNearestHousingUnit(-273.5, -192.5, [tidewater], backDoors)?.side, 'front')
  assert.equal(findNearestHousingUnit(-273.5, -185.0, [tidewater], backDoors), null)
})

test('the nearer door wins when two doors are in reach', () => {
  const close = new Map([['cove_home_b01', { x: -273.5, z: -189.0 }]])
  assert.equal(findNearestHousingUnit(-273.5, -190.0, [tidewater], close)?.side, 'back')
  assert.equal(findNearestHousingUnit(-273.5, -191.0, [tidewater], close)?.side, 'front')
})

test('a house without a back door keeps its front door only', () => {
  const town = unit('h01', 'house_01', 10, 0)
  assert.equal(findNearestHousingUnit(10, 1, [town], backDoors)?.side, 'front')
  assert.equal(findNearestHousingUnit(10, 3, [town], backDoors), null)
})

test('the prompt is anchored on the door the player stands at', () => {
  const target = findNearestHousingUnit(-273.5, -178.0, [tidewater], backDoors)
  assert.ok(target)
  assert.deepEqual(housingInteractPosition(target), { x: -273.5, y: 1.25 + 1.25 + 0.35, z: -178.99 })
})

function occupiedUnit(overrides: Partial<HousingUnit>): HousingUnit {
  return { status: 'occupied', occupant_account_id: 1, key_holder_account_ids: [2], ...overrides } as HousingUnit
}

test('a key holder of an occupied house is a flatmate', () => {
  assert.equal(isFlatmate(occupiedUnit({}), 2), true)
})

test('the owner, a stranger and a guest are not flatmates', () => {
  assert.equal(isFlatmate(occupiedUnit({}), 1), false)
  assert.equal(isFlatmate(occupiedUnit({}), 3), false)
  assert.equal(isFlatmate(occupiedUnit({}), null), false)
})

test('nobody is a flatmate of a vacant house', () => {
  assert.equal(isFlatmate(occupiedUnit({ status: 'vacant' }), 2), false)
})
