import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseCrops } from '../crops/crops.ts'
import { bakedProps, parseZoneDecor as parseWithCrops, parseZoneDecorIndex, runtimeProps, zoneDecorJson, zoneStoreLayout } from './zoneDecor.ts'

const crops = parseCrops(JSON.parse(readFileSync(new URL('../../../public/assets/crops/crops.json', import.meta.url), 'utf8')))
const parseZoneDecor = (raw: unknown, zone: Parameters<typeof parseWithCrops>[1]) => parseWithCrops(raw, zone, crops)

const orchard = { key: 'orchard', bounds: { minX: -42.6, maxX: -2, minZ: -130, maxZ: -72 } }

const cashier = { id: 'n1', kind: 'npc', position: [-20, 0, -90], yaw: 0, scale: [1, 1, 1], pose: 'idle', vendor: true, body: '#8b7aa8', outfit: [{ slot: 'top', key: 'tee', color: '#2f6b4f' }] }
const crate = { id: 'd1', kind: 'decor', key: 'sofa_classic', position: [-10, 0.2, -80], yaw: 1.2, scale: [1, 1, 1] }
const lamp = { id: 'i1', kind: 'item', key: 'floor_lamp', code: 'decor_floor_lamp', forSale: true, position: [-21, 0, -88], yaw: 0, scale: [1, 1, 1] }

const decor = (props: unknown[], extra: Record<string, unknown> = {}) => ({ version: 1, zone: 'orchard', name: 'Orchard stall', props, ...extra })

test('a zone file keeps decor, items and NPCs in world coordinates', () => {
  const parsed = parseZoneDecor(decor([crate, lamp, cashier]), orchard)
  assert.equal(parsed.props.length, 3)
  assert.deepEqual(parsed.props[0]!.position, [-10, 0.2, -80])
})

test('decor is baked, items and NPCs load at runtime', () => {
  const parsed = parseZoneDecor(decor([crate, lamp, cashier]), orchard)
  assert.deepEqual(bakedProps(parsed).map((p) => p.id), ['d1'])
  assert.deepEqual(runtimeProps(parsed).map((p) => p.id), ['i1', 'n1'])
})

test('props sit inside the zone bounds, edges included', () => {
  assert.doesNotThrow(() => parseZoneDecor(decor([{ ...crate, position: [-42.6, 0, -130] }, { ...crate, id: 'd2', position: [-2, 0, -72] }]), orchard))
  assert.throws(() => parseZoneDecor(decor([{ ...crate, position: [-1.99, 0, -80] }]), orchard), /outside zone orchard/)
  assert.throws(() => parseZoneDecor(decor([{ ...crate, position: [-10, 0, -130.01] }]), orchard), /outside zone orchard/)
})

test('the file belongs to the zone it is opened for', () => {
  assert.throws(() => parseZoneDecor(decor([], { zone: 'pond' }), orchard), /zone.zone: expected orchard/)
})

test('zones take no lights and no material looks', () => {
  assert.throws(() => parseZoneDecor(decor([{ id: 'l1', kind: 'light', light: 'point', color: '#ffffff', intensity: 1, range: 5, position: [-10, 2, -80], yaw: 0, scale: [1, 1, 1] }]), orchard), /take no light/)
  assert.throws(() => parseZoneDecor(decor([{ ...crate, materials: { Wood: { color: '#ff0000' } } }]), orchard), /keeps its own materials/)
})

test('one cashier at most, standing at scale 1, with its counter inside the zone', () => {
  assert.throws(() => parseZoneDecor(decor([cashier, { ...cashier, id: 'n2' }]), orchard), /only one NPC can be the cashier/)
  assert.throws(() => parseZoneDecor(decor([{ ...cashier, pose: 'sit' }]), orchard), /stands/)
  assert.throws(() => parseZoneDecor(decor([{ ...cashier, scale: [1, 1.2, 1] }]), orchard), /stands/)
  assert.throws(() => parseZoneDecor(decor([{ ...cashier, position: [-3, 0, -90], yaw: Math.PI / 2 }]), orchard), /counter in front of the cashier/)
  assert.doesNotThrow(() => parseZoneDecor(decor([{ ...cashier, position: [-3, 0, -90], yaw: -Math.PI / 2 }]), orchard))
  assert.throws(() => parseZoneDecor(decor([{ ...cashier, position: [-20, 0, -73] }]), orchard), /counter in front of the cashier/)
})

test('the file shape is strict', () => {
  assert.throws(() => parseZoneDecor({ ...decor([]), version: 2 }, orchard), /zone.version/)
  assert.throws(() => parseZoneDecor(decor([], { bounds: {} }), orchard), /zone.bounds: unknown field/)
  assert.throws(() => parseZoneDecor(decor([{ ...crate, kind: 'tree' }]), orchard), /kind/)
  assert.throws(() => parseZoneDecorIndex({ version: 2, zones: [] }), /index.version/)
})

test('ids are unique and the name is required', () => {
  assert.throws(() => parseZoneDecor(decor([crate, crate]), orchard), /used twice/)
  assert.throws(() => parseZoneDecor(decor([], { name: ' ' }), orchard), /zone.name/)
})

test('the zone store covers the whole zone and checks out at the cashier', () => {
  const parsed = parseZoneDecor(decor([crate, lamp, cashier]), orchard)
  const layout = zoneStoreLayout(parsed, orchard.bounds, new Map([['i1', [0.4, 1.6, 0.4]]]))
  assert.deepEqual(layout.bounds, orchard.bounds)
  assert.equal(layout.name, 'Orchard stall')
  assert.deepEqual(layout.displays.map((d) => d.code), ['decor_floor_lamp'])
  assert.deepEqual(layout.clerk, { position: [-20, 0, -90], yaw: 0 })
  assert.deepEqual(layout.counter, [-20, 1.15, -88])
})

test('the index lists each decorated zone once', () => {
  assert.deepEqual(parseZoneDecorIndex({ version: 1, zones: ['orchard', 'farm'] }).zones, ['orchard', 'farm'])
  assert.throws(() => parseZoneDecorIndex({ version: 1, zones: ['orchard', 'orchard'] }), /listed twice/)
  assert.throws(() => parseZoneDecorIndex({ version: 1, zones: ['Orchard'] }), /zone keys/)
})

const field = { id: 'f1', kind: 'field', crop: 'corn', position: [-20, 0, -100], yaw: 0, scale: [1, 1, 1], size: [8, 12], pattern: 'rows' }
const withPlants = (props: unknown[]) => zoneDecorJson(decor(props) as Parameters<typeof zoneDecorJson>[0], crops)

test('a field is saved with its plants and baked with the decor', () => {
  const raw = withPlants([field]) as { props: Array<{ plants: unknown[] }> }
  assert.equal(raw.props[0]!.plants.length, 78)
  const parsed = parseZoneDecor(raw, orchard)
  assert.deepEqual(bakedProps(parsed).map((p) => p.id), ['f1'])
  assert.deepEqual(runtimeProps(parsed), [])
})

test('plants that do not match the field are refused', () => {
  const raw = withPlants([field]) as { props: Array<{ plants: number[][] }> }
  raw.props[0]!.plants[0]![0]! += 0.5
  assert.throws(() => parseZoneDecor(raw, orchard), /plants: do not match/)
  assert.throws(() => parseZoneDecor(decor([field]), orchard), /plants: do not match/)
})

test('a field stays inside the zone, keeps scale 1 and grows a known crop', () => {
  assert.throws(() => parseZoneDecor(withPlants([{ ...field, position: [-5, 0, -100] }]), orchard), /reaches outside zone orchard/)
  assert.throws(() => parseZoneDecor(withPlants([{ ...field, scale: [2, 1, 1] }]), orchard), /keeps scale 1/)
  assert.throws(() => parseZoneDecor(withPlants([{ ...field, crop: 'rice' }]), orchard), /crop: expected one of corn, potato, cabbage, pumpkin/)
  assert.throws(() => parseZoneDecor(withPlants([{ ...field, size: [0.5, 12] }]), orchard), /size\[0\]: expected 1 to 60 m/)
})

test('the game reads fields without the crop table, the plants come from the bake', () => {
  assert.equal(parseWithCrops(decor([field]), orchard, null).props[0]!.kind, 'field')
  assert.throws(() => zoneDecorJson(decor([{ ...field, crop: 'rice' }]) as Parameters<typeof zoneDecorJson>[0], crops), /crop: expected one of/)
})
