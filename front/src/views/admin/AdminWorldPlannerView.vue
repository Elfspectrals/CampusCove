<script setup lang="ts">
/**
 * Admin world planner: a top-down, planning-only view of the open world. It reads the real map
 * (`world.manifest.json` zones + buildings, `town.collision.json` as a ghost outline) and lets an admin
 * paint typed zones (houses / shops / jobs / park / landmark), draw roads and move or add blocks, a bit
 * like a city builder. Nothing here touches the game: the plan lives in this browser (localStorage) and
 * is exported as JSON, then built for real through the Blender scripts.
 *
 * Coordinates are game metres: X to the right, Z downwards (so -Z, towards the pond, is up).
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { fetchWorldManifest, type WorldManifest } from '../../game/world/worldManifest'

type ZoneTypeKey = 'houses' | 'shops' | 'jobs' | 'park' | 'civic' | 'other'
type RoadTypeKey = 'path' | 'street' | 'avenue'

interface PlanBlock {
  id: string
  source: 'zone' | 'building' | 'new'
  kind: string
  name: string
  color: string
  /** Centre, in game metres. */
  x: number
  z: number
  /** Size along the block's local X / Z. */
  width: number
  depth: number
  /** Game rotationY, in degrees. */
  rotationDeg: number
  note: string
  /** Painted zones only: what the area is for. */
  zoneType?: ZoneTypeKey
}

interface RoadPoint {
  x: number
  z: number
}

interface PlanRoad {
  id: string
  name: string
  type: RoadTypeKey
  points: RoadPoint[]
}

interface GhostBox {
  name: string
  x: number
  z: number
  hx: number
  hz: number
  rotationDeg: number
  water: boolean
}

interface Marker {
  kind: 'spawn' | 'gate' | 'fishing' | 'kiosk' | 'door'
  x: number
  z: number
  label?: string
}

interface StoredPlan {
  version: 1
  edits: Record<string, PlanBlock>
  added: PlanBlock[]
  roads?: PlanRoad[]
}

const STORAGE_KEY = 'cc.admin.worldPlanner.v1'
/** Player move speed in /game (useGameMovement MOVE_SPEED). */
const MOVE_SPEED = 8
const KIND_COLORS: Record<string, string> = {
  town: '#4fa3ff',
  work_district: '#ffca3a',
  pond: '#3dd6c4',
  retail_park: '#ff7aa8',
  house: '#9b8cff',
  work: '#ffb340',
  store: '#ff5f8f',
  town_hall: '#f2f2f2',
}
const NEW_COLOR = '#7ee081'

/**
 * Zone types. Lot sizes come from the real buildings: a house is ~9 m square (14 m lot with garden and
 * path), work buildings and Cove Home's units are ~16 x 15 m (20-22 m lots with a forecourt).
 */
const ZONE_TYPES: { key: ZoneTypeKey; label: string; color: string; lot?: [number, number]; hint: string }[] = [
  { key: 'houses', label: 'Houses', color: '#6fd36a', lot: [14, 14], hint: 'homes to rent or buy' },
  { key: 'shops', label: 'Shops', color: '#4fa3ff', lot: [20, 18], hint: 'stores, cafés, a mall' },
  { key: 'jobs', label: 'Jobs', color: '#ffca3a', lot: [22, 18], hint: 'work buildings' },
  { key: 'park', label: 'Park', color: '#2fbf8f', hint: 'green space, fishing, events' },
  { key: 'civic', label: 'Landmark', color: '#b48cff', hint: 'plaza, monument, town hall' },
  { key: 'other', label: 'Other', color: '#8a8fa3', hint: 'anything else' },
]
const ROAD_TYPES: { key: RoadTypeKey; label: string; width: number; color: string }[] = [
  { key: 'path', label: 'Path', width: 3, color: '#b9a27a' },
  { key: 'street', label: 'Street', width: 6, color: '#7d8296' },
  { key: 'avenue', label: 'Avenue', width: 10, color: '#62677c' },
]
/** Walk-time rings around spawn, in seconds. */
const WALK_RINGS = [15, 30, 60]

const zoneTypeOf = (key?: ZoneTypeKey) => ZONE_TYPES.find((t) => t.key === key)
const roadTypeOf = (key: RoadTypeKey) => ROAD_TYPES.find((t) => t.key === key) ?? ROAD_TYPES[1]!

const loading = ref(true)
const error = ref<string | null>(null)
const message = ref<string | null>(null)

const manifest = ref<WorldManifest | null>(null)
const originals = ref<Record<string, PlanBlock>>({})
const blocks = ref<PlanBlock[]>([])
const roads = ref<PlanRoad[]>([])
const ghosts = ref<GhostBox[]>([])
const markers = ref<Marker[]>([])

const selectedId = ref<string | null>(null)
const selected = computed(() => blocks.value.find((b) => b.id === selectedId.value) ?? null)
const selectedRoad = computed(() => roads.value.find((r) => r.id === selectedId.value) ?? null)

const layers = reactive({ zones: true, buildings: true, roads: true, ghost: true, markers: true, labels: true, rings: true })
const snap = ref<0 | 1 | 5>(1)
type Tool = 'select' | 'zone' | 'road' | 'measure'
const tool = ref<Tool>('select')
const zoneType = ref<ZoneTypeKey>('houses')
const roadType = ref<RoadTypeKey>('street')

const addForm = reactive({ name: 'Mall', width: 60, depth: 40, color: '#ff7aa8' })
const exportText = ref('')
const importText = ref('')
const showImport = ref(false)
const showLayers = ref(false)

// ---- map view (viewBox in metres) ----
const svgRef = ref<SVGSVGElement | null>(null)
const view = reactive({ x: -80, y: -90, w: 200, h: 220 })
const clientSize = reactive({ w: 800, h: 600 })
const cursor = ref<{ x: number; z: number } | null>(null)
const measure = ref<{ x1: number; z1: number; x2: number; z2: number } | null>(null)
const paintDraft = ref<{ x0: number; z0: number; x1: number; z1: number } | null>(null)
const roadDraft = ref<RoadPoint[]>([])

/** Metres per screen pixel, used to keep labels, handles and strokes a constant on-screen size. */
const mpp = computed(() => Math.max(view.w / clientSize.w, view.h / clientSize.h))
const viewBox = computed(() => `${view.x} ${view.y} ${view.w} ${view.h}`)

let resizeObserver: ResizeObserver | null = null

/** Zoom to the built area (the real zones), not the world border, which is far bigger than the town. */
function fitView(): void {
  const zones = manifest.value?.zones ?? []
  if (!zones.length) return
  const b = {
    minX: Math.min(...zones.map((z) => z.bounds.minX)),
    maxX: Math.max(...zones.map((z) => z.bounds.maxX)),
    minZ: Math.min(...zones.map((z) => z.bounds.minZ)),
    maxZ: Math.max(...zones.map((z) => z.bounds.maxZ)),
  }
  const pad = 15
  const w = b.maxX - b.minX + pad * 2
  const h = b.maxZ - b.minZ + pad * 2
  const aspect = clientSize.w / clientSize.h
  const vw = Math.max(w, h * aspect)
  const vh = vw / aspect
  view.w = vw
  view.h = vh
  view.x = (b.minX + b.maxX) / 2 - vw / 2
  view.y = (b.minZ + b.maxZ) / 2 - vh / 2
}

function toWorld(event: { clientX: number; clientY: number }): { x: number; z: number } {
  const svg = svgRef.value
  if (!svg) return { x: 0, z: 0 }
  const pt = svg.createSVGPoint()
  pt.x = event.clientX
  pt.y = event.clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, z: 0 }
  const p = pt.matrixTransform(ctm.inverse())
  return { x: p.x, z: p.y }
}

function snapValue(value: number): number {
  return snap.value ? Math.round(value / snap.value) * snap.value : Math.round(value * 10) / 10
}

const gridLines = computed(() => {
  const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = []
  const step = 5 / mpp.value >= 10 ? 5 : 25
  const x0 = Math.floor(view.x / step) * step
  const y0 = Math.floor(view.y / step) * step
  for (let x = x0; x <= view.x + view.w; x += step) {
    lines.push({ x1: x, y1: view.y, x2: x, y2: view.y + view.h, major: Math.round(x) % 25 === 0 })
  }
  for (let y = y0; y <= view.y + view.h; y += step) {
    lines.push({ x1: view.x, y1: y, x2: view.x + view.w, y2: y, major: Math.round(y) % 25 === 0 })
  }
  return lines
})

/** Scale bar: the largest "nice" length that stays under ~140 px. */
const scaleBar = computed(() => {
  const maxMetres = 140 * mpp.value
  const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].filter((n) => n <= maxMetres).pop() ?? 1
  return { metres: nice, px: nice / mpp.value }
})

// ---- loading the real map ----
function quatYawDeg(qy: number, qw: number): number {
  return (2 * Math.atan2(qy, qw) * 180) / Math.PI
}

const radToDeg = (r: number): number => Math.round(((r * 180) / Math.PI) * 100) / 100

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const [world, collision] = await Promise.all([
      fetchWorldManifest(),
      fetch('/assets/town/town.collision.json').then((r) => (r.ok ? r.json() : { cuboids: [] })),
    ])
    manifest.value = world

    const cuboids = (collision.cuboids ?? []) as { name: string; cx: number; cz: number; hx: number; hz: number; qy: number; qw: number }[]
    ghosts.value = cuboids.map((c) => ({
      name: c.name,
      x: c.cx,
      z: c.cz,
      hx: c.hx,
      hz: c.hz,
      rotationDeg: quatYawDeg(c.qy, c.qw),
      water: /Water|Creek|Mare/.test(c.name),
    }))
    const houseBoxes = new Map(cuboids.filter((c) => c.name.startsWith('COL_House_')).map((c) => [c.name.slice('COL_House_'.length), c]))
    const townHallBox = cuboids.find((c) => c.name === 'COL_TownHall')

    const real: PlanBlock[] = []
    const marks: Marker[] = [{ kind: 'spawn', x: world.spawn[0], z: world.spawn[2], label: 'Spawn' }]
    for (const zone of world.zones) {
      const b = zone.bounds
      real.push({
        id: `zone:${zone.key}`,
        source: 'zone',
        kind: zone.key,
        name: zone.key.replace(/_/g, ' '),
        color: KIND_COLORS[zone.key] ?? '#8a8fa3',
        x: (b.minX + b.maxX) / 2,
        z: (b.minZ + b.maxZ) / 2,
        width: b.maxX - b.minX,
        depth: b.maxZ - b.minZ,
        rotationDeg: 0,
        note: '',
      })
      const extra = zone as unknown as {
        gate?: { x: number; z: number; width: number }
        kiosk?: { position: [number, number, number] }
        townHall?: { position: [number, number, number] }
      }
      if (extra.gate) marks.push({ kind: 'gate', x: extra.gate.x, z: extra.gate.z, label: `${zone.key} gate` })
      if (extra.kiosk) marks.push({ kind: 'kiosk', x: extra.kiosk.position[0], z: extra.kiosk.position[2], label: 'Kiosk' })
      for (const spot of zone.fishingSpots ?? []) marks.push({ kind: 'fishing', x: spot.position[0], z: spot.position[2] })
      if (extra.townHall && townHallBox) {
        real.push({
          id: 'building:town_hall',
          source: 'building',
          kind: 'town_hall',
          name: 'Town Hall',
          color: KIND_COLORS.town_hall!,
          x: townHallBox.cx,
          z: townHallBox.cz,
          width: townHallBox.hx * 2,
          depth: townHallBox.hz * 2,
          rotationDeg: quatYawDeg(townHallBox.qy, townHallBox.qw),
          note: '',
        })
      }
      for (const building of zone.buildings ?? []) {
        const box = building.kind === 'house' ? houseBoxes.get(building.key) : undefined
        const [footW = 10, footD = 10] = 'footprint' in building ? building.footprint : []
        real.push({
          id: `building:${building.key}`,
          source: 'building',
          kind: building.kind,
          name: building.name,
          color: KIND_COLORS[building.kind] ?? '#8a8fa3',
          x: box ? box.cx : building.position[0],
          z: box ? box.cz : building.position[2],
          width: box ? box.hx * 2 : footW,
          depth: box ? box.hz * 2 : footD,
          rotationDeg: box ? quatYawDeg(box.qy, box.qw) : radToDeg(building.rotationY),
          note: '',
        })
        marks.push({ kind: 'door', x: building.door[0], z: building.door[2] })
      }
    }
    for (const block of real) {
      block.x = round2(block.x)
      block.z = round2(block.z)
      block.width = round2(block.width)
      block.depth = round2(block.depth)
      block.rotationDeg = round2(block.rotationDeg)
    }
    originals.value = Object.fromEntries(real.map((b) => [b.id, { ...b }]))
    markers.value = marks
    const stored = readStoredPlan()
    blocks.value = applyPlan(real, stored)
    roads.value = (stored?.roads ?? []).map((r) => ({ ...r, points: r.points.map((p) => ({ ...p })) }))
    history.value = [snapshot()]
    historyIndex.value = 0
    fitView()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Could not load the world map'
  } finally {
    loading.value = false
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100
const newId = (prefix: string): string => `${prefix}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

// ---- plan persistence ----
function readStoredPlan(): StoredPlan | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredPlan) : null
  } catch {
    return null
  }
}

function applyPlan(real: PlanBlock[], plan: StoredPlan | null): PlanBlock[] {
  if (!plan) return real.map((b) => ({ ...b }))
  return [...real.map((b) => ({ ...b, ...(plan.edits[b.id] ?? {}), id: b.id, source: b.source })), ...plan.added.map((b) => ({ ...b }))]
}

function isChanged(block: PlanBlock): boolean {
  const original = originals.value[block.id]
  if (!original) return block.source === 'new'
  return (['name', 'color', 'x', 'z', 'width', 'depth', 'rotationDeg', 'note'] as const).some((k) => original[k] !== block[k])
}

const changedBlocks = computed(() => blocks.value.filter((b) => b.source !== 'new' && isChanged(b)))
const addedBlocks = computed(() => blocks.value.filter((b) => b.source === 'new'))

watch(
  [blocks, roads],
  () => {
    if (loading.value) return
    const plan: StoredPlan = {
      version: 1,
      edits: Object.fromEntries(changedBlocks.value.map((b) => [b.id, { ...b }])),
      added: addedBlocks.value.map((b) => ({ ...b })),
      roads: roads.value,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plan))
    } catch {
      // Private window / blocked storage: the plan still works for this visit, export it to keep it.
    }
  },
  { deep: true },
)

// ---- zones (lots) and roads (length) ----
function lotsOf(b: PlanBlock): { cols: number; rows: number; count: number } | null {
  const lot = zoneTypeOf(b.zoneType)?.lot
  if (!lot) return null
  const cols = Math.floor(b.width / lot[0])
  const rows = Math.floor(b.depth / lot[1])
  return { cols, rows, count: cols * rows }
}

/** Lot subdivision lines in the block's local frame, for the city-builder look. */
function lotGrid(b: PlanBlock): { xs: number[]; zs: number[] } | null {
  const lots = lotsOf(b)
  if (!lots || lots.count === 0) return null
  const xs = Array.from({ length: lots.cols - 1 }, (_, i) => -b.width / 2 + ((i + 1) * b.width) / lots.cols)
  const zs = Array.from({ length: lots.rows - 1 }, (_, i) => -b.depth / 2 + ((i + 1) * b.depth) / lots.rows)
  return { xs, zs }
}

function roadLength(road: { points: RoadPoint[] }): number {
  let total = 0
  for (let i = 1; i < road.points.length; i++) {
    total += Math.hypot(road.points[i]!.x - road.points[i - 1]!.x, road.points[i]!.z - road.points[i - 1]!.z)
  }
  return Math.round(total)
}

const pointsAttr = (points: RoadPoint[]): string => points.map((p) => `${p.x},${p.z}`).join(' ')

/** Plan totals, like a city builder's info panel. */
const summary = computed(() => {
  const zones = ZONE_TYPES.map((t) => {
    const list = addedBlocks.value.filter((b) => b.zoneType === t.key)
    return {
      ...t,
      zones: list.length,
      lots: t.lot ? list.reduce((sum, b) => sum + (lotsOf(b)?.count ?? 0), 0) : null,
      area: Math.round(list.reduce((sum, b) => sum + b.width * b.depth, 0)),
    }
  }).filter((t) => t.zones > 0)
  const roadMetres = roads.value.reduce((sum, r) => sum + roadLength(r), 0)
  return { zones, roadMetres, roadCount: roads.value.length }
})

// ---- editing ----
function addBlock(spec: { name: string; width: number; depth: number; color: string } = addForm): void {
  const block: PlanBlock = {
    id: newId('new'),
    source: 'new',
    kind: 'new',
    name: spec.name.trim() || 'New block',
    color: spec.color,
    x: snapValue(view.x + view.w / 2),
    z: snapValue(view.y + view.h / 2),
    width: Math.max(1, spec.width),
    depth: Math.max(1, spec.depth),
    rotationDeg: 0,
    note: '',
  }
  blocks.value.push(block)
  selectedId.value = block.id
}

function paintZone(x0: number, z0: number, x1: number, z1: number): void {
  const width = Math.abs(x1 - x0)
  const depth = Math.abs(z1 - z0)
  if (width < 4 || depth < 4) return
  const type = zoneTypeOf(zoneType.value)!
  const count = addedBlocks.value.filter((b) => b.zoneType === type.key).length + 1
  const block: PlanBlock = {
    id: newId('new'),
    source: 'new',
    kind: 'new',
    name: `${type.label} ${count}`,
    color: type.color,
    x: round2((x0 + x1) / 2),
    z: round2((z0 + z1) / 2),
    width: round2(width),
    depth: round2(depth),
    rotationDeg: 0,
    note: '',
    zoneType: type.key,
  }
  blocks.value.push(block)
  selectedId.value = block.id
}

function setZoneType(block: PlanBlock, key: ZoneTypeKey): void {
  const type = zoneTypeOf(key)!
  // Rename default "Houses 2" style names, keep custom ones.
  const previous = zoneTypeOf(block.zoneType)
  if (previous && block.name.startsWith(previous.label)) block.name = type.label + block.name.slice(previous.label.length)
  block.zoneType = key
  block.color = type.color
}

function deleteSelected(): void {
  if (selectedRoad.value) {
    const id = selectedRoad.value.id
    roads.value = roads.value.filter((r) => r.id !== id)
    selectedId.value = null
    return
  }
  const block = selected.value
  if (!block || block.source !== 'new') return
  blocks.value = blocks.value.filter((b) => b.id !== block.id)
  selectedId.value = null
}

function duplicateSelected(): void {
  const block = selected.value
  if (!block) return
  const copy: PlanBlock = { ...block, id: newId('new'), source: 'new', kind: 'new', name: `${block.name} copy`, x: block.x + 5, z: block.z + 5 }
  blocks.value.push(copy)
  selectedId.value = copy.id
}

function resetSelected(): void {
  const block = selected.value
  const original = block ? originals.value[block.id] : undefined
  if (block && original) Object.assign(block, original)
}

function clearPlan(): void {
  if (!window.confirm('Clear the whole plan? Moved blocks go back to the real map, new zones and roads are removed. (Ctrl+Z brings it back.)')) return
  blocks.value = Object.values(originals.value).map((b) => ({ ...b }))
  roads.value = []
  roadDraft.value = []
  selectedId.value = null
  measure.value = null
}

function distanceFromSpawn(point: { x: number; z: number }): { metres: number; seconds: number } {
  const spawn = manifest.value?.spawn ?? [0, 0, 0]
  const metres = Math.hypot(point.x - spawn[0], point.z - spawn[2])
  return { metres: Math.round(metres), seconds: Math.round(metres / MOVE_SPEED) }
}

// ---- road drawing ----
/** Snap to an existing road point when close (so roads join up), otherwise to the grid. */
function snapRoadPoint(p: RoadPoint, skip?: { id: string; index: number }): RoadPoint {
  const radius = Math.max(2, 12 * mpp.value)
  let best: RoadPoint | null = null
  let bestDist = radius
  const candidates = [
    ...roads.value.flatMap((r) => r.points.map((q, index) => ({ q, skip: skip && skip.id === r.id && skip.index === index }))),
    ...roadDraft.value.slice(0, 1).map((q) => ({ q, skip: false })),
  ]
  for (const { q, skip: skipped } of candidates) {
    if (skipped) continue
    const d = Math.hypot(q.x - p.x, q.z - p.z)
    if (d < bestDist) {
      best = q
      bestDist = d
    }
  }
  return best ? { x: best.x, z: best.z } : { x: snapValue(p.x), z: snapValue(p.z) }
}

function addRoadPoint(p: RoadPoint): void {
  const point = snapRoadPoint(p)
  const last = roadDraft.value[roadDraft.value.length - 1]
  // Clicking the last point again (double-click) finishes the road.
  if (last && Math.hypot(last.x - point.x, last.z - point.z) < 0.5) return finishRoad()
  roadDraft.value = [...roadDraft.value, point]
}

function finishRoad(): void {
  const points = roadDraft.value
  roadDraft.value = []
  if (points.length < 2) return
  const type = roadTypeOf(roadType.value)
  const road: PlanRoad = { id: newId('road'), name: `${type.label} ${roads.value.filter((r) => r.type === type.key).length + 1}`, type: type.key, points }
  roads.value.push(road)
  selectedId.value = road.id
}

const roadPreview = computed(() => {
  const last = roadDraft.value[roadDraft.value.length - 1]
  if (tool.value !== 'road' || !cursor.value) return null
  const next = snapRoadPoint(cursor.value)
  return { last, next, metres: last ? Math.round(Math.hypot(next.x - last.x, next.z - last.z)) : 0 }
})

watch(tool, () => {
  if (roadDraft.value.length >= 2) finishRoad()
  roadDraft.value = []
  paintDraft.value = null
})

// ---- export / import ----
function planJson(): string {
  const spawn = manifest.value?.spawn ?? [0, 0, 0]
  const shape = (b: PlanBlock) => ({ name: b.name, x: b.x, z: b.z, width: b.width, depth: b.depth, rotationDeg: b.rotationDeg, color: b.color, ...(b.note ? { note: b.note } : {}) })
  return JSON.stringify(
    {
      plan: 'CampusCove world plan',
      version: 1,
      axes: 'game metres, x right, z down on the map (-z = up, towards the pond); x/z = block centre; rotationDeg = game rotationY in degrees',
      spawn: { x: spawn[0], z: spawn[2] },
      summary: {
        zones: summary.value.zones.map((z) => ({ type: z.key, zones: z.zones, lots: z.lots, areaM2: z.area })),
        roads: { count: summary.value.roadCount, lengthM: summary.value.roadMetres },
      },
      added: addedBlocks.value.map((b) => ({ ...shape(b), ...(b.zoneType ? { type: b.zoneType, lots: lotsOf(b)?.count ?? null } : {}) })),
      changed: changedBlocks.value.map((b) => ({ id: b.id, from: shape(originals.value[b.id]!), to: shape(b) })),
      roads: roads.value.map((r) => ({ name: r.name, type: r.type, width: roadTypeOf(r.type).width, lengthM: roadLength(r), points: r.points })),
    },
    null,
    2,
  )
}

async function exportPlan(): Promise<void> {
  showImport.value = false
  exportText.value = planJson()
  try {
    await navigator.clipboard.writeText(exportText.value)
    message.value = 'Plan copied to the clipboard.'
  } catch {
    message.value = 'Copy the plan below.'
  }
}

function importPlan(): void {
  try {
    const parsed = JSON.parse(importText.value) as {
      added?: (Partial<PlanBlock> & { type?: ZoneTypeKey })[]
      changed?: { id: string; to: Partial<PlanBlock> }[]
      roads?: { name?: string; type?: RoadTypeKey; points?: RoadPoint[] }[]
    }
    const next = Object.values(originals.value).map((b) => ({ ...b }))
    for (const change of parsed.changed ?? []) {
      const block = next.find((b) => b.id === change.id)
      if (block) Object.assign(block, change.to)
    }
    for (const [i, added] of (parsed.added ?? []).entries()) {
      next.push({
        id: newId(`new${i}`),
        source: 'new',
        kind: 'new',
        name: added.name ?? 'Imported block',
        color: added.color ?? zoneTypeOf(added.type)?.color ?? NEW_COLOR,
        x: added.x ?? 0,
        z: added.z ?? 0,
        width: added.width ?? 10,
        depth: added.depth ?? 10,
        rotationDeg: added.rotationDeg ?? 0,
        note: added.note ?? '',
        ...(zoneTypeOf(added.type) ? { zoneType: added.type } : {}),
      })
    }
    blocks.value = next
    roads.value = (parsed.roads ?? [])
      .filter((r) => (r.points?.length ?? 0) >= 2)
      .map((r, i) => ({ id: newId(`road${i}`), name: r.name ?? `Road ${i + 1}`, type: roadTypeOf(r.type ?? 'street').key, points: r.points!.map((p) => ({ x: p.x, z: p.z })) }))
    selectedId.value = null
    showImport.value = false
    importText.value = ''
    message.value = 'Plan imported.'
  } catch {
    error.value = 'That is not a valid plan JSON.'
  }
}

// ---- undo / redo ----
/** Snapshots of the plan (JSON). A drag is one step; quick bursts (typing, arrow nudges) merge into one. */
const HISTORY_LIMIT = 100
const history = ref<string[]>([])
const historyIndex = ref(-1)
const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < history.value.length - 1)
let restoring = false
let commitTimer: ReturnType<typeof setTimeout> | null = null

const snapshot = (): string => JSON.stringify({ blocks: blocks.value, roads: roads.value })

function commitHistory(): void {
  if (commitTimer) clearTimeout(commitTimer)
  commitTimer = null
  const current = snapshot()
  if (history.value[historyIndex.value] === current) return
  const next = history.value.slice(0, historyIndex.value + 1)
  next.push(current)
  history.value = next.slice(-HISTORY_LIMIT)
  historyIndex.value = history.value.length - 1
}

function restoreHistory(index: number): void {
  const saved = history.value[index]
  if (saved === undefined) return
  restoring = true
  historyIndex.value = index
  const parsed = JSON.parse(saved) as { blocks: PlanBlock[]; roads: PlanRoad[] }
  blocks.value = parsed.blocks
  roads.value = parsed.roads
  roadDraft.value = []
  if (selectedId.value && !selected.value && !selectedRoad.value) selectedId.value = null
}

function undo(): void {
  if (roadDraft.value.length) {
    roadDraft.value = roadDraft.value.slice(0, -1)
    return
  }
  commitHistory()
  if (canUndo.value) restoreHistory(historyIndex.value - 1)
}

function redo(): void {
  commitHistory()
  if (canRedo.value) restoreHistory(historyIndex.value + 1)
}

watch(
  [blocks, roads],
  () => {
    if (loading.value) return
    if (restoring) {
      restoring = false
      return
    }
    if (drag) return
    if (commitTimer) clearTimeout(commitTimer)
    commitTimer = setTimeout(commitHistory, 400)
  },
  { deep: true },
)

// ---- pointer interaction ----
type Drag =
  | { mode: 'pan'; startX: number; startY: number; viewX: number; viewY: number }
  | { mode: 'click'; startX: number; startY: number; viewX: number; viewY: number }
  | { mode: 'move'; id: string; offsetX: number; offsetZ: number }
  | { mode: 'moveRoad'; id: string; startX: number; startZ: number; points: RoadPoint[] }
  | { mode: 'vertex'; id: string; index: number }
  | { mode: 'resize'; id: string }
  | { mode: 'rotate'; id: string; free: boolean }
  | { mode: 'measure' }
  | { mode: 'paint' }

let drag: Drag | null = null

function startPan(event: PointerEvent, mode: 'pan' | 'click' = 'pan'): void {
  drag = { mode, startX: event.clientX, startY: event.clientY, viewX: view.x, viewY: view.y }
}

function onBackgroundDown(event: PointerEvent): void {
  svgRef.value?.setPointerCapture(event.pointerId)
  // Right-click finishes a road being drawn; right / middle drag pans with any tool.
  if (event.button === 2 && tool.value === 'road' && roadDraft.value.length) return finishRoad()
  if (event.button !== 0) return startPan(event)
  const p = toWorld(event)
  if (tool.value === 'measure') {
    measure.value = { x1: snapValue(p.x), z1: snapValue(p.z), x2: snapValue(p.x), z2: snapValue(p.z) }
    drag = { mode: 'measure' }
  } else if (tool.value === 'zone') {
    paintDraft.value = { x0: snapValue(p.x), z0: snapValue(p.z), x1: snapValue(p.x), z1: snapValue(p.z) }
    drag = { mode: 'paint' }
  } else if (tool.value === 'road') {
    // A click adds a point, a drag pans.
    startPan(event, 'click')
  } else {
    selectedId.value = null
    startPan(event)
  }
}

function onBlockDown(event: PointerEvent, block: PlanBlock): void {
  if (tool.value !== 'select' || event.button !== 0) return
  event.stopPropagation()
  selectedId.value = block.id
  const p = toWorld(event)
  drag = { mode: 'move', id: block.id, offsetX: p.x - block.x, offsetZ: p.z - block.z }
  svgRef.value?.setPointerCapture(event.pointerId)
}

function onRoadDown(event: PointerEvent, road: PlanRoad): void {
  if (tool.value !== 'select' || event.button !== 0) return
  event.stopPropagation()
  selectedId.value = road.id
  const p = toWorld(event)
  drag = { mode: 'moveRoad', id: road.id, startX: p.x, startZ: p.z, points: road.points.map((q) => ({ ...q })) }
  svgRef.value?.setPointerCapture(event.pointerId)
}

function onVertexDown(event: PointerEvent, road: PlanRoad, index: number): void {
  if (event.button !== 0) return
  event.stopPropagation()
  drag = { mode: 'vertex', id: road.id, index }
  svgRef.value?.setPointerCapture(event.pointerId)
}

function removeVertex(road: PlanRoad, index: number): void {
  if (road.points.length <= 2) return
  road.points.splice(index, 1)
}

function onHandleDown(event: PointerEvent, mode: 'resize' | 'rotate'): void {
  event.stopPropagation()
  if (!selected.value) return
  drag = mode === 'resize' ? { mode, id: selected.value.id } : { mode, id: selected.value.id, free: event.shiftKey }
  svgRef.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  const p = toWorld(event)
  cursor.value = { x: round2(p.x), z: round2(p.z) }
  if (!drag) return
  if (drag.mode === 'click' && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) {
    drag = { ...drag, mode: 'pan' }
  }
  if (drag.mode === 'click') return
  if (drag.mode === 'pan') {
    view.x = drag.viewX - (event.clientX - drag.startX) * mpp.value
    view.y = drag.viewY - (event.clientY - drag.startY) * mpp.value
    return
  }
  if (drag.mode === 'measure') {
    if (measure.value) {
      measure.value.x2 = snapValue(p.x)
      measure.value.z2 = snapValue(p.z)
    }
    return
  }
  if (drag.mode === 'paint') {
    if (paintDraft.value) {
      paintDraft.value.x1 = snapValue(p.x)
      paintDraft.value.z1 = snapValue(p.z)
    }
    return
  }
  if (drag.mode === 'moveRoad' || drag.mode === 'vertex') {
    const id = drag.id
    const road = roads.value.find((r) => r.id === id)
    if (!road) return
    if (drag.mode === 'moveRoad') {
      const dx = snapValue(p.x - drag.startX)
      const dz = snapValue(p.z - drag.startZ)
      road.points = drag.points.map((q) => ({ x: round2(q.x + dx), z: round2(q.z + dz) }))
    } else {
      road.points[drag.index] = snapRoadPoint(p, { id, index: drag.index })
    }
    return
  }
  const id = drag.id
  const block = blocks.value.find((b) => b.id === id)
  if (!block) return
  if (drag.mode === 'move') {
    block.x = snapValue(p.x - drag.offsetX)
    block.z = snapValue(p.z - drag.offsetZ)
  } else if (drag.mode === 'resize') {
    // Into the block's local frame (SVG angle = -rotationDeg), resizing symmetrically around the centre.
    const a = (-block.rotationDeg * Math.PI) / 180
    const dx = p.x - block.x
    const dz = p.z - block.z
    const lx = dx * Math.cos(a) + dz * Math.sin(a)
    const lz = -dx * Math.sin(a) + dz * Math.cos(a)
    block.width = Math.max(1, snapValue(Math.abs(lx) * 2))
    block.depth = Math.max(1, snapValue(Math.abs(lz) * 2))
  } else {
    const a = Math.atan2(p.x - block.x, -(p.z - block.z))
    let deg = (-a * 180) / Math.PI
    if (!event.shiftKey && !drag.free) deg = Math.round(deg / 15) * 15
    block.rotationDeg = round2(((deg + 540) % 360) - 180)
  }
}

function onPointerUp(event: PointerEvent): void {
  const done = drag
  drag = null
  if (!done) return
  if (done.mode === 'click') return addRoadPoint(toWorld(event))
  if (done.mode === 'paint') {
    const d = paintDraft.value
    paintDraft.value = null
    if (d) paintZone(d.x0, d.z0, d.x1, d.z1)
    return
  }
  if (done.mode !== 'pan' && done.mode !== 'measure') commitHistory()
}

function onPointerCancel(): void {
  drag = null
  paintDraft.value = null
}

function onWheel(event: WheelEvent): void {
  const p = toWorld(event)
  const factor = Math.exp(event.deltaY * 0.0015)
  const w = Math.min(2000, Math.max(10, view.w * factor))
  const k = w / view.w
  view.x = p.x - (p.x - view.x) * k
  view.y = p.z - (p.z - view.y) * k
  view.w = w
  view.h *= k
}

const TOOL_KEYS: Record<string, Tool> = { '1': 'select', '2': 'zone', '3': 'road', '4': 'measure' }

function onKey(event: KeyboardEvent): void {
  if ((event.target as HTMLElement | null)?.closest('input, textarea, select')) return
  const key = event.key.toLowerCase()
  if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
    event.preventDefault()
    if (key === 'y' || event.shiftKey) redo()
    else undo()
    return
  }
  if (event.ctrlKey || event.metaKey) return
  if (TOOL_KEYS[event.key]) {
    tool.value = TOOL_KEYS[event.key]!
  } else if (event.key === 'Escape') {
    if (roadDraft.value.length) {
      roadDraft.value = []
      return
    }
    selectedId.value = null
    measure.value = null
    paintDraft.value = null
  } else if (event.key === 'Enter') {
    finishRoad()
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    deleteSelected()
  } else if (key === 'm') {
    tool.value = tool.value === 'measure' ? 'select' : 'measure'
  } else if (key === 'f') {
    fitView()
  } else if (selected.value && event.key.startsWith('Arrow')) {
    event.preventDefault()
    const step = (snap.value || 1) * (event.shiftKey ? 5 : 1)
    if (event.key === 'ArrowLeft') selected.value.x = round2(selected.value.x - step)
    if (event.key === 'ArrowRight') selected.value.x = round2(selected.value.x + step)
    if (event.key === 'ArrowUp') selected.value.z = round2(selected.value.z - step)
    if (event.key === 'ArrowDown') selected.value.z = round2(selected.value.z + step)
  }
}

const measureInfo = computed(() => {
  const m = measure.value
  if (!m) return null
  const metres = Math.hypot(m.x2 - m.x1, m.z2 - m.z1)
  return { metres: Math.round(metres * 10) / 10, seconds: Math.round(metres / MOVE_SPEED) }
})

const toolHint = computed(() => {
  if (tool.value === 'zone') return `Drag on the map to paint a ${zoneTypeOf(zoneType.value)!.label} zone · right-drag to pan`
  if (tool.value === 'road') {
    return roadDraft.value.length
      ? 'Click to add points · double-click, Enter or right-click to finish · Esc cancels'
      : `Click to start a ${roadTypeOf(roadType.value).label.toLowerCase()} · ends snap onto other roads`
  }
  if (tool.value === 'measure') return 'Drag to measure a distance'
  return 'Drag anything to move it · click to edit · drag empty space to pan'
})

// ---- rendering helpers ----
const zoneBlocks = computed(() => blocks.value.filter((b) => b.source === 'zone'))
const paintedZones = computed(() => addedBlocks.value.filter((b) => b.zoneType))
const topBlocks = computed(() => [...(layers.buildings ? blocks.value.filter((b) => b.source === 'building') : []), ...addedBlocks.value.filter((b) => !b.zoneType)])

function blockTransform(b: PlanBlock): string {
  return `translate(${b.x} ${b.z}) rotate(${-b.rotationDeg})`
}

function ghostOutline(b: PlanBlock): PlanBlock | null {
  const original = originals.value[b.id]
  if (!original || !isChanged(b)) return null
  return original.x !== b.x || original.z !== b.z || original.width !== b.width || original.depth !== b.depth || original.rotationDeg !== b.rotationDeg ? original : null
}

const paintRect = computed(() => {
  const d = paintDraft.value
  if (!d) return null
  return { x: Math.min(d.x0, d.x1), z: Math.min(d.z0, d.z1), w: Math.abs(d.x1 - d.x0), d: Math.abs(d.z1 - d.z0) }
})

const paintLots = computed(() => {
  const r = paintRect.value
  return r ? lotsOf({ width: r.w, depth: r.d, zoneType: zoneType.value } as PlanBlock) : null
})

onMounted(() => {
  if (svgRef.value) {
    resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return
      const prevW = clientSize.w
      clientSize.w = Math.max(1, entry.contentRect.width)
      clientSize.h = Math.max(1, entry.contentRect.height)
      // Keep the same metres-per-pixel when the panel resizes.
      view.h = (view.w / prevW) * clientSize.w * (clientSize.h / clientSize.w)
      view.w = (view.w / prevW) * clientSize.w
    })
    resizeObserver.observe(svgRef.value)
    const rect = svgRef.value.getBoundingClientRect()
    clientSize.w = Math.max(1, rect.width)
    clientSize.h = Math.max(1, rect.height)
  }
  window.addEventListener('keydown', onKey)
  void load()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-[120rem] flex-col gap-3 lg:h-[calc(100dvh-8.5rem)] lg:min-h-[560px]">
    <!-- Toolbar -->
    <div class="cc-panel flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
      <div class="mr-1">
        <h1 class="cc-display m-0 text-xl leading-none text-fog">World planner</h1>
        <p class="m-0 text-[11px] text-mist">Planning only — the game is untouched</p>
      </div>

      <div class="flex items-center gap-1">
        <button
          v-for="([t, label], i) in ([['select', 'Move'], ['zone', 'Zone'], ['road', 'Road'], ['measure', 'Measure']] as const)"
          :key="t"
          type="button"
          class="cc-btn cc-btn-sm"
          :class="tool === t ? 'cc-btn-sun' : 'cc-btn-ghost'"
          :title="`${label} (${i + 1})`"
          @click="tool = t"
        >
          {{ label }}
        </button>
      </div>

      <!-- tool options -->
      <div v-if="tool === 'zone'" class="flex flex-wrap items-center gap-1">
        <button
          v-for="t in ZONE_TYPES"
          :key="t.key"
          type="button"
          class="cc-btn cc-btn-sm"
          :class="zoneType === t.key ? 'cc-btn-pool' : 'cc-btn-ghost'"
          :title="t.hint"
          @click="zoneType = t.key"
        >
          <span class="mr-1 inline-block h-2.5 w-2.5 rounded-sm" :style="{ background: t.color }" />{{ t.label }}
        </button>
      </div>
      <div v-else-if="tool === 'road'" class="flex items-center gap-1">
        <button
          v-for="t in ROAD_TYPES"
          :key="t.key"
          type="button"
          class="cc-btn cc-btn-sm"
          :class="roadType === t.key ? 'cc-btn-pool' : 'cc-btn-ghost'"
          @click="roadType = t.key"
        >
          {{ t.label }} <span class="ml-1 text-[10px] opacity-70">{{ t.width }} m</span>
        </button>
      </div>

      <div class="flex items-center gap-1 text-xs text-mist">
        Snap
        <button
          v-for="s in [0, 1, 5] as const"
          :key="s"
          type="button"
          class="cc-btn cc-btn-sm"
          :class="snap === s ? 'cc-btn-sun' : 'cc-btn-ghost'"
          @click="snap = s"
        >
          {{ s === 0 ? 'off' : `${s} m` }}
        </button>
      </div>

      <div class="flex items-center gap-1">
        <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" title="Undo (Ctrl+Z)" :disabled="!canUndo && !roadDraft.length" @click="undo">↶</button>
        <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" title="Redo (Ctrl+Y / Ctrl+Shift+Z)" :disabled="!canRedo" @click="redo">↷</button>
        <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" title="Fit the whole world (F)" @click="fitView">Fit</button>
      </div>

      <div class="ml-auto flex items-center gap-1">
        <button type="button" class="cc-btn cc-btn-sm cc-btn-sun" @click="exportPlan">Export</button>
        <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" @click="showImport = !showImport; exportText = ''">Import</button>
        <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost text-coral" @click="clearPlan">Clear</button>
      </div>
    </div>

    <div class="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_20rem]">
      <!-- Map -->
      <section class="cc-panel relative h-[70vh] overflow-hidden p-0 lg:h-full">
        <svg
          ref="svgRef"
          class="planner-map block h-full w-full touch-none select-none"
          :class="tool === 'select' ? 'cursor-grab' : 'cursor-crosshair'"
          :viewBox="viewBox"
          preserveAspectRatio="xMidYMid meet"
          @pointerdown="onBackgroundDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerCancel"
          @pointerleave="cursor = null"
          @contextmenu.prevent
          @dblclick="tool === 'road' && finishRoad()"
          @wheel.prevent="onWheel"
        >
          <!-- grid -->
          <g>
            <line
              v-for="(l, i) in gridLines"
              :key="i"
              :x1="l.x1"
              :y1="l.y1"
              :x2="l.x2"
              :y2="l.y2"
              :class="l.major ? 'grid-major' : 'grid-minor'"
              vector-effect="non-scaling-stroke"
            />
            <line :x1="view.x" y1="0" :x2="view.x + view.w" y2="0" class="grid-axis" vector-effect="non-scaling-stroke" />
            <line x1="0" :y1="view.y" x2="0" :y2="view.y + view.h" class="grid-axis" vector-effect="non-scaling-stroke" />
          </g>

          <!-- walk-time rings around spawn -->
          <g v-if="layers.rings && manifest" class="pointer-events-none">
            <template v-for="s in WALK_RINGS" :key="`ring-${s}`">
              <circle :cx="manifest.spawn[0]" :cy="manifest.spawn[2]" :r="s * MOVE_SPEED" class="walk-ring" vector-effect="non-scaling-stroke" />
              <text :x="manifest.spawn[0]" :y="manifest.spawn[2] - s * MOVE_SPEED - 4 * mpp" :font-size="10 * mpp" text-anchor="middle" class="label ring-label">
                {{ s }} s walk
              </text>
            </template>
          </g>

          <!-- world bounds -->
          <rect
            v-if="manifest"
            :x="manifest.bounds.minX"
            :y="manifest.bounds.minZ"
            :width="manifest.bounds.maxX - manifest.bounds.minX"
            :height="manifest.bounds.maxZ - manifest.bounds.minZ"
            class="world-bounds"
            vector-effect="non-scaling-stroke"
          />

          <!-- real zones: the inside lets clicks through (pan), the border is the grab area -->
          <g v-if="layers.zones">
            <g v-for="b in zoneBlocks" :key="b.id" :transform="blockTransform(b)">
              <rect
                :x="-b.width / 2"
                :y="-b.depth / 2"
                :width="b.width"
                :height="b.depth"
                :fill="b.color"
                fill-opacity="0.08"
                :stroke="b.color"
                stroke-dasharray="6 4"
                :stroke-width="selectedId === b.id ? 2.5 : 1.5"
                vector-effect="non-scaling-stroke"
                class="pointer-events-none"
              />
              <rect
                :x="-b.width / 2"
                :y="-b.depth / 2"
                :width="b.width"
                :height="b.depth"
                fill="none"
                stroke="transparent"
                stroke-width="12"
                vector-effect="non-scaling-stroke"
                pointer-events="stroke"
                :class="tool === 'select' ? 'cursor-move' : ''"
                @pointerdown="onBlockDown($event, b)"
              />
            </g>
          </g>

          <!-- real collision outline -->
          <g v-if="layers.ghost" class="pointer-events-none">
            <rect
              v-for="(g, i) in ghosts"
              :key="i"
              :x="-g.hx"
              :y="-g.hz"
              :width="g.hx * 2"
              :height="g.hz * 2"
              :transform="`translate(${g.x} ${g.z}) rotate(${-g.rotationDeg})`"
              :class="g.water ? 'ghost-water' : 'ghost'"
            />
          </g>

          <!-- painted zones (under the roads), with their lot grid -->
          <g v-if="layers.zones">
            <g
              v-for="b in paintedZones"
              :key="b.id"
              :transform="blockTransform(b)"
              :class="tool === 'select' ? 'cursor-move' : ''"
              @pointerdown="onBlockDown($event, b)"
            >
              <rect
                :x="-b.width / 2"
                :y="-b.depth / 2"
                :width="b.width"
                :height="b.depth"
                :fill="b.color"
                fill-opacity="0.22"
                :stroke="selectedId === b.id ? '#ffffff' : b.color"
                :stroke-width="selectedId === b.id ? 2.5 : 1.5"
                vector-effect="non-scaling-stroke"
              />
              <g v-if="lotGrid(b)" class="pointer-events-none" :stroke="b.color" stroke-opacity="0.55">
                <line v-for="x in lotGrid(b)!.xs" :key="`x${x}`" :x1="x" :y1="-b.depth / 2" :x2="x" :y2="b.depth / 2" vector-effect="non-scaling-stroke" />
                <line v-for="z in lotGrid(b)!.zs" :key="`z${z}`" :x1="-b.width / 2" :y1="z" :x2="b.width / 2" :y2="z" vector-effect="non-scaling-stroke" />
              </g>
            </g>
          </g>

          <!-- roads -->
          <g v-if="layers.roads">
            <g v-for="r in roads" :key="r.id" :class="tool === 'select' ? 'cursor-move' : ''" @pointerdown="onRoadDown($event, r)">
              <polyline
                v-if="selectedId === r.id"
                :points="pointsAttr(r.points)"
                fill="none"
                stroke="#ffffff"
                :stroke-width="roadTypeOf(r.type).width + 6 * mpp"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <polyline
                :points="pointsAttr(r.points)"
                fill="none"
                :stroke="roadTypeOf(r.type).color"
                :stroke-width="roadTypeOf(r.type).width"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <polyline
                v-if="r.type !== 'path'"
                :points="pointsAttr(r.points)"
                fill="none"
                class="road-centre pointer-events-none"
                vector-effect="non-scaling-stroke"
              />
            </g>
          </g>

          <!-- where moved blocks used to be -->
          <g class="pointer-events-none">
            <template v-for="b in blocks" :key="`was-${b.id}`">
              <rect
                v-if="ghostOutline(b)"
                :x="-ghostOutline(b)!.width / 2"
                :y="-ghostOutline(b)!.depth / 2"
                :width="ghostOutline(b)!.width"
                :height="ghostOutline(b)!.depth"
                :transform="blockTransform(ghostOutline(b)!)"
                class="was-here"
                vector-effect="non-scaling-stroke"
              />
            </template>
          </g>

          <!-- buildings + custom blocks -->
          <g>
            <g
              v-for="b in topBlocks"
              :key="b.id"
              :transform="blockTransform(b)"
              :class="tool === 'select' ? 'cursor-move' : ''"
              @pointerdown="onBlockDown($event, b)"
            >
              <rect
                :x="-b.width / 2"
                :y="-b.depth / 2"
                :width="b.width"
                :height="b.depth"
                :fill="b.color"
                :fill-opacity="b.source === 'new' ? 0.45 : 0.3"
                :stroke="selectedId === b.id ? '#ffffff' : b.color"
                :stroke-width="selectedId === b.id ? 2.5 : 1.5"
                rx="0.4"
                vector-effect="non-scaling-stroke"
              />
              <!-- front edge (local +Z, the door side in the game) so rotation is readable -->
              <line
                :x1="-b.width / 2"
                :y1="b.depth / 2"
                :x2="b.width / 2"
                :y2="b.depth / 2"
                :stroke="b.color"
                stroke-width="4"
                vector-effect="non-scaling-stroke"
                class="pointer-events-none"
              />
            </g>
          </g>

          <!-- markers -->
          <g v-if="layers.markers" class="pointer-events-none">
            <template v-for="(m, i) in markers" :key="`m-${i}`">
              <g v-if="m.kind === 'spawn'" :transform="`translate(${m.x} ${m.z})`">
                <circle :r="6 * mpp" class="marker-spawn" />
                <text :y="-10 * mpp" :font-size="11 * mpp" text-anchor="middle" class="label">Spawn</text>
              </g>
              <rect v-else-if="m.kind === 'gate'" :x="m.x - 6" :y="m.z - 0.6" width="12" height="1.2" class="marker-gate" />
              <circle v-else-if="m.kind === 'fishing'" :cx="m.x" :cy="m.z" :r="3 * mpp" class="marker-fishing" />
              <circle v-else-if="m.kind === 'door'" :cx="m.x" :cy="m.z" :r="2.5 * mpp" class="marker-door" />
              <rect v-else-if="m.kind === 'kiosk'" :x="m.x - 1.5" :y="m.z - 1.5" width="3" height="3" class="marker-gate" />
            </template>
          </g>

          <!-- labels (real zone names double as their drag handle) -->
          <g v-if="layers.labels">
            <template v-for="b in blocks" :key="`l-${b.id}`">
              <text
                v-if="b.source === 'zone' && layers.zones"
                :x="b.x - b.width / 2 + 4 * mpp"
                :y="b.z - b.depth / 2 + 14 * mpp"
                :font-size="13 * mpp"
                class="label label-zone"
                :class="tool === 'select' ? 'cursor-move' : 'pointer-events-none'"
                :fill="b.color"
                @pointerdown="onBlockDown($event, b)"
              >
                {{ b.name }}{{ isChanged(b) ? ' •' : '' }}
              </text>
              <text
                v-else-if="b.zoneType && layers.zones"
                :x="b.x"
                :y="b.z"
                :font-size="12 * mpp"
                text-anchor="middle"
                class="label pointer-events-none"
              >
                {{ b.name }}
                <tspan v-if="lotsOf(b)" :x="b.x" :dy="13 * mpp" :font-size="10 * mpp" class="label-sub">{{ lotsOf(b)!.count }} lots</tspan>
              </text>
              <text
                v-else-if="(b.source === 'building' && layers.buildings) || (b.source === 'new' && !b.zoneType)"
                :x="b.x"
                :y="b.z + 4 * mpp"
                :font-size="11 * mpp"
                text-anchor="middle"
                class="label pointer-events-none"
              >
                {{ b.name }}{{ isChanged(b) && b.source !== 'new' ? ' •' : '' }}
              </text>
            </template>
          </g>

          <!-- block handles -->
          <g v-if="selected && tool === 'select'" :transform="blockTransform(selected)">
            <line
              x1="0"
              :y1="-selected.depth / 2"
              x2="0"
              :y2="-selected.depth / 2 - 22 * mpp"
              class="handle-line"
              vector-effect="non-scaling-stroke"
            />
            <circle
              cx="0"
              :cy="-selected.depth / 2 - 22 * mpp"
              :r="6 * mpp"
              class="handle cursor-alias"
              @pointerdown="onHandleDown($event, 'rotate')"
            />
            <rect
              :x="selected.width / 2 - 5 * mpp"
              :y="selected.depth / 2 - 5 * mpp"
              :width="10 * mpp"
              :height="10 * mpp"
              class="handle cursor-nwse-resize"
              @pointerdown="onHandleDown($event, 'resize')"
            />
          </g>

          <!-- road point handles: drag to reshape, double-click to remove -->
          <g v-if="selectedRoad && tool === 'select'">
            <circle
              v-for="(p, i) in selectedRoad.points"
              :key="`v-${i}`"
              :cx="p.x"
              :cy="p.z"
              :r="5 * mpp"
              class="handle cursor-move"
              @pointerdown="onVertexDown($event, selectedRoad, i)"
              @dblclick.stop="removeVertex(selectedRoad, i)"
            />
          </g>

          <!-- zone being painted -->
          <g v-if="paintRect" class="pointer-events-none">
            <rect
              :x="paintRect.x"
              :y="paintRect.z"
              :width="paintRect.w"
              :height="paintRect.d"
              :fill="zoneTypeOf(zoneType)!.color"
              fill-opacity="0.25"
              :stroke="zoneTypeOf(zoneType)!.color"
              stroke-width="2"
              stroke-dasharray="6 4"
              vector-effect="non-scaling-stroke"
            />
            <text :x="paintRect.x + paintRect.w / 2" :y="paintRect.z + paintRect.d / 2" :font-size="12 * mpp" text-anchor="middle" class="label">
              {{ Math.round(paintRect.w) }} × {{ Math.round(paintRect.d) }} m{{ paintLots ? ` · ${paintLots.count} lots` : '' }}
            </text>
          </g>

          <!-- road being drawn -->
          <g v-if="tool === 'road'" class="pointer-events-none">
            <polyline
              v-if="roadDraft.length"
              :points="pointsAttr(roadPreview ? [...roadDraft, roadPreview.next] : roadDraft)"
              fill="none"
              :stroke="roadTypeOf(roadType).color"
              :stroke-width="roadTypeOf(roadType).width"
              stroke-opacity="0.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <circle v-for="(p, i) in roadDraft" :key="`d-${i}`" :cx="p.x" :cy="p.z" :r="4 * mpp" class="handle" />
            <template v-if="roadPreview">
              <circle :cx="roadPreview.next.x" :cy="roadPreview.next.z" :r="4 * mpp" class="road-cursor" />
              <text
                v-if="roadPreview.last"
                :x="roadPreview.next.x + 8 * mpp"
                :y="roadPreview.next.z - 8 * mpp"
                :font-size="12 * mpp"
                class="label"
              >
                {{ roadPreview.metres }} m · total {{ roadLength({ points: [...roadDraft, roadPreview.next] }) }} m
              </text>
            </template>
          </g>

          <!-- measure -->
          <g v-if="measure && measureInfo" class="pointer-events-none">
            <line :x1="measure.x1" :y1="measure.z1" :x2="measure.x2" :y2="measure.z2" class="measure-line" vector-effect="non-scaling-stroke" />
            <circle :cx="measure.x1" :cy="measure.z1" :r="3 * mpp" class="measure-dot" />
            <circle :cx="measure.x2" :cy="measure.z2" :r="3 * mpp" class="measure-dot" />
            <text :x="measure.x2 + 8 * mpp" :y="measure.z2 - 8 * mpp" :font-size="13 * mpp" class="label">
              {{ measureInfo.metres }} m · ~{{ measureInfo.seconds }} s walk
            </text>
          </g>
        </svg>

        <div v-if="loading" class="absolute inset-0 grid place-items-center text-sm font-bold text-mist">Loading the world…</div>

        <!-- what the current tool does -->
        <div class="pointer-events-none absolute left-3 top-3 max-w-[70%] rounded-xl bg-ink-950/80 px-3 py-1.5 text-xs font-bold text-fog">
          {{ toolHint }}
        </div>

        <!-- toast -->
        <button
          v-if="message || error"
          type="button"
          class="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-xl px-3 py-1.5 text-sm font-bold shadow-lg"
          :class="error ? 'bg-coral text-ink-950' : 'bg-mint text-ink-950'"
          @click="message = null; error = null"
        >
          {{ error ?? message }}
        </button>

        <!-- layers -->
        <div class="absolute right-3 top-3 flex flex-col items-end gap-1">
          <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost bg-ink-950/80" @click="showLayers = !showLayers">
            Layers {{ showLayers ? '▴' : '▾' }}
          </button>
          <div v-if="showLayers" class="flex flex-col gap-1 rounded-xl bg-ink-950/90 px-3 py-2 text-sm text-fog">
            <label><input v-model="layers.zones" type="checkbox" /> Zones</label>
            <label><input v-model="layers.roads" type="checkbox" /> Roads</label>
            <label><input v-model="layers.buildings" type="checkbox" /> Buildings</label>
            <label><input v-model="layers.ghost" type="checkbox" /> Real outline</label>
            <label><input v-model="layers.markers" type="checkbox" /> Spawn / doors</label>
            <label><input v-model="layers.rings" type="checkbox" /> Walk-time rings</label>
            <label><input v-model="layers.labels" type="checkbox" /> Labels</label>
          </div>
        </div>

        <!-- HUD -->
        <div class="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1 rounded-xl bg-ink-950/70 px-3 py-2 font-mono text-xs text-fog">
          <div class="flex items-center gap-2">
            <span class="inline-block h-1 bg-fog" :style="{ width: `${scaleBar.px}px` }" />
            <span>{{ scaleBar.metres }} m</span>
          </div>
          <span v-if="cursor">x {{ cursor.x }} · z {{ cursor.z }}</span>
          <span class="text-mist">↑ −Z (pond) · → +X</span>
        </div>
      </section>

      <!-- Side panel -->
      <aside class="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <!-- export / import -->
        <section v-if="exportText || showImport" class="cc-panel p-3">
          <div class="mb-2 flex items-center justify-between">
            <p class="m-0 font-display text-base text-fog">{{ exportText ? 'Exported plan' : 'Import a plan' }}</p>
            <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" @click="exportText = ''; showImport = false">Close</button>
          </div>
          <template v-if="exportText">
            <p class="m-0 mb-2 text-xs text-mist">Copied — paste it to Claude.</p>
            <textarea :value="exportText" readonly rows="10" class="cc-input cc-input-sm w-full font-mono text-xs" @focus="($event.target as HTMLTextAreaElement).select()" />
          </template>
          <template v-else>
            <textarea v-model="importText" rows="8" class="cc-input cc-input-sm w-full font-mono text-xs" placeholder="Paste an exported plan" />
            <button type="button" class="cc-btn cc-btn-sm cc-btn-pool mt-2 w-full" @click="importPlan">Load plan</button>
          </template>
        </section>

        <!-- selected block / zone -->
        <section v-if="selected" class="cc-panel p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <input v-model="selected.name" class="cc-input cc-input-sm min-w-0 flex-1 font-bold" aria-label="Name" />
            <input v-model="selected.color" type="color" class="h-8 w-9 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent" aria-label="Colour" />
          </div>
          <div v-if="selected.source === 'new'" class="mb-2 flex flex-wrap gap-1">
            <button
              v-for="t in ZONE_TYPES"
              :key="t.key"
              type="button"
              class="rounded-lg border-2 px-2 py-0.5 text-xs font-bold transition"
              :class="selected.zoneType === t.key ? 'border-fog text-fog' : 'border-ink-600 text-mist hover:border-ink-500'"
              :title="t.hint"
              @click="setZoneType(selected, t.key)"
            >
              <span class="mr-1 inline-block h-2 w-2 rounded-sm" :style="{ background: t.color }" />{{ t.label }}
            </button>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <label class="text-[11px] text-mist">X (m)
              <input v-model.number="selected.x" type="number" step="0.5" class="cc-input cc-input-sm w-full" />
            </label>
            <label class="text-[11px] text-mist">Z (m)
              <input v-model.number="selected.z" type="number" step="0.5" class="cc-input cc-input-sm w-full" />
            </label>
            <label class="text-[11px] text-mist">Angle (°)
              <input v-model.number="selected.rotationDeg" type="number" step="15" class="cc-input cc-input-sm w-full" />
            </label>
            <label class="text-[11px] text-mist">Width
              <input v-model.number="selected.width" type="number" min="1" step="0.5" class="cc-input cc-input-sm w-full" />
            </label>
            <label class="text-[11px] text-mist">Depth
              <input v-model.number="selected.depth" type="number" min="1" step="0.5" class="cc-input cc-input-sm w-full" />
            </label>
            <div class="text-[11px] text-mist">{{ lotsOf(selected) ? 'Lots' : 'Area' }}
              <p class="m-0 pt-2 text-sm text-fog">
                {{ lotsOf(selected) ? `${lotsOf(selected)!.count} (${lotsOf(selected)!.cols}×${lotsOf(selected)!.rows})` : `${Math.round(selected.width * selected.depth)} m²` }}
              </p>
            </div>
          </div>
          <textarea v-model="selected.note" rows="2" class="cc-input cc-input-sm mt-2 w-full" placeholder="Note for Claude — e.g. 2 floors, food court" />
          <p class="m-0 mt-2 text-sm text-fog">
            {{ distanceFromSpawn(selected).metres }} m from spawn · ~{{ distanceFromSpawn(selected).seconds }} s walk
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button type="button" class="cc-btn cc-btn-sm cc-btn-pool" @click="duplicateSelected">Duplicate</button>
            <button v-if="selected.source !== 'new' && isChanged(selected)" type="button" class="cc-btn cc-btn-sm cc-btn-ghost" @click="resetSelected">
              Reset to real
            </button>
            <button v-if="selected.source === 'new'" type="button" class="cc-btn cc-btn-sm cc-btn-coral" @click="deleteSelected">Delete</button>
          </div>
        </section>

        <!-- selected road -->
        <section v-else-if="selectedRoad" class="cc-panel p-3">
          <input v-model="selectedRoad.name" class="cc-input cc-input-sm mb-2 w-full font-bold" aria-label="Road name" />
          <div class="mb-2 flex gap-1">
            <button
              v-for="t in ROAD_TYPES"
              :key="t.key"
              type="button"
              class="rounded-lg border-2 px-2 py-0.5 text-xs font-bold transition"
              :class="selectedRoad.type === t.key ? 'border-fog text-fog' : 'border-ink-600 text-mist hover:border-ink-500'"
              @click="selectedRoad.type = t.key"
            >
              {{ t.label }} · {{ t.width }} m
            </button>
          </div>
          <p class="m-0 text-sm text-fog">
            {{ roadLength(selectedRoad) }} m long · ~{{ Math.round(roadLength(selectedRoad) / MOVE_SPEED) }} s to walk end to end
          </p>
          <p class="m-0 mt-1 text-xs text-mist">Drag the white dots to reshape · double-click a dot to remove it · drag the road to move it.</p>
          <button type="button" class="cc-btn cc-btn-sm cc-btn-coral mt-2" @click="deleteSelected">Delete road</button>
        </section>

        <!-- nothing selected: plan summary, custom block, help -->
        <template v-else>
          <section class="cc-panel p-3">
            <p class="m-0 mb-2 font-display text-base text-fog">Plan</p>
            <p v-if="!summary.zones.length && !summary.roadCount" class="m-0 text-xs text-mist">
              Nothing planned yet. Pick <b>Zone</b> (2) and drag on the map, or <b>Road</b> (3) and click.
            </p>
            <ul v-else class="m-0 list-none space-y-1 p-0 text-sm text-fog">
              <li v-for="z in summary.zones" :key="z.key" class="flex items-center justify-between gap-2">
                <span><span class="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm" :style="{ background: z.color }" />{{ z.label }} × {{ z.zones }}</span>
                <span class="text-mist">{{ z.lots !== null ? `${z.lots} lots` : `${z.area} m²` }}</span>
              </li>
              <li v-if="summary.roadCount" class="flex items-center justify-between gap-2">
                <span><span class="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-mist" />Roads × {{ summary.roadCount }}</span>
                <span class="text-mist">{{ summary.roadMetres }} m</span>
              </li>
            </ul>
            <p v-if="changedBlocks.length" class="m-0 mt-2 text-xs text-mist">{{ changedBlocks.length }} real block(s) moved</p>
          </section>

          <section class="cc-panel p-3">
            <p class="m-0 mb-2 font-display text-base text-fog">Custom block</p>
            <div class="grid grid-cols-[1fr_auto] gap-2">
              <input v-model="addForm.name" class="cc-input cc-input-sm" placeholder="Name" />
              <input v-model="addForm.color" type="color" class="h-8 w-9 cursor-pointer rounded-lg border-0 bg-transparent" aria-label="Colour" />
            </div>
            <div class="mt-2 grid grid-cols-2 gap-2">
              <label class="text-[11px] text-mist">Width (m)
                <input v-model.number="addForm.width" type="number" min="1" class="cc-input cc-input-sm w-full" />
              </label>
              <label class="text-[11px] text-mist">Depth (m)
                <input v-model.number="addForm.depth" type="number" min="1" class="cc-input cc-input-sm w-full" />
              </label>
            </div>
            <button type="button" class="cc-btn cc-btn-sm cc-btn-mint mt-2 w-full" @click="addBlock()">Add at centre of view</button>
          </section>

          <section class="cc-panel p-3">
            <ul class="m-0 space-y-1 pl-4 text-xs text-mist">
              <li><b>1 Move</b>: drag anything; zones by their name or border.</li>
              <li><b>2 Zone</b>: pick a type, drag a rectangle. Lots are sized from real buildings.</li>
              <li><b>3 Road</b>: click points, double-click / Enter to finish. Ends snap onto roads.</li>
              <li><b>4 Measure</b>: drag for metres and walk time (8 m/s).</li>
              <li>Wheel = zoom · right-drag = pan · F = fit · Esc = cancel · Del = delete.</li>
              <li>Ctrl+Z / Ctrl+Y = undo / redo.</li>
            </ul>
          </section>
        </template>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.planner-map {
  background: rgb(var(--cc-ink-950));
}
.grid-minor {
  stroke: rgb(var(--cc-ink-700) / 0.6);
  stroke-width: 1;
}
.grid-major {
  stroke: rgb(var(--cc-ink-600));
  stroke-width: 1;
}
.grid-axis {
  stroke: rgb(var(--cc-mist) / 0.35);
  stroke-width: 1;
}
.world-bounds {
  fill: none;
  stroke: rgb(var(--cc-mist) / 0.5);
  stroke-width: 1;
  stroke-dasharray: 2 4;
}
.walk-ring {
  fill: none;
  stroke: rgb(var(--cc-sun) / 0.35);
  stroke-width: 1;
  stroke-dasharray: 2 6;
}
.ring-label {
  fill: rgb(var(--cc-sun) / 0.8);
}
.ghost {
  fill: rgb(var(--cc-fog) / 0.16);
}
.ghost-water {
  fill: rgb(var(--cc-pool) / 0.22);
}
.was-here {
  fill: none;
  stroke: rgb(var(--cc-fog) / 0.6);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}
.road-centre {
  stroke: rgb(255 255 255 / 0.55);
  stroke-width: 1;
  stroke-dasharray: 5 5;
}
.road-cursor {
  fill: none;
  stroke: #ffffff;
  stroke-width: 0.6;
}
.label {
  fill: rgb(var(--cc-fog));
  font-family: Nunito, system-ui, sans-serif;
  font-weight: 800;
  paint-order: stroke;
  stroke: rgb(var(--cc-ink-950) / 0.85);
  stroke-width: 0.35em;
  stroke-linejoin: round;
}
.label-zone {
  text-transform: capitalize;
}
.label-sub {
  fill: rgb(var(--cc-fog) / 0.75);
  font-weight: 700;
}
.marker-spawn {
  fill: rgb(var(--cc-sun));
  stroke: rgb(var(--cc-ink-950));
}
.marker-gate {
  fill: rgb(var(--cc-sun) / 0.8);
}
.marker-fishing {
  fill: rgb(var(--cc-pool));
}
.marker-door {
  fill: rgb(var(--cc-mint));
}
.handle {
  fill: #ffffff;
  stroke: rgb(var(--cc-ink-950));
}
.handle-line {
  stroke: #ffffff;
  stroke-width: 1.5;
}
.measure-line {
  stroke: rgb(var(--cc-sun));
  stroke-width: 2;
  stroke-dasharray: 6 4;
}
.measure-dot {
  fill: rgb(var(--cc-sun));
}
</style>
