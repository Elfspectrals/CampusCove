import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countsForExplorer } from './explorer.ts'

test('explorer: the sports complex counts once, past the gate, and its other zones never count', () => {
  assert.equal(countsForExplorer('sports_complex'), true)
  for (const zone of ['sports_road', 'sports_entrance', 'sports_reception', 'sports_gym', 'sports_pool', 'sports_tennis']) {
    assert.equal(countsForExplorer(zone), false, zone)
  }
  for (const zone of ['pub', 'town_market', 'summit_sports', 'cove_heights']) {
    assert.equal(countsForExplorer(zone), true, zone)
  }
})
