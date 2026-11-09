import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { hexToRgb, recolorPixels } from './partRecolor.ts'
import {
  assignTemplate,
  cellArea,
  cellPlacement,
  cellPresets,
  freeCells,
  parseCategories,
  parseDecorParts,
  parseMallTemplate,
  parseTemplateAssignments,
  parseTextureMeta,
  templateStoreLayout,
  toWorld,
  vendorCounter,
  type MallCell,
  type Vec3,
} from './mallTemplate.ts'

const mall = JSON.parse(readFileSync(new URL('../../../public/assets/store/mall/mall.layout.json', import.meta.url), 'utf8')) as { cells: MallCell[] }
const cell = (id: string) => mall.cells.find((c) => c.id === id)!

function assertNear(actual: Vec3, expected: Vec3) {
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]!) < 0.01, `${actual} vs ${expected}`))
}

const template = {
  version: 1,
  key: 'book_nook',
  name: 'Book Nook',
  preset: { width: 12.5, depth: 12 },
  props: [
    { id: 'a1', kind: 'decor', key: 'sofa_classic', position: [-3, 0, -4], yaw: 1.5708, scale: 1 },
    { id: 'a2', kind: 'item', key: 'floor_lamp', code: 'decor_floor_lamp', forSale: true, position: [2, 0, -6], yaw: 0, scale: 1, stack: [2, 1] },
    { id: 'a3', kind: 'npc', position: [0, 0, -9], yaw: 0, scale: 1, pose: 'idle', vendor: true, body: '#8b7aa8', outfit: [{ slot: 'top', key: 'tee', color: '#2f6b4f' }] },
    { id: 'a4', kind: 'mannequin', position: [-2, 0, -2], yaw: 0, scale: 1, body: '#e8e4dc', outfit: [{ slot: 'top', key: 'hoodie', color: '#c0392b', forSale: true, code: 'COS_WEAR_TOP_HOODIE' }, { slot: 'bottom', key: 'jeans', color: '#2f4f6b', forSale: false }] },
  ],
}

test('a cell facing north: the origin is on the glass line and -Z goes to the back wall', () => {
  const n01 = cellPlacement(cell('N01'))
  assertNear(n01.position, [-368.75, 0, -78])
  assertNear(toWorld(n01, [0, 0, -11.7]), [-368.75, 0, -89.7])
  assertNear(toWorld(n01, [8.75, 0, 0]), [-360, 0, -78])
})

test('a cell facing east on the upper level keeps y = 6', () => {
  const e17 = cellPlacement(cell('E17'))
  assertNear(e17.position, [-172, 6, -43.75])
  assertNear(toWorld(e17, [0, 1, -12]), [-160, 7, -43.75])
})

test('every cell of the mall fits its bounds once placed', () => {
  for (const c of mall.cells) {
    const p = cellPlacement(c)
    const corners = [toWorld(p, [-c.width / 2, 0, 0]), toWorld(p, [c.width / 2, 0, -c.depth])]
    const xs = corners.map((v) => v[0]).sort((a, b) => a - b)
    const zs = corners.map((v) => v[2]).sort((a, b) => a - b)
    assertNear([xs[0]!, 0, zs[0]!], [c.bounds.minX, 0, c.bounds.minZ])
    assertNear([xs[1]!, 0, zs[1]!], [c.bounds.maxX, 0, c.bounds.maxZ])
  }
})

test('presets only count planned cells, most common first', () => {
  const presets = cellPresets(mall.cells)
  assert.ok(presets.every((p) => p.count > 0))
  assert.deepEqual(presets.slice(0, 2).map((p) => [p.width, p.depth]).sort(), [[11.25, 12], [12.5, 12]])
  assert.ok(!presets.some((p) => p.width === 1.6))
})

test('free cells skip assigned, open and other-sized cells', () => {
  const preset = { width: 12.5, depth: 12 }
  const all = freeCells(mall.cells, preset, { version: 1, cells: {} })
  assert.equal(all.length, 32)
  const taken = all[0]!.id
  const rest = freeCells(mall.cells, preset, { version: 1, cells: { [taken]: 'book_nook' } })
  assert.equal(rest.length, 31)
  assert.ok(!rest.some((c) => c.id === taken))
  assert.ok(rest.every((c) => c.status === 'planned'))
})

test('the counter is 2 m in front of the vendor, like the GreenCart till', () => {
  assertNear(vendorCounter({ position: [-10, 0, 2.6], yaw: -Math.PI / 2 }), [-12, 1.15, 2.6])
  assertNear(vendorCounter({ position: [-5.3, 0, 4], yaw: Math.PI }), [-5.3, 1.15, 2])
})

test('a valid template parses unchanged', () => {
  assert.deepEqual(parseMallTemplate(structuredClone(template)), template)
})

test('a broken template says what is wrong and where', () => {
  const broken = (edit: (t: typeof template & Record<string, unknown>) => void) => {
    const t = structuredClone(template) as typeof template & Record<string, unknown>
    edit(t)
    return () => parseMallTemplate(t)
  }
  assert.throws(broken((t) => (t.key = 'Book Nook')), /template\.key/)
  assert.throws(broken((t) => ((t.props[0] as Record<string, unknown>).position = [0, Number.NaN, 0])), /props\[0\]\.position\[1\]/)
  assert.throws(broken((t) => ((t.props[0] as Record<string, unknown>).scale = 0)), /props\[0\]\.scale/)
  assert.throws(broken((t) => ((t.props[1] as Record<string, unknown>).id = 'a1')), /"a1" is used twice/)
  assert.throws(broken((t) => ((t.props[1] as Record<string, unknown>).stack = [0, 1])), /props\[1\]\.stack/)
  assert.throws(broken((t) => ((t.props[2] as Record<string, unknown>).outfit = [{ slot: 'cape', key: 'x', color: '#000000' }])), /outfit\[0\]\.slot/)
  assert.throws(broken((t) => ((t.props[2] as Record<string, unknown>).outfit = [{ slot: 'top', key: 'tee', color: '#000000' }, { slot: 'top', key: 'polo', color: '#000000' }])), /worn twice/)
  assert.throws(broken((t) => t.props.push({ ...t.props[2]!, id: 'a5' })), /only one NPC can be the vendor/)
  assert.throws(broken((t) => ((t.props[1] as Record<string, unknown>).forSale = undefined)), /props\[1\]\.forSale/)
  assert.throws(broken((t) => ((t.props[1] as Record<string, unknown>).forSale = false)), /only items for sale are stacked/)
  assert.throws(broken((t) => ((t.props[3] as Record<string, unknown>).vendor = true)), /props\[3\]\.vendor: unknown field/)
  assert.throws(broken((t) => (((t.props[3] as Record<string, unknown>).outfit as Record<string, unknown>[])[0]!.code = undefined)), /outfit\[0\]\.code/)
  assert.throws(broken((t) => (((t.props[3] as Record<string, unknown>).outfit as Record<string, unknown>[])[1]!.code = 'COS_X')), /only pieces for sale carry an item code/)
  assert.throws(broken((t) => (((t.props[2] as Record<string, unknown>).outfit as Record<string, unknown>[])[0]!.forSale = true)), /outfit\[0\]\.forSale: unknown field/)
  assert.throws(broken((t) => ((t.props[0] as Record<string, unknown>).kind = 'lamp')), /props\[0\]\.kind/)
  assert.throws(broken((t) => ((t.props[0] as Record<string, unknown>).kind = '__proto__')), /props\[0\]\.kind/)
  assert.throws(broken((t) => ((t as Record<string, unknown>).version = 2)), /template\.version/)
  assert.throws(broken((t) => ((t.props[0] as Record<string, unknown>).stack = [1, 1])), /props\[0\]\.stack: unknown field/)
  assert.throws(broken((t) => ((t as Record<string, unknown>).extra = true)), /template\.extra: unknown field/)
  assert.throws(broken((t) => ((t.props[1] as Record<string, unknown>).stack = [1.5, 1])), /props\[1\]\.stack/)
  assert.throws(broken((t) => ((t.props[1] as Record<string, unknown>).code = '../../x')), /props\[1\]\.code/)
  assert.throws(broken((t) => Object.assign(t.props[1]!, { key: 'apple', code: 'food_burger' })), /model in folder burger/)
  assert.throws(broken((t) => ((t.props[2] as Record<string, unknown>).pose = 'dance')), /props\[2\]\.pose/)
  assert.throws(broken((t) => ((t.props[2] as Record<string, unknown>).vendor = 'yes')), /props\[2\]\.vendor/)
  assert.throws(broken((t) => ((t.props[2] as Record<string, unknown>).body = 'purple')), /props\[2\]\.body/)
  assert.throws(broken((t) => ((t.props[2] as Record<string, unknown>).outfit = [{ slot: 'top', key: '../x', color: '#000000' }])), /outfit\[0\]\.key/)
  assert.throws(broken((t) => (t.preset.width = 0)), /preset\.width/)
  assert.throws(broken((t) => ((t.props[2] as Record<string, unknown>).pose = 'sit')), /the vendor stands/)
  assert.throws(broken((t) => ((t.props[2] as Record<string, unknown>).scale = 1.2)), /the vendor stands/)
})

test('props stay inside the cell: between the side walls, behind the glass, on or above the floor', () => {
  const at = (index: number, position: Vec3) => {
    const t = structuredClone(template)
    t.props[index]!.position = position
    return () => parseMallTemplate(t)
  }
  assert.doesNotThrow(at(0, [6.1, 0, -11.7]))
  assert.doesNotThrow(at(0, [-6.1, 2, 0]))
  assert.throws(at(0, [6.2, 0, -4]), /props\[0\]\.position: outside the 12.5×12 cell/)
  assert.throws(at(0, [0, 0, 0.1]), /outside/)
  assert.throws(at(0, [0, 0, -11.8]), /outside/)
  assert.throws(at(0, [0, -0.1, -4]), /outside/)
  assert.throws(at(2, [0, 0, -1]), /counter in front of the vendor is outside/)
})

test('assigning a template only fills a free planned cell of its preset', () => {
  const parsed = parseMallTemplate(structuredClone(template))
  const empty = { version: 1 as const, cells: {} }
  const free = freeCells(mall.cells, parsed.preset, empty)[0]!
  const once = assignTemplate(empty, mall.cells, free.id, parsed)
  assert.deepEqual(once.cells, { [free.id]: 'book_nook' })
  assert.deepEqual(assignTemplate(once, mall.cells, free.id, parsed), once)
  assert.throws(() => assignTemplate(once, mall.cells, free.id, { ...parsed, key: 'other' }), /already holds book_nook/)
  assert.deepEqual(assignTemplate(once, mall.cells, free.id, null).cells, {})
  assert.throws(() => assignTemplate(empty, mall.cells, 'N01', parsed), /is open/)
  const otherSize = mall.cells.find((c) => c.status === 'planned' && c.depth === 9.5)!
  assert.throws(() => assignTemplate(empty, mall.cells, otherSize.id, parsed), /template book_nook is 12.5×12/)
  assert.throws(() => assignTemplate(empty, mall.cells, 'Z99', parsed), /no such cell/)
})

test('assignments map cell ids to template keys', () => {
  assert.deepEqual(parseTemplateAssignments({ version: 1, cells: { W02: 'book_nook' } }), { version: 1, cells: { W02: 'book_nook' } })
  assert.throws(() => parseTemplateAssignments({ version: 1, cells: { W02: '' } }), /assignments\.cells\.W02/)
  assert.throws(() => parseTemplateAssignments(JSON.parse('{"version":1,"cells":{"__proto__":"book_nook"}}')), /assignments\.cells\.__proto__/)
  assert.throws(() => parseTemplateAssignments({ version: 1, cells: { toString: 'book_nook' } }), /cell ids/)
})

test('a template becomes a store layout: items are displays, the vendor gives the clerk and the counter', () => {
  const parsed = parseMallTemplate(structuredClone(template))
  const layout = templateStoreLayout(parsed, new Map([['a2', [0.4, 1.6, 0.4]]]))
  assert.equal(layout.displays.length, 2)
  assert.deepEqual(layout.displays[1]!.figure, { prop: 'a4', slot: 'top' })
  assert.equal(layout.displays[1]!.code, 'COS_WEAR_TOP_HOODIE')
  assert.deepEqual(layout.displays[0]!.size, [0.4, 1.6, 0.4])
  assert.deepEqual(layout.displays[0]!.stack, [2, 1])
  assert.deepEqual(layout.clerk, { position: [0, 0, -9], yaw: 0 })
  assertNear(layout.counter!, [0, 1.15, -7])
  assert.deepEqual(layout.bounds, { minX: -6.25, maxX: 6.25, minZ: -12, maxZ: 0 })
  assert.throws(() => templateStoreLayout(parsed, new Map()), /a2: model size missing/)
  const propsOnly = { ...parsed, props: parsed.props.map((p) => (p.kind === 'item' ? { ...p, forSale: false, stack: undefined } : p)) }
  assert.equal(templateStoreLayout(propsOnly, new Map()).displays.length, 1)
  const withoutVendor = { ...parsed, props: parsed.props.filter((p) => p.kind !== 'npc') }
  assert.equal(templateStoreLayout(withoutVendor, new Map([['a2', [1, 1, 1]]])).counter, undefined)
})

test('every decor folder sits in exactly one category of decor/categories.json', () => {
  const decorDir = new URL('../../../public/assets/decor/', import.meta.url)
  const categories = parseCategories(JSON.parse(readFileSync(new URL('categories.json', decorDir), 'utf8')))
  const folders = readdirSync(decorDir).filter((name) => statSync(new URL(name, decorDir)).isDirectory() && existsSync(new URL(`${name}/model.glb`, decorDir))).sort()
  assert.deepEqual(categories.flatMap((c) => c.keys).sort(), folders)
  assert.throws(() => parseCategories({ version: 1, categories: [{ id: 'a', label: 'A', keys: ['x'] }, { id: 'b', label: 'B', keys: ['x'] }] }), /x is in two categories/)
})

test('lights: point or spot with colour, intensity and range, at most 8 per cell', () => {
  const point = { id: 'l1', kind: 'light', light: 'point', position: [0, 3, -4], yaw: 0, scale: 1, color: '#ffd9a0', intensity: 8, range: 8 }
  const spot = { ...point, id: 'l2', light: 'spot', angle: Math.PI / 6, pitch: Math.PI / 2 }
  const withProps = (props: unknown[]) => () => parseMallTemplate({ ...structuredClone(template), props: [...structuredClone(template.props), ...props] })
  assert.doesNotThrow(withProps([point, spot]))
  assert.throws(withProps([{ ...point, angle: 0.5 }]), /only spot lights have an angle and a pitch/)
  assert.throws(withProps([{ ...spot, angle: 2 }]), /angle: expected at most π\/2/)
  assert.throws(withProps([{ ...spot, pitch: undefined }]), /pitch/)
  assert.throws(withProps([{ ...point, intensity: 0 }]), /intensity/)
  assert.throws(withProps(Array.from({ length: 9 }, (_, i) => ({ ...point, id: `x${i}` }))), /at most 8 lights/)
})

test('surfaces and decor materials take a texture, a colour or both', () => {
  const surfaces = { back: { texture: 'brick' }, floor: { texture: 'wood_floor', color: '#c08040' }, left: { color: '#203040' } }
  assert.deepEqual(parseMallTemplate({ ...structuredClone(template), surfaces }).surfaces, surfaces)
  assert.throws(() => parseMallTemplate({ ...structuredClone(template), surfaces: { front: { texture: 'brick' } } }), /surfaces\.front: unknown field/)
  assert.throws(() => parseMallTemplate({ ...structuredClone(template), surfaces: { back: { texture: '../x' } } }), /surfaces\.back\.texture/)
  assert.throws(() => parseMallTemplate({ ...structuredClone(template), surfaces: { back: {} } }), /expected a texture, a color, part colors or a mix/)
  const t = structuredClone(template) as typeof template & { props: Record<string, unknown>[] }
  t.props[0]!.materials = { DC_sofa_classic_Fabric: { color: '#aa2233' } }
  assert.deepEqual((parseMallTemplate(t).props[0] as { materials?: unknown }).materials, { DC_sofa_classic_Fabric: { color: '#aa2233' } })
  t.props[0]!.materials = { 'bad name/x': { color: '#aa2233' } }
  assert.throws(() => parseMallTemplate(t), /material names/)
})

test('every texture folder has a valid texture.json and sits in one category', () => {
  const dir = new URL('../../../public/assets/textures/', import.meta.url)
  const categories = parseCategories(JSON.parse(readFileSync(new URL('categories.json', dir), 'utf8')))
  const folders = readdirSync(dir).filter((name) => statSync(new URL(name, dir)).isDirectory()).sort()
  assert.deepEqual(categories.flatMap((c) => c.keys).sort(), folders)
  for (const key of folders) {
    const meta = parseTextureMeta(JSON.parse(readFileSync(new URL(`${key}/texture.json`, dir), 'utf8')), key)
    assert.ok(existsSync(new URL(`${key}/${meta.maps.color}`, dir)), `${key}: ${meta.maps.color} missing`)
  }
  assert.throws(() => parseTextureMeta({ version: 1, key: 'a', label: 'A', tileMeters: 2, maps: { color: 'color.png' } }, 'b'), /expected b/)
})

test('the walls of a built cell come from its interior bounds, an end cell is narrower', () => {
  const e17 = { ...cell('E17'), interior: { minX: -172.0, maxX: -160.3, minZ: -49.7, maxZ: -37.65 } }
  const area = cellArea(e17)
  assert.ok(Math.abs(area.minZ + 11.7) < 0.01, `${area.minZ}`)
  assert.ok(Math.abs(area.maxX - area.minX - 12.05) < 0.01, `${area.maxX - area.minX}`)
  assert.deepEqual(cellArea(cell('E17')), { minX: -6.1, maxX: 6.1, minZ: -11.7 })
})

test('a look can recolour the parts of a texture by type', () => {
  const surfaces = { back: { texture: 'brick', parts: { bricks: '#404048', mortar: '#f0ece4' } } }
  assert.deepEqual(parseMallTemplate({ ...structuredClone(template), surfaces }).surfaces, surfaces)
  assert.throws(() => parseMallTemplate({ ...structuredClone(template), surfaces: { back: { parts: { bricks: 'red' } } } }), /parts\.bricks/)
  assert.throws(() => parseMallTemplate({ ...structuredClone(template), surfaces: { back: { parts: { bricks: '#ff0000' } } } }), /part colours need a texture/)
  const twice = { version: 1, materials: { DC_Rug: { mask: 'parts_DC_Rug.png', parts: [{ id: 'main', label: 'Main', color: '#ffffff' }, { id: 'main', label: 'Main', color: '#000000' }] } } }
  assert.throws(() => parseDecorParts(twice, 'rug'), /"main" is used twice/)
})

test('recolouring keeps the shading of each part and leaves untouched parts alone', () => {
  const color = new Uint8ClampedArray([200, 100, 50, 255, 100, 50, 25, 255, 220, 220, 220, 255])
  const mask = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 1, 0, 0, 255])
  const out = recolorPixels(color, mask, [[200, 100, 50], [220, 220, 220]], [hexToRgb('#3264c8'), null])
  assert.deepEqual([...out.slice(0, 3)], [50, 100, 200])
  assert.deepEqual([...out.slice(4, 7)], [25, 50, 100])
  assert.deepEqual([...out.slice(8, 11)], [220, 220, 220])
  assert.throws(() => recolorPixels(color, mask.slice(0, 4), [], []), /differ in size/)
})

test('every decor parts.json is valid and its masks exist', () => {
  const dir = new URL('../../../public/assets/decor/', import.meta.url)
  for (const key of readdirSync(dir).filter((name) => existsSync(new URL(`${name}/parts.json`, dir)))) {
    const materials = parseDecorParts(JSON.parse(readFileSync(new URL(`${key}/parts.json`, dir), 'utf8')), key)
    for (const { mask } of Object.values(materials)) assert.ok(existsSync(new URL(`${key}/${mask}`, dir)), `${key}/${mask}`)
  }
})
