import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isRespawnBed } from './respawnBed.ts'

test('the three beds can be chosen to wake up in, a sofa cannot', () => {
  assert.equal(isRespawnBed('decor_bed_single'), true)
  assert.equal(isRespawnBed('decor_bed_double'), true)
  assert.equal(isRespawnBed('decor_bunk_bed'), true)
  assert.equal(isRespawnBed('decor_sofa_classic'), false)
})
