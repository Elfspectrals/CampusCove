import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AdminItem } from '../../types/gameRealtime.ts'
import { groupedItems, itemGroup, itemSection, quickQuantities, sectionsWithItems } from './adminItems.ts'

const item = (code: string, kind: string, name = code): AdminItem => ({ code, name, kind, preview: null, portion: null })
const apple = item('farm_apple', 'consumable', 'Apple')
const cola = item('drink_cola', 'consumable', 'Cola')
const pills = item('med_painkillers', 'consumable', 'Painkillers')
const tee = item('COS_WEAR_TOP_DEFAULT', 'cosmetic', 'Tee')
const headset = item('COS_WEAR_HEAD_ACCESSORY_GAMER', 'cosmetic', 'Gamer headset')
const wave = item('emote_wave', 'cosmetic', 'Wave')
const crowbar = item('tool_crowbar', 'tool', 'Crowbar')
const chair = item('chair_campus_basic', 'furniture', 'Chair')
const title = item('title_freshman', 'misc', 'Freshman')
const ALL = [apple, cola, pills, tee, headset, wave, crowbar, chair, title]

test('every kind lands in a section, unknown kinds in other', () => {
  assert.deepEqual(ALL.map(itemSection), ['food', 'food', 'food', 'clothes', 'clothes', 'clothes', 'tools', 'furniture', 'other'])
  assert.equal(itemSection(item('gear_tennis_racket', 'sports_gear')), 'sports')
})

test('food is grouped by its shop folder and clothes by their slot', () => {
  assert.deepEqual([apple, cola, pills].map(itemGroup), ['farm', 'drinks', 'medical'])
  assert.deepEqual([tee, headset, wave].map(itemGroup), ['top', 'head_accessory', 'emotes'])
  assert.equal(itemGroup(crowbar), 'all')
})

test('only sections with items are offered, with their size', () => {
  assert.deepEqual(sectionsWithItems(ALL), [
    { section: 'food', count: 3 },
    { section: 'tools', count: 1 },
    { section: 'furniture', count: 1 },
    { section: 'clothes', count: 3 },
    { section: 'other', count: 1 },
  ])
})

test('a section shows its groups in a fixed order', () => {
  assert.deepEqual(
    groupedItems(ALL, 'food', '').map((g) => [g.group, g.items.map((i) => i.code)]),
    [['medical', ['med_painkillers']], ['drinks', ['drink_cola']], ['farm', ['farm_apple']]],
  )
})

test('a search looks through every section and groups by section', () => {
  assert.deepEqual(
    groupedItems(ALL, 'food', 'w').map((g) => [g.group, g.items.map((i) => i.name)]),
    [['tools', ['Crowbar']], ['clothes', ['Tee', 'Gamer headset', 'Wave']]],
  )
})

test('food gives in stacks, the rest one at a time', () => {
  assert.deepEqual(quickQuantities('food'), [1, 5, 10, 25])
  assert.deepEqual(quickQuantities('furniture'), [1, 2, 5])
})
