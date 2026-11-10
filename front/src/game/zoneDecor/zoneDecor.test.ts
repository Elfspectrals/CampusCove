import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseCrops } from '../crops/crops.ts'
import { parseAnimals } from '../animals/animals.ts'
import { buildingPreviewKey, parseBuildings } from '../buildings/buildings.ts'
import { areaStoreLayout, withStaff, zoneRefOf, bakedProps, parseZoneDecor as parseWithCrops, parseZoneDecorIndex, runtimeProps, zoneDecorJson, zonePriceFile, zonePrices } from './zoneDecor.ts'
import type { WorldManifest } from '../world/worldManifest.ts'

const crops = parseCrops(JSON.parse(readFileSync(new URL('../../../public/assets/crops/crops.json', import.meta.url), 'utf8')))
const animals = parseAnimals(JSON.parse(readFileSync(new URL('../../../public/assets/animals/animals.json', import.meta.url), 'utf8')))
const buildings = parseBuildings(JSON.parse(readFileSync(new URL('../../../public/assets/buildings/buildings.json', import.meta.url), 'utf8')))
const parseZoneDecor = (raw: unknown, zone: Parameters<typeof parseWithCrops>[1]) => parseWithCrops(raw, zone, crops, animals, buildings)

const orchard = { key: 'orchard', bounds: { minX: -42.6, maxX: -2, minZ: -130, maxZ: -72 } }

const cashier = { id: 'n1', kind: 'npc', position: [-20, 0, -90], yaw: 0, scale: [1, 1, 1], pose: 'idle', vendor: false, body: '#8b7aa8', outfit: [{ slot: 'top', key: 'tee', color: '#2f6b4f' }] }
const crate = { id: 'd1', kind: 'decor', key: 'sofa_classic', position: [-10, 0.2, -80], yaw: 1.2, scale: [1, 1, 1] }
const lamp = { id: 'i1', kind: 'item', key: 'floor_lamp', code: 'decor_floor_lamp', forSale: true, price: 40, position: [-21, 0, -88], yaw: 0, scale: [1, 1, 1] }

const stall = { id: 'a1', name: 'Lamp stall', role: 'seller', npc: 'n1', bounds: { minX: -24, maxX: -16, minZ: -92, maxZ: -84 }, offers: [] }
const buyer = { id: 'a2', name: 'Corn buyer', role: 'buyer', npc: 'n2', bounds: { minX: -40, maxX: -30, minZ: -100, maxZ: -95 }, offers: [{ code: 'farm_corn', price: 4, quota: 200, overPrice: 1 }] }
const farmer = { ...cashier, id: 'n2', position: [-35, 0, -97] }
const sellsLamp = (props: unknown[]) => (props.includes(lamp) ? [stall] : [])
const decor = (props: unknown[], extra: Record<string, unknown> = {}) => ({ version: 1, zone: 'orchard', name: 'Orchard stall', props, areas: sellsLamp(props), ...extra })

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

test('a seller area sells the items for sale inside it, through its standing NPC', () => {
  const withStall = (npc: unknown, area: unknown = stall) => decor([lamp, npc], { areas: [area] })
  assert.doesNotThrow(() => parseZoneDecor(withStall(cashier), orchard))
  assert.throws(() => parseZoneDecor(withStall({ ...cashier, pose: 'sit' }), orchard), /seller stands/)
  assert.throws(() => parseZoneDecor(withStall({ ...cashier, scale: [1, 1.2, 1] }), orchard), /seller stands/)
  assert.throws(() => parseZoneDecor(withStall({ ...cashier, position: [-20, 0, -85] }), orchard), /counter in front of the seller is outside the area/)
  assert.throws(() => parseZoneDecor(withStall({ ...cashier, position: [-10, 0, -90] }), orchard), /stands outside the area/)
  assert.throws(() => parseZoneDecor(withStall(cashier, { ...stall, npc: 'ghost' }), orchard), /no NPC "ghost"/)
  assert.throws(() => parseZoneDecor(withStall(cashier, { ...stall, offers: buyer.offers }), orchard), /has no offers/)
  assert.throws(() => parseZoneDecor(decor([lamp, cashier], { areas: [] }), orchard), /outside every seller area/)
  assert.throws(() => parseZoneDecor(withStall({ ...cashier, vendor: true }), orchard), /not the Cashier box/)
})

test('a buyer area lists what its NPC buys, once each, with a lower price after the daily quota', () => {
  const withBuyer = (area: unknown) => decor([farmer], { areas: [area] })
  assert.deepEqual(parseZoneDecor(withBuyer(buyer), orchard).areas[0]!.offers, buyer.offers)
  assert.throws(() => parseZoneDecor(withBuyer({ ...buyer, offers: [] }), orchard), /buys at least one item/)
  assert.throws(() => parseZoneDecor(withBuyer({ ...buyer, offers: [buyer.offers[0], buyer.offers[0]] }), orchard), /farm_corn is listed twice/)
  assert.throws(() => parseZoneDecor(withBuyer({ ...buyer, offers: [{ ...buyer.offers[0], overPrice: 5 }] }), orchard), /overPrice: expected a whole number from 0 to 4/)
  assert.throws(() => parseZoneDecor(withBuyer({ ...buyer, offers: [{ ...buyer.offers[0], price: 0 }] }), orchard), /price: expected a whole number from 1/)
  assert.throws(() => parseZoneDecor(withBuyer({ ...buyer, role: 'thief' }), orchard), /role: expected one of seller, buyer/)
  assert.throws(() => parseZoneDecor(withBuyer({ ...buyer, offers: [{ ...buyer.offers[0], code: 'decor_sofa_classic' }] }), orchard), /a buyer buys consumables/)
  assert.deepEqual(zonePriceFile(parseZoneDecor(withBuyer(buyer), orchard)).buyers, { a2: { farm_corn: { price: 4, quota: 200, overPrice: 1 } } })
})

test('areas stay inside the zone, seller areas never overlap, an NPC works in one area', () => {
  assert.throws(() => parseZoneDecor(decor([farmer], { areas: [{ ...buyer, bounds: { ...buyer.bounds, minX: -50 } }] }), orchard), /reaches outside zone orchard/)
  assert.throws(() => parseZoneDecor(decor([farmer], { areas: [{ ...buyer, bounds: { ...buyer.bounds, maxX: -39.5 } }] }), orchard), /at least 1 m/)
  assert.throws(() => parseZoneDecor(decor([lamp, cashier, farmer], { areas: [stall, { ...stall, id: 'a3', npc: 'n2', bounds: { minX: -38, maxX: -20, minZ: -99, maxZ: -88 } }] }), orchard), /overlaps the seller area "Lamp stall"/)
  assert.throws(() => parseZoneDecor(decor([lamp, cashier], { areas: [stall, { ...buyer, npc: 'n1', bounds: stall.bounds }] }), orchard), /already works in another area/)
  assert.throws(() => parseZoneDecor(decor([lamp, cashier], { areas: [stall, stall] }), orchard), /"a1" is used twice/)
})

test('the file shape is strict', () => {
  assert.throws(() => parseZoneDecor({ ...decor([]), version: 2 }, orchard), /zone.version/)
  assert.throws(() => parseZoneDecor(decor([], { bounds: {} }), orchard), /zone.bounds: a main zone takes its bounds from world.manifest.json/)
  assert.throws(() => parseZoneDecor(decor([], { colour: 'red' }), orchard), /zone.colour: unknown field/)
  assert.throws(() => parseZoneDecor(decor([{ ...crate, kind: 'tree' }]), orchard), /kind/)
  assert.throws(() => parseZoneDecorIndex({ version: 2, zones: [] }), /index.version/)
})

test('ids are unique and the name is required', () => {
  assert.throws(() => parseZoneDecor(decor([crate, crate]), orchard), /used twice/)
  assert.throws(() => parseZoneDecor(decor([], { name: ' ' }), orchard), /zone.name/)
})

test('each seller area is a store of its own, checked out at its seller', () => {
  const parsed = parseZoneDecor(decor([crate, lamp, cashier]), orchard)
  const layout = areaStoreLayout(parsed, parsed.areas[0]!, new Map([['i1', [0.4, 1.6, 0.4]]]))
  assert.deepEqual(layout.bounds, stall.bounds)
  assert.equal(layout.name, 'Lamp stall')
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
  assert.equal(parseWithCrops(decor([field]), orchard, null, null, null).props[0]!.kind, 'field')
  assert.throws(() => zoneDecorJson(decor([{ ...field, crop: 'rice' }]) as Parameters<typeof zoneDecorJson>[0], crops), /crop: expected one of/)
})

const cow = { id: 'a1', kind: 'animal', animal: 'cow', position: [-20, 0, -100], yaw: 0.3, scale: [1, 1, 1], size: [10, 8] }

test('an animal wanders in its pen and loads at runtime', () => {
  const parsed = parseZoneDecor(decor([cow]), orchard)
  assert.deepEqual(runtimeProps(parsed).map((p) => p.id), ['a1'])
  assert.deepEqual(bakedProps(parsed), [])
})

test('an animal pen stays inside the zone, keeps scale 1 and holds a known animal', () => {
  assert.throws(() => parseZoneDecor(decor([{ ...cow, position: [-5, 0, -100] }]), orchard), /pen reaches outside zone orchard/)
  assert.throws(() => parseZoneDecor(decor([{ ...cow, scale: [2, 1, 1] }]), orchard), /keeps scale 1/)
  assert.throws(() => parseZoneDecor(decor([{ ...cow, animal: 'llama' }]), orchard), /animal: expected one of cow/)
  assert.throws(() => parseZoneDecor(decor([{ ...cow, size: [31, 8] }]), orchard), /size\[0\]: expected 1 to 30 m/)
  assert.throws(() => parseZoneDecor(decor([{ ...cow, speed: 3 }]), orchard), /speed: unknown field/)
  assert.equal(parseWithCrops(decor([{ ...cow, animal: 'llama' }]), orchard, null, null, null).props[0]!.kind, 'animal')
})

test('an item for sale in a zone has its own price in whole coins', () => {
  const sold = (...items: unknown[]) => decor([cashier, ...items], { areas: [stall] })
  assert.deepEqual(zonePrices(parseZoneDecor(sold(lamp, { ...lamp, id: 'i2' }), orchard)), { decor_floor_lamp: 40 })
  assert.throws(() => parseZoneDecor(sold({ ...lamp, price: undefined }), orchard), /price: expected whole coins from 1 to 100000/)
  assert.throws(() => parseZoneDecor(sold({ ...lamp, price: 0 }), orchard), /price: expected whole coins/)
  assert.throws(() => parseZoneDecor(sold({ ...lamp, price: 2.5 }), orchard), /price: expected whole coins/)
  assert.throws(() => parseZoneDecor(sold({ ...lamp, forSale: false, price: 40 }), orchard), /only items for sale have a price/)
  assert.throws(() => parseZoneDecor(sold(lamp, { ...lamp, id: 'i2', price: 41 }), orchard), /already sold at 40 coins/)
})

test('the backend copy of each zone price list matches its zone file', () => {
  const assets = new URL('../../../public/assets/', import.meta.url)
  const read = (url: URL): unknown => JSON.parse(readFileSync(url, 'utf8'))
  const manifest = read(new URL('world.manifest.json', assets)) as WorldManifest
  for (const key of parseZoneDecorIndex(read(new URL('zones/index.json', assets))).zones) {
    const raw = read(new URL(`zones/${key}.json`, assets))
    const expected = zonePriceFile(parseWithCrops(raw, zoneRefOf(key, raw, manifest.zones), null, null, null))
    assert.deepEqual(read(new URL(`../../../backend/resources/zones/${key}.json`, assets)), expected, `${key}: run npm run zone:prices`)
  }
})

const barnProp = { id: 'b1', kind: 'building', building: 'barn', position: [-20, 0, -100], yaw: 0, scale: [1, 1, 1], ...structuredClone(buildings.barn!.defaults) }
const withBarn = (patch: Record<string, unknown>) => decor([{ ...barnProp, ...patch }])
const openings = barnProp.openings as Array<Record<string, unknown>>

test('a building is baked with the decor and keeps the defaults of its template valid', () => {
  for (const def of Object.values(buildings)) {
    const parsed = parseZoneDecor(decor([{ ...barnProp, building: def.key, ...structuredClone(def.defaults) }]), orchard)
    assert.deepEqual(bakedProps(parsed).map((p) => p.id), ['b1'])
    assert.deepEqual(runtimeProps(parsed), [])
  }
})

test('a building turns by quarter turns, keeps scale 1 and stays inside the zone', () => {
  assert.doesNotThrow(() => parseZoneDecor(withBarn({ yaw: -Math.PI / 2 }), orchard))
  assert.throws(() => parseZoneDecor(withBarn({ yaw: 0.3 }), orchard), /quarter turns/)
  assert.throws(() => parseZoneDecor(withBarn({ scale: [2, 1, 1] }), orchard), /keeps scale 1/)
  assert.throws(() => parseZoneDecor(withBarn({ position: [-5, 0, -100] }), orchard), /building reaches outside zone orchard/)
  assert.throws(() => parseZoneDecor(withBarn({ size: [7, 14] }), orchard), /a barn is 8 × 10 m/)
  assert.throws(() => parseZoneDecor(withBarn({ height: 3.5 }), orchard), /height: expected 4 to 8 m/)
  assert.throws(() => parseZoneDecor(withBarn({ ridge: 'y' }), orchard), /ridge: expected x or z/)
  assert.throws(() => parseZoneDecor(withBarn({ colors: { ...barnProp.colors, roof: 'grey' } }), orchard), /#rrggbb colour/)
})

test('doors and windows fit their wall, apart from each other and from the corners', () => {
  const door = openings[0]!
  const window = openings[1]!
  assert.throws(() => parseZoneDecor(withBarn({ openings: [window] }), orchard), /at least one door/)
  assert.throws(() => parseZoneDecor(withBarn({ openings: [{ ...door, offset: 5.5 }] }), orchard), /reaches past the corner of the right wall/)
  assert.throws(() => parseZoneDecor(withBarn({ openings: [{ ...door, bottom: 0.5 }] }), orchard), /door starts on the floor/)
  assert.throws(() => parseZoneDecor(withBarn({ openings: [{ ...door, top: 4.4 }] }), orchard), /under the top of the wall/)
  assert.throws(() => parseZoneDecor(withBarn({ openings: [door, { ...window, bottom: 0.1 }] }), orchard), /window sits 0.3 m above the floor/)
  assert.throws(() => parseZoneDecor(withBarn({ openings: [door, { ...door, offset: 3 }] }), orchard), /openings\[0\].offset: too close to openings\[1\] on the right wall/)
  assert.throws(() => parseZoneDecor(withBarn({ openings: [{ ...door, side: 'roof' }] }), orchard), /side: expected one of front, back, left, right/)
})

test('a barn door keeps room beside it for its sliding leaves', () => {
  const door = openings[0]!
  assert.doesNotThrow(() => parseZoneDecor(withBarn({ openings: [{ ...door, offset: 2.5 }] }), orchard))
  assert.throws(() => parseZoneDecor(withBarn({ openings: [{ ...door, offset: 3 }] }), orchard), /reaches past the corner of the right wall with its sliding leaves/)
  assert.throws(() => parseZoneDecor(withBarn({ openings: [{ ...door, width: 2, offset: -1.2 }, { ...door, width: 2, offset: 1.2 }] }), orchard), /too close to openings\[1\]/)
})

test('a building stands on the ground and its roof keeps clear of the next building', () => {
  assert.throws(() => parseZoneDecor(withBarn({ position: [-20, 0.5, -100] }), orchard), /stands on the ground/)
  assert.doesNotThrow(() => parseZoneDecor(decor([barnProp, { ...barnProp, id: 'b2', position: [-33, 0, -100] }]), orchard))
  assert.throws(() => parseZoneDecor(decor([barnProp, { ...barnProp, id: 'b2', position: [-32.5, 0, -100] }]), orchard), /props\[1\].position: the building's roof overlaps building "b1"/)
})

test('an item for sale on the edge of two seller areas is refused', () => {
  const second = { ...stall, id: 'a3', name: 'Second stall', npc: 'n3', bounds: { minX: -16, maxX: -8, minZ: -92, maxZ: -84 } }
  const seller = { ...cashier, id: 'n3', position: [-12, 0, -90] }
  assert.doesNotThrow(() => parseZoneDecor(decor([lamp, cashier, seller], { areas: [stall, second] }), orchard))
  assert.throws(() => parseZoneDecor(decor([{ ...lamp, position: [-16, 0, -88] }, cashier, seller], { areas: [stall, second] }), orchard), /sits on the edge of "Lamp stall" and "Second stall"/)
})

test('the preview of a building depends on its shape and colours, not on where it stands', () => {
  const placed = parseZoneDecor(withBarn({}), orchard).props[0] as Parameters<typeof buildingPreviewKey>[0]
  assert.equal(buildingPreviewKey(placed), buildingPreviewKey({ ...placed, position: [-30, 0, -90], yaw: Math.PI }))
  assert.notEqual(buildingPreviewKey(placed), buildingPreviewKey({ ...placed, height: 5 }))
  assert.match(buildingPreviewKey(placed), /^barn_[0-9a-f]{8}$/)
})

test('a building part can wear a library texture, tinted by its colour', () => {
  const textured = parseZoneDecor(withBarn({ textures: { walls: 'wood' } }), orchard).props[0] as Parameters<typeof buildingPreviewKey>[0]
  assert.deepEqual(textured.textures, { walls: 'wood' })
  assert.notEqual(buildingPreviewKey(textured), buildingPreviewKey({ ...textured, textures: undefined }))
  assert.throws(() => parseZoneDecor(withBarn({ textures: { chimney: 'wood' } }), orchard), /textures.chimney: expected one of walls/)
  assert.throws(() => parseZoneDecor(withBarn({ textures: { walls: 'Wood!' } }), orchard), /texture keys look like/)
})

test('any prop can belong to a group, saved with it', () => {
  const parsed = parseZoneDecor(decor([{ ...barnProp, group: 'group_1' }, { ...crate, group: 'group_1' }]), orchard)
  assert.deepEqual(parsed.props.map((p) => p.group), ['group_1', 'group_1'])
  assert.throws(() => parseZoneDecor(decor([{ ...crate, group: 'Group 1' }]), orchard), /props\[0\].group/)
  assert.throws(() => parseZoneDecor(decor([{ ...barnProp, group: 7 }]), orchard), /props\[0\].group: expected a non-empty string/)
})

test('a seller area can show a price tag in front of each item, and an item for sale can carry a description', () => {
  const described = { ...lamp, description: 'Arc lamp, warm light.' }
  const parsed = parseZoneDecor(decor([described, cashier], { areas: [{ ...stall, priceTags: true }] }), orchard)
  const [display] = areaStoreLayout(parsed, parsed.areas[0]!, new Map([['i1', [0.4, 1.6, 0.4]]])).displays
  assert.equal(display!.description, 'Arc lamp, warm light.')
  assert.deepEqual(display!.tag.position.map((v) => Number(v.toFixed(3))), [-21, 1.32, -87.5])
  const untagged = parseZoneDecor(decor([described, cashier], { areas: [stall] }), orchard)
  assert.deepEqual(areaStoreLayout(untagged, untagged.areas[0]!, new Map([['i1', [0.4, 1.6, 0.4]]])).displays[0]!.tag.position, lamp.position)
  assert.throws(() => parseZoneDecor(decor([lamp, cashier, farmer], { areas: [stall, { ...buyer, priceTags: true }] }), orchard), /only a seller area shows price tags/)
  assert.throws(() => parseZoneDecor(decor([{ ...crate, kind: 'item', code: 'decor_sofa_classic', forSale: false, description: 'x' }]), orchard), /only items for sale have a description/)
})

test('a mannequin sells its pieces at zone prices, and can show the clothes alone', () => {
  const tee = { slot: 'top', key: 'tee', color: '#9b8abf', forSale: true, code: 'COS_WEAR_TOP_TEE', price: 60 }
  const rack = { id: 'm1', kind: 'mannequin', position: [-21, 0, -88], yaw: 0, scale: [1, 1, 1], body: '#8b7aa8', bodyHidden: true, outfit: [tee] }
  const look = { ...rack, id: 'm2', position: [-19, 0, -88], bodyHidden: undefined, outfit: [tee, { slot: 'bottom', key: 'jeans', color: '#5a4e72', forSale: false }] }
  const parsed = parseZoneDecor(decor([cashier, rack, look], { areas: [stall] }), orchard)
  assert.deepEqual(zonePrices(parsed), { COS_WEAR_TOP_TEE: 60 })
  assert.equal((parsed.props[1] as { bodyHidden?: true }).bodyHidden, true)
  assert.deepEqual(areaStoreLayout(parsed, parsed.areas[0]!, new Map()).displays.map((d) => d.figure?.prop), ['m1', 'm2'])
  assert.throws(() => parseZoneDecor(decor([cashier, { ...rack, outfit: [{ ...tee, price: undefined }] }], { areas: [stall] }), orchard), /outfit\[0\].price: expected whole coins/)
  assert.throws(() => parseZoneDecor(decor([cashier, rack, { ...look, outfit: [{ ...tee, price: 61 }] }], { areas: [stall] }), orchard), /COS_WEAR_TOP_TEE is already sold at 60 coins/)
  assert.throws(() => parseZoneDecor(decor([cashier, { ...rack, position: [-35, 0, -110] }], { areas: [stall] }), orchard), /COS_WEAR_TOP_TEE is for sale outside every seller area/)
  assert.throws(() => parseZoneDecor(decor([{ ...rack, bodyHidden: false }]), orchard), /bodyHidden: set true/)
})

test('the pub staff come from the pub zone file and land in the manifest', () => {
  const pub = { key: 'pub', bounds: { minX: 80, maxX: 110, minZ: -150, maxZ: -110 } }
  const barman = { ...cashier, id: 'b1', role: 'bartender', position: [98.3, 0.2, -133.505], yaw: -Math.PI / 2 }
  const doorman = { ...cashier, id: 'b2', role: 'bouncer', position: [94, 0.2, -137.955] }
  const pubDecor = parseZoneDecor({ version: 1, zone: 'pub', name: 'Pub', props: [barman, doorman], areas: [] }, pub)
  const manifest = { zones: [], pub: { bartender: [0, 0, 0], bartenderYaw: 0, bouncer: [0, 0, 0] } } as unknown as Parameters<typeof withStaff>[0]
  const staffed = withStaff(manifest, pubDecor)
  assert.deepEqual([staffed.pub!.bartender, staffed.pub!.bartenderYaw, staffed.pub!.bouncer], [[98.3, 0.2, -133.505], 1.5708, [94, 0.2, -137.955]])
  assert.throws(() => parseZoneDecor({ version: 1, zone: 'pub', name: 'Pub', props: [barman], areas: [] }, pub), /the bouncer is missing/)
  assert.throws(() => parseZoneDecor({ version: 1, zone: 'pub', name: 'Pub', props: [barman, doorman, { ...barman, id: 'b3' }], areas: [] }, pub), /only one bartender/)
  assert.throws(() => parseZoneDecor(decor([{ ...cashier, role: 'bartender' }]), orchard), /the bartender works in zone pub/)
  assert.throws(() => parseZoneDecor(decor([{ ...cashier, role: 'chef' }]), orchard), /role: expected one of bartender, bouncer, nurse/)
})

test('a shop zone lives inside its parent zone and keeps its own bounds', () => {
  const shop = { version: 1, zone: 'stall_shop', name: 'Stall shop', parent: 'orchard', bounds: { minX: -24, maxX: -16, minZ: -92, maxZ: -84 }, props: [], areas: [] }
  const ref = zoneRefOf('stall_shop', shop, [orchard])
  assert.deepEqual(ref, { key: 'stall_shop', bounds: shop.bounds, parent: 'orchard' })
  assert.deepEqual([parseZoneDecor(shop, ref).parent, parseZoneDecor(shop, ref).bounds], ['orchard', shop.bounds])
  assert.throws(() => zoneRefOf('stall_shop', { ...shop, parent: undefined }, [orchard]), /a shop zone names its parent zone/)
  assert.throws(() => zoneRefOf('stall_shop', { ...shop, bounds: { ...shop.bounds, minX: -60 } }, [orchard]), /reaches outside zone orchard/)
  assert.throws(() => zoneRefOf('orchard', { parent: 'farm' }, [orchard]), /orchard is a main zone, it has no parent/)
  assert.throws(() => parseZoneDecor({ ...shop, bounds: { ...shop.bounds, maxX: -17 } }, ref), /zone.bounds: expected/)
  assert.throws(() => parseZoneDecor({ ...shop, parent: undefined }, ref), /zone.parent: expected orchard/)
})
