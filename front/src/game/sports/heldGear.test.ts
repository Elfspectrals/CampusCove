import { test } from 'node:test'
import assert from 'node:assert/strict'
import { heldGearUrl } from './heldGear.ts'

test('the racket and the boules have a hand model', () => {
  assert.equal(heldGearUrl('gear_tennis_racket'), '/assets/decor/tennis_racket/model.glb')
  assert.equal(heldGearUrl('gear_boules'), '/assets/decor/petanque_boules/model.glb')
})

test('worn gear and other items draw nothing in the hand', () => {
  assert.equal(heldGearUrl('gear_swimsuit'), null)
  assert.equal(heldGearUrl('gear_ice_skates'), null)
  assert.equal(heldGearUrl('tool_hammer'), null)
  assert.equal(heldGearUrl(null), null)
})
