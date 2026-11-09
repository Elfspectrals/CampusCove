<script setup lang="ts">
import { computed, markRaw, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { DEFAULT_SLOT_COLORS } from '../../api/characterCosmetics'
import type { WearSlot } from '../../avatar/modularCharacterLogic'
import { fetchItemShopCatalog, type ShopItem } from '../../api/itemShop'
import MallEditorContentBrowser, { type ContentEntry } from '../../components/admin/mallEditor/MallEditorContentBrowser.vue'
import MallEditorDetails from '../../components/admin/mallEditor/MallEditorDetails.vue'
import MallEditorOutliner from '../../components/admin/mallEditor/MallEditorOutliner.vue'
import MallMapModal, { type MallPlaza, type MallStoreMark } from '../../components/admin/mallEditor/MallMapModal.vue'
import { decorModelUrl } from '../../game/assets/catalog'
import UiIcon from '../../components/ui/UiIcon.vue'
import type { UiIconName } from '../../components/ui/icons'
import { MallEditorScene, type GizmoMode, type PropTransform } from '../../game/mallEditor/MallEditorScene'
import { MALL_TEMPLATE_ASSIGNMENTS_URL, mallTemplateUrl } from '../../game/mallTemplates/mallTemplateFiles'
import { decorParts, type MaterialSlot } from '../../game/mallTemplates/templateProps'
import { TEXTURES_URL } from '../../game/mallTemplates/templateSurfaces'
import {
  cellPresets,
  itemModelUrl,
  parseCategories,
  parseMallTemplate,
  parseTemplateAssignments,
  parseTextureMeta,
  MAX_LIGHTS,
  presetOf,
  usableArea,
  samePreset,
  TEMPLATE_KEY,
  type CellPreset,
  type MallCell,
  type MallTemplate,
  type TemplateAssignments,
  type TemplateProp,
  type TexturePart,
  type Vec3,
} from '../../game/mallTemplates/mallTemplate.ts'

const MALL_LAYOUT_URL = '/assets/store/mall/mall.layout.json'
const EDITOR_API = '/__mall-editor'
const CAN_WRITE = import.meta.env.DEV
const DEFAULT_NPC_OUTFIT = [
  { slot: 'hair', key: 'ponytail' },
  { slot: 'top', key: 'tee' },
  { slot: 'bottom', key: 'joggers' },
  { slot: 'shoes', key: 'sneakers' },
] as const

const HISTORY_LIMIT = 100
const GIZMO_MODES: Array<{ mode: GizmoMode; icon: UiIconName; label: string; key: string }> = [
  { mode: 'select', icon: 'hand', label: 'Select', key: 'KeyQ' },
  { mode: 'translate', icon: 'walk', label: 'Move', key: 'KeyW' },
  { mode: 'rotate', icon: 'rotate-right', label: 'Rotate', key: 'KeyE' },
  { mode: 'scale', icon: 'box', label: 'Scale', key: 'KeyR' },
]
const TRANSLATION_SNAPS = [0, 0.05, 0.1, 0.25, 0.5, 1]
const ROTATION_SNAPS = [0, 5, 10, 15, 45, 90]
const SCALE_SNAPS = [0, 0.1, 0.25, 0.5]

interface EditorAssets {
  decor: string[]
  wear: Record<WearSlot, string[]>
}

interface PlaceableEntry extends ContentEntry {
  modelUrl: string | null
  create: (id: string, position: Vec3) => TemplateProp
}

const viewportRef = ref<HTMLElement | null>(null)
const editor = shallowRef<MallEditorScene | null>(null)
const cells = ref<MallCell[]>([])
const loadError = ref<string | null>(null)
const presetIndex = ref(0)
const entries = ref<PlaceableEntry[]>([])
const contentNotice = ref<string | null>(null)
const editorAssets = ref<EditorAssets | null>(null)
const decorKeyList = ref<string[]>([])
const saleCodes = ref<Record<string, string>>({})
const wearSaleCodes = ref<Record<string, string>>({})
const textureOptions = ref<Record<string, string>>({})
const materialSlotsById = ref<Record<string, MaterialSlot[]>>({})
const texturePartsByKey = ref<Record<string, TexturePart[]>>({})
const ownParts = ref<Record<string, TexturePart[]>>({})

const armedId = ref<string | null>(null)
const template = ref<MallTemplate>({ version: 1, key: '', name: '', preset: { width: 0, depth: 0 }, props: [] })
const selectedId = ref<string | null>(null)
const gizmoMode = ref<GizmoMode>('translate')
const translationSnap = ref(0.1)
const rotationSnap = ref(10)
const scaleSnap = ref(0.5)
const sceneError = ref<string | null>(null)
const hiddenIds = ref<string[]>([])
const templateList = ref<Array<{ key: string; name: string; preset: CellPreset }>>([])
const assignments = ref<TemplateAssignments>({ version: 1, cells: {} })
const savedSnapshot = ref(JSON.stringify(template.value))
const status = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const mapOpen = ref(false)
const PANELS_KEY = 'cc.admin.mallEditor.panels.v1'
const PANEL_LIMITS = { aside: [240, 640], outliner: [120, 600], browser: [140, 520] } as const
type PanelKey = keyof typeof PANEL_LIMITS
const panels = ref<Record<PanelKey, number>>(readPanels())

function readPanels(): Record<PanelKey, number> {
  const defaults = { aside: 320, outliner: 256, browser: 224 }
  try {
    const stored = JSON.parse(localStorage.getItem(PANELS_KEY) ?? '{}') as Partial<Record<PanelKey, number>>
    return Object.fromEntries(
      (Object.keys(defaults) as PanelKey[]).map((key) => {
        const value = stored[key]
        const [min, max] = PANEL_LIMITS[key]
        return [key, typeof value === 'number' && value >= min && value <= max ? value : defaults[key]]
      }),
    ) as Record<PanelKey, number>
  } catch {
    return defaults
  }
}

function startResize(key: PanelKey, event: PointerEvent): void {
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture(event.pointerId)
  const start = { x: event.clientX, y: event.clientY, size: panels.value[key] }
  const [min, max] = PANEL_LIMITS[key]
  const move = (e: PointerEvent) => {
    const delta = key === 'aside' ? start.x - e.clientX : key === 'outliner' ? e.clientY - start.y : start.y - e.clientY
    panels.value = { ...panels.value, [key]: Math.round(Math.min(max, Math.max(min, start.size + delta))) }
  }
  const stop = () => {
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', stop)
    handle.removeEventListener('lostpointercapture', stop)
    try {
      localStorage.setItem(PANELS_KEY, JSON.stringify(panels.value))
    } catch (error) {
      console.warn('[mall editor] panel sizes not saved', error)
    }
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', stop)
  handle.addEventListener('lostpointercapture', stop)
}
const targetCell = ref<MallCell | null>(null)
const plazas = ref<MallPlaza[]>([])
const mallStores = ref<MallStoreMark[]>([])

async function assignFromMap(cell: MallCell): Promise<void> {
  await setCellTemplate(cell.id, template.value.key)
  if (assignments.value.cells[cell.id] === template.value.key) targetCell.value = cell
}

async function clearFromMap(cell: MallCell): Promise<void> {
  await setCellTemplate(cell.id, null)
  if (targetCell.value?.id === cell.id && assignments.value.cells[cell.id] === undefined) targetCell.value = null
}

function useCell(cell: MallCell): void {
  const index = presets.value.findIndex((p) => samePreset(p, cell))
  if (index < 0) return
  const switching = index !== presetIndex.value
  if (switching && template.value.props.length && !window.confirm(`Props are laid out for ${preset.value?.width} × ${preset.value?.depth} m. Switch to ${cell.width} × ${cell.depth} m anyway?`)) return
  presetIndex.value = index
  targetCell.value = cell
  mapOpen.value = false
}
const walking = ref(false)
const openKey = ref('')
const loadedKey = ref<string | null>(null)
const history = ref<string[]>([])
const historyIndex = ref(-1)
let restoring = false
let commitTimer: ReturnType<typeof setTimeout> | null = null

const presets = computed(() => cellPresets(cells.value))
const preset = computed(() => presets.value[presetIndex.value] ?? null)

watch([editor, preset], ([scene, current]) => {
  if (!scene || !current) return
  template.value.preset = { width: current.width, depth: current.depth }
  scene.setPreset(current)
})

watch([editor, () => template.value.props], ([scene, props]) => scene?.syncProps(props), { deep: true })
watch([editor, selectedId], ([scene, id]) => scene?.select(id))
watch(
  [editor, () => JSON.stringify([template.value.preset, template.value.surfaces ?? {}])],
  ([scene]) => scene?.setSurfaces(template.value).catch((error: unknown) => (sceneError.value = errorText(error))),
)
watch([editor, hiddenIds], ([scene, ids]) => scene?.setHidden(ids))

const selectedProp = computed(() => template.value.props.find((p) => p.id === selectedId.value) ?? null)

watch(
  () => (selectedProp.value?.kind === 'decor' ? selectedProp.value.key : null),
  async (key) => {
    ownParts.value = {}
    if (!key) return
    try {
      const parts = await decorParts(key)
      if (selectedProp.value?.kind === 'decor' && selectedProp.value.key === key) ownParts.value = Object.fromEntries(Object.entries(parts).map(([name, m]) => [name, m.parts]))
    } catch (error) {
      sceneError.value = errorText(error)
    }
  },
)
const vendorTaken = computed(() => template.value.props.some((p) => p.kind === 'npc' && p.vendor && p.id !== selectedId.value))
const emptyWear = { hair: [], head_accessory: [], top: [], bottom: [], shoes: [] } as Record<WearSlot, string[]>

function replaceProp(next: TemplateProp): void {
  const index = template.value.props.findIndex((p) => p.id === next.id)
  if (index >= 0) template.value.props.splice(index, 1, next)
}

function toggleHidden(id: string): void {
  hiddenIds.value = hiddenIds.value.includes(id) ? hiddenIds.value.filter((h) => h !== id) : [...hiddenIds.value, id]
}
watch([editor, gizmoMode], ([scene, mode]) => scene?.setGizmoMode(mode))
watch([editor, translationSnap, rotationSnap, scaleSnap], ([scene, t, r, s]) => scene?.setSnaps(t, r, s))

const snapshot = (): string => JSON.stringify({ props: template.value.props, surfaces: template.value.surfaces ?? {} })
const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < history.value.length - 1)

function commitHistory(): void {
  if (commitTimer) clearTimeout(commitTimer)
  commitTimer = null
  const current = snapshot()
  if (history.value[historyIndex.value] === current) return
  history.value = [...history.value.slice(0, historyIndex.value + 1), current].slice(-HISTORY_LIMIT)
  historyIndex.value = history.value.length - 1
}

function restoreHistory(index: number): void {
  const saved = history.value[index]
  if (saved === undefined) return
  restoring = true
  historyIndex.value = index
  const restored = JSON.parse(saved) as { props: TemplateProp[]; surfaces: NonNullable<MallTemplate['surfaces']> }
  template.value.props = restored.props
  setSurfaces(restored.surfaces)
  if (selectedId.value && !template.value.props.some((p) => p.id === selectedId.value)) selectedId.value = null
}

function undo(): void {
  commitHistory()
  if (canUndo.value) restoreHistory(historyIndex.value - 1)
}

function redo(): void {
  commitHistory()
  if (canRedo.value) restoreHistory(historyIndex.value + 1)
}

watch(
  () => [template.value.props, template.value.surfaces],
  () => {
    if (restoring) {
      restoring = false
      return
    }
    if (commitTimer) clearTimeout(commitTimer)
    commitTimer = setTimeout(commitHistory, 400)
  },
  { deep: true },
)

const dirty = computed(() => JSON.stringify(template.value) !== savedSnapshot.value)
const keyValid = computed(() => TEMPLATE_KEY.test(template.value.key))

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null
  if (body === null) throw new Error(`${url}: HTTP ${response.status}, not JSON`)
  if (!response.ok) throw new Error(`${url}: ${body.error ?? `HTTP ${response.status}`}`)
  return body
}

async function loadLists(): Promise<void> {
  assignments.value = parseTemplateAssignments(await readJson(MALL_TEMPLATE_ASSIGNMENTS_URL))
  if (CAN_WRITE) {
    templateList.value = await readJson(`${EDITOR_API}/templates`)
    return
  }
  const keys = [...new Set(Object.values(assignments.value.cells))]
  templateList.value = await Promise.all(keys.map(async (key) => parseMallTemplate(await readJson(mallTemplateUrl(key)))))
}

function confirmDiscard(): boolean {
  return !dirty.value || window.confirm('Discard the unsaved changes of this template?')
}

function resetEditing(next: MallTemplate): void {
  template.value = next
  savedSnapshot.value = JSON.stringify(next)
  selectedId.value = null
  hiddenIds.value = []
  materialSlotsById.value = {}
  history.value = []
  historyIndex.value = -1
  commitHistory()
}

function newTemplate(): void {
  if (!confirmDiscard()) return
  resetEditing({ version: 1, key: '', name: '', preset: { ...template.value.preset }, props: [] })
  loadedKey.value = null
  targetCell.value = null
  status.value = null
}

async function openTemplate(key: string): Promise<void> {
  openKey.value = ''
  if (!key || !confirmDiscard()) return
  try {
    const loaded = parseMallTemplate(await readJson(CAN_WRITE ? `${EDITOR_API}/templates/${key}` : mallTemplateUrl(key)))
    const index = presets.value.findIndex((p) => samePreset(p, loaded.preset))
    if (index < 0) throw new Error(`${key}: no planned cell is ${loaded.preset.width}×${loaded.preset.depth} any more`)
    presetIndex.value = index
    resetEditing(loaded)
    loadedKey.value = key
    targetCell.value = cells.value.find((c) => assignments.value.cells[c.id] === key) ?? null
    status.value = { kind: 'ok', text: `Opened ${key}.` }
  } catch (error) {
    status.value = { kind: 'error', text: errorText(error) }
  }
}

async function saveTemplate(): Promise<void> {
  try {
    const sent = JSON.stringify(template.value)
    const valid = parseMallTemplate(JSON.parse(sent))
    if (valid.key !== loadedKey.value && !confirmNewKey(valid.key)) return
    await readJson(`${EDITOR_API}/templates/${valid.key}?overwrite=1`, { method: 'PUT', body: JSON.stringify(valid) })
    savedSnapshot.value = sent
    loadedKey.value = valid.key
    await loadLists()
    status.value = { kind: 'ok', text: `Saved templates/${valid.key}.json` }
  } catch (error) {
    status.value = { kind: 'error', text: errorText(error) }
  }
}

function confirmNewKey(key: string): boolean {
  const previous = loadedKey.value
  const stillHolding = previous ? Object.entries(assignments.value.cells).filter(([, held]) => held === previous).map(([id]) => id) : []
  const warnings = [
    ...(templateList.value.some((t) => t.key === key) ? [`templates/${key}.json already exists and will be replaced.`] : []),
    ...(stillHolding.length ? [`${previous} stays in ${stillHolding.join(', ')}; this saves a separate template.`] : []),
  ]
  return warnings.length === 0 || window.confirm(warnings.join('\n'))
}

async function setCellTemplate(cellId: string, key: string | null): Promise<void> {
  try {
    assignments.value = parseTemplateAssignments(await readJson(`${EDITOR_API}/assignments/${cellId}`, { method: 'PUT', body: JSON.stringify({ template: key }) }))
    status.value = { kind: 'ok', text: key ? `${cellId} now holds ${key}. Rebuild the mall to open the cell.` : `${cellId} cleared.` }
  } catch (error) {
    status.value = { kind: 'error', text: errorText(error) }
  }
}

async function startWalk(): Promise<void> {
  const scene = editor.value
  if (!scene) return
  walking.value = await scene.startWalk()
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (dirty.value) event.preventDefault()
}

onBeforeRouteLeave(() => confirmDiscard())

function applyTransform(id: string, transform: PropTransform): void {
  const prop = template.value.props.find((p) => p.id === id)
  if (!prop) return
  prop.position = transform.position
  prop.yaw = transform.yaw
  prop.scale = transform.scale
}

function deleteSelected(): void {
  if (!selectedId.value) return
  template.value.props = template.value.props.filter((p) => p.id !== selectedId.value)
  selectedId.value = null
}

function duplicateSelected(): void {
  const source = template.value.props.find((p) => p.id === selectedId.value)
  if (!source) return
  if (source.kind === 'light' && template.value.props.filter((p) => p.kind === 'light').length >= MAX_LIGHTS) {
    status.value = { kind: 'error', text: `A cell holds at most ${MAX_LIGHTS} lights.` }
    return
  }
  const copy = JSON.parse(JSON.stringify(source)) as TemplateProp
  copy.id = newPropId()
  if (copy.kind === 'npc') copy.vendor = false
  const step = Math.max(translationSnap.value, 0.5)
  const { halfWidth } = usableArea(template.value.preset)
  const x = copy.position[0] + step <= halfWidth ? copy.position[0] + step : copy.position[0] - step
  copy.position = [Math.max(-halfWidth, x), copy.position[1], copy.position[2]]
  template.value.props.push(copy)
  selectedId.value = copy.id
}

function isTypingTarget(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
}

function onKeyDown(event: KeyboardEvent): void {
  if (isTypingTarget(event) || editor.value?.isFlying || editor.value?.isTransforming || editor.value?.isWalking) return
  const command = event.metaKey || event.ctrlKey
  if (command && event.code === 'KeyZ') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
    return
  }
  if (command && event.code === 'KeyY') {
    event.preventDefault()
    redo()
    return
  }
  if (command && event.code === 'KeyD') {
    event.preventDefault()
    duplicateSelected()
    return
  }
  if (command) return
  if (event.code === 'Delete' || event.code === 'Backspace') {
    event.preventDefault()
    deleteSelected()
    return
  }
  const mode = GIZMO_MODES.find((m) => m.key === event.code)
  if (mode) gizmoMode.value = mode.mode
}

function newPropId(): string {
  const ids = new Set(template.value.props.map((p) => p.id))
  let n = template.value.props.length + 1
  while (ids.has(`p${n}`)) n += 1
  return `p${n}`
}

const DECOR_CATEGORIES_URL = '/assets/decor/categories.json'
const CONSUMABLE_GROUPS: Array<[prefix: string, label: string]> = [
  ['food_', 'Food'],
  ['drink_', 'Drinks'],
  ['candy_', 'Sweets'],
  ['grocery_', 'Grocery'],
  ['med_', 'Medical'],
  ['farm_', 'Farm'],
]
const MANNEQUIN_BODY = '#e8e4dc'
const DEFAULT_MANNEQUIN_OUTFIT = [
  { slot: 'top', key: 'tee' },
  { slot: 'bottom', key: 'jeans' },
  { slot: 'shoes', key: 'sneakers' },
] as const

function decorEntry(key: string, group: string): PlaceableEntry {
  return {
    id: `decor:${key}`,
    folder: 'decor',
    group,
    label: key.split('_').join(' '),
    preview: `/assets/decor/${key}/preview.png`,
    modelUrl: decorModelUrl(key),
    create: (id, position) => ({ id, kind: 'decor', key, position, yaw: 0, scale: 1 }),
  }
}

function decorKeyOf(item: ShopItem): string | null {
  if (!item.model_glb) return null
  return /^\/assets\/decor\/([a-z0-9_]+)\/model\.glb$/.exec(new URL(item.model_glb, window.location.origin).pathname)?.[1] ?? null
}

function sellableEntry(item: ShopItem, groupOfDecor: (key: string) => string): PlaceableEntry | null {
  if ((item.kind !== 'furniture' && item.kind !== 'consumable') || !item.model_glb) return null
  const modelPath = new URL(item.model_glb, window.location.origin).pathname
  const decorKey = decorKeyOf(item)
  const key = decorKey ?? item.code.slice(item.code.indexOf('_') + 1)
  if (itemModelUrl({ key, code: item.code }) !== modelPath) return null
  return {
    id: `item:${item.code}`,
    folder: 'sellable',
    group: decorKey ? groupOfDecor(decorKey) : (CONSUMABLE_GROUPS.find(([prefix]) => item.code.startsWith(prefix))?.[1] ?? 'Other'),
    label: item.name,
    preview: item.preview_image,
    modelUrl: item.model_glb,
    create: (id, position) => ({ id, kind: 'item', key, code: item.code, forSale: true, position, yaw: 0, scale: 1 }),
  }
}

const MANNEQUIN_ENTRY: PlaceableEntry = {
  id: 'mannequin:basic',
  folder: 'mannequin',
  group: 'Mannequins',
  label: 'Mannequin',
  preview: null,
  modelUrl: null,
  create: (id, position) => ({
    id,
    kind: 'mannequin',
    position,
    yaw: 0,
    scale: 1,
    body: MANNEQUIN_BODY,
    outfit: DEFAULT_MANNEQUIN_OUTFIT.map(({ slot, key }) => ({ slot, key, color: DEFAULT_SLOT_COLORS[slot], forSale: false })),
  }),
}

const NPC_ENTRY: PlaceableEntry = {
  id: 'npc:extra',
  folder: 'npc',
  group: 'People',
  label: 'Extra',
  preview: null,
  modelUrl: null,
  create: (id, position) => ({
    id,
    kind: 'npc',
    position,
    yaw: 0,
    scale: 1,
    pose: 'idle',
    vendor: false,
    body: DEFAULT_SLOT_COLORS.body,
    outfit: DEFAULT_NPC_OUTFIT.map(({ slot, key }) => ({ slot, key, color: DEFAULT_SLOT_COLORS[slot] })),
  }),
}

function setSurfaces(next: NonNullable<MallTemplate['surfaces']>): void {
  if (Object.keys(next).length === 0) delete template.value.surfaces
  else template.value.surfaces = next
}

function lightEntry(light: 'point' | 'spot', label: string): PlaceableEntry {
  return {
    id: `light:${light}`,
    folder: 'light',
    group: 'Lights',
    label,
    preview: null,
    modelUrl: null,
    create: (id, [x, , z]) => ({
      id,
      kind: 'light',
      light,
      position: [x, 3.2, z],
      yaw: 0,
      scale: 1,
      color: '#ffd9a0',
      intensity: 20,
      range: 6,
      ...(light === 'spot' ? { angle: Math.PI / 6, pitch: Math.PI / 2 } : {}),
    }),
  }
}

function pick(entry: ContentEntry): void {
  const scene = editor.value
  const placeable = entries.value.find((e) => e.id === entry.id)
  if (!scene || !placeable) return
  if (placeable.folder === 'light' && template.value.props.filter((p) => p.kind === 'light').length >= MAX_LIGHTS) {
    status.value = { kind: 'error', text: `A cell holds at most ${MAX_LIGHTS} lights.` }
    return
  }
  if (armedId.value === entry.id) {
    scene.cancelPlacing()
    armedId.value = null
    return
  }
  armedId.value = entry.id
  scene.beginPlacing({
    modelUrl: placeable.modelUrl,
    place: (position) => {
      armedId.value = null
      template.value.props.push(placeable.create(newPropId(), position))
    },
    cancel: () => {
      armedId.value = null
    },
  })
}

async function loadEditorAssets(): Promise<EditorAssets | null> {
  const response = await fetch(`${EDITOR_API}/assets`)
  if (!response.headers.get('content-type')?.includes('application/json')) return null
  const body = (await response.json()) as EditorAssets & { error?: string }
  if (!response.ok) throw new Error(`${EDITOR_API}/assets: ${body.error ?? `HTTP ${response.status}`}`)
  return body
}

async function loadTextureOptions(): Promise<Record<string, string>> {
  const categories = parseCategories(await readJson(`${TEXTURES_URL}/categories.json`))
  const metas = await Promise.all(
    categories.flatMap((category) => category.keys.map(async (key) => ({ category, meta: parseTextureMeta(await readJson(`${TEXTURES_URL}/${key}/texture.json`), key) }))),
  )
  texturePartsByKey.value = Object.fromEntries(metas.flatMap(({ meta }) => (meta.parts ? [[meta.key, meta.parts]] : [])))
  return Object.fromEntries(metas.map(({ category, meta }) => [`${category.label} · ${meta.label}`, meta.key]))
}

async function loadContent(): Promise<void> {
  const [assets, catalog, rawCategories] = await Promise.all([loadEditorAssets(), fetchItemShopCatalog(), readJson(DECOR_CATEGORIES_URL)])
  const categories = parseCategories(rawCategories)
  const groupOfDecor = (key: string) => categories.find((c) => c.keys.includes(key))?.label ?? 'Uncategorized'
  const decorKeys = [...new Set([...categories.flatMap((c) => c.keys), ...(assets?.decor ?? [])])]
  const uncategorized = decorKeys.filter((key) => groupOfDecor(key) === 'Uncategorized')
  const placeable = catalog.items.filter((item) => (item.kind === 'furniture' || item.kind === 'consumable') && item.model_glb)
  const sellable = placeable.map((item) => sellableEntry(item, groupOfDecor)).filter((e): e is PlaceableEntry => e !== null)
  const skipped = placeable.filter((item) => !sellable.some((e) => e.id === `item:${item.code}`)).map((item) => item.code)
  const notices = [
    ...(assets ? [] : ['Saving only works on the local dev server.']),
    ...(uncategorized.length ? [`Not in decor/categories.json: ${uncategorized.join(', ')}`] : []),
    ...(skipped.length ? [`Not placeable (model path does not match its code): ${skipped.join(', ')}`] : []),
  ]
  editorAssets.value = assets
  decorKeyList.value = decorKeys
  const codesByDecor = new Map<string, string[]>()
  for (const item of placeable) {
    const key = decorKeyOf(item)
    if (key) codesByDecor.set(key, [...(codesByDecor.get(key) ?? []), item.code])
  }
  const shared = [...codesByDecor].filter(([, codes]) => codes.length > 1)
  if (shared.length) notices.push(`Sold under several codes, For sale is off for: ${shared.map(([key, codes]) => `${key} (${codes.join(', ')})`).join('; ')}`)
  const codesByWear = new Map<string, string[]>()
  for (const item of catalog.items) {
    const piece = item.model_glb ? /^\/assets\/wear\/([a-z_]+\/[a-z0-9_]+)\/model\.glb$/.exec(new URL(item.model_glb, window.location.origin).pathname)?.[1] : undefined
    if (piece) codesByWear.set(piece, [...(codesByWear.get(piece) ?? []), item.code])
  }
  const sharedWear = [...codesByWear].filter(([, codes]) => codes.length > 1)
  if (sharedWear.length) notices.push(`Wear sold under several codes, for sale is off for: ${sharedWear.map(([piece, codes]) => `${piece} (${codes.join(', ')})`).join('; ')}`)
  wearSaleCodes.value = Object.fromEntries([...codesByWear].filter(([, codes]) => codes.length === 1).map(([piece, codes]) => [piece, codes[0]!]))
  contentNotice.value = notices.length ? notices.join(' ') : null
  saleCodes.value = Object.fromEntries([...codesByDecor].filter(([, codes]) => codes.length === 1).map(([key, codes]) => [key, codes[0]!]))
  entries.value = [...decorKeys.map((key) => decorEntry(key, groupOfDecor(key))), ...sellable, NPC_ENTRY, MANNEQUIN_ENTRY, lightEntry('point', 'Point light'), lightEntry('spot', 'Spot light')]
  textureOptions.value = await loadTextureOptions()
}

onMounted(async () => {
  const scene = new MallEditorScene(viewportRef.value!)
  scene.onSelect = (id) => (selectedId.value = id)
  scene.onTransform = applyTransform
  scene.onError = (message) => (sceneError.value = message)
  scene.onWalkEnd = () => (walking.value = false)
  scene.onMaterials = (id, slots) => (materialSlotsById.value = { ...materialSlotsById.value, [id]: slots })
  editor.value = markRaw(scene)
  commitHistory()
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('beforeunload', onBeforeUnload)
  try {
    const response = await fetch(MALL_LAYOUT_URL)
    if (!response.ok) throw new Error(`${MALL_LAYOUT_URL}: HTTP ${response.status}`)
    const layout = (await response.json()) as { cells?: unknown; plazas?: unknown; stores?: unknown }
    if (!Array.isArray(layout.cells) || !Array.isArray(layout.plazas) || !Array.isArray(layout.stores)) throw new Error(`${MALL_LAYOUT_URL}: cells, plazas or stores missing`)
    cells.value = layout.cells as MallCell[]
    plazas.value = layout.plazas as MallPlaza[]
    mallStores.value = layout.stores as MallStoreMark[]
    if (presets.value.length === 0) throw new Error(`${MALL_LAYOUT_URL}: no planned cell to build a template for`)
    template.value.preset = presetOf(presets.value[presetIndex.value]!)
    savedSnapshot.value = JSON.stringify(template.value)
    await Promise.all([loadContent(), loadLists()])
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  }
})

onUnmounted(() => {
  if (commitTimer) clearTimeout(commitTimer)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('beforeunload', onBeforeUnload)
  editor.value?.dispose()
})
</script>

<template>
  <div class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-ink-950 text-fog">
    <header class="cc-panel-flat m-2 mb-0 flex flex-wrap items-center gap-3 px-4 py-2">
      <h1 class="cc-display m-0 text-xl text-sun">Mall Editor</h1>
      <input v-model.trim="template.name" placeholder="Template name" class="cc-input w-44 py-1.5 text-sm" />
      <input
        v-model.trim="template.key"
        placeholder="file_key"
        :class="['cc-input w-36 py-1.5 font-mono text-sm', template.key && !keyValid ? 'border-red-400' : '']"
        title="File name: lowercase letters, digits and _"
      />
      <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" title="Choose the shop cell on the mall map" @click="mapOpen = true">
        <UiIcon name="map" :size="14" />
        <template v-if="targetCell">{{ targetCell.id }} · {{ targetCell.name }} · </template>{{ preset ? `${preset.width} × ${preset.depth} m` : 'Choose a cell' }}
      </button>
      <div class="ml-auto flex flex-wrap items-center gap-1">
        <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" @click="newTemplate">New</button>
        <select v-model="openKey" class="cc-input w-auto py-1.5 text-sm" @change="openTemplate(openKey)">
          <option value="">Open…</option>
          <option v-for="t in templateList" :key="t.key" :value="t.key">{{ t.name }} ({{ t.preset.width }}×{{ t.preset.depth }})</option>
        </select>
        <button v-if="CAN_WRITE" type="button" class="cc-btn cc-btn-sm cc-btn-sun" :disabled="!keyValid || !template.name" @click="saveTemplate">
          Save<span v-if="dirty"> •</span>
        </button>
        <button type="button" class="cc-btn cc-btn-sm cc-btn-mint" :disabled="walking" @click="startWalk"><UiIcon name="play" :size="14" /> Test</button>
        <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" :disabled="!canUndo" title="Undo (Ctrl/Cmd+Z)" @click="undo"><UiIcon name="rotate-left" :size="16" /></button>
        <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" :disabled="!canRedo" title="Redo (Ctrl/Cmd+Shift+Z)" @click="redo"><UiIcon name="rotate-right" :size="16" /></button>
      </div>
      <p v-if="status" :class="['m-0 w-full text-sm font-bold', status.kind === 'error' ? 'text-red-400' : 'text-mint']">{{ status.text }}</p>
      <p v-if="!CAN_WRITE" class="m-0 w-full text-xs font-bold text-sun">Read-only: templates are edited and saved on the local dev server, then committed.</p>
      <p v-if="loadError" class="m-0 w-full text-sm font-bold text-red-400">{{ loadError }}</p>
      <p v-if="sceneError" class="m-0 w-full text-sm font-bold text-red-400">{{ sceneError }}</p>
    </header>
    <div class="flex min-h-0 flex-1 gap-2 p-2">
      <div class="relative min-w-0 flex-1 overflow-hidden rounded-2xl">
        <div ref="viewportRef" class="absolute inset-0" />
        <p v-if="walking" class="cc-panel-glass pointer-events-none absolute bottom-3 left-1/2 m-0 -translate-x-1/2 px-4 py-2 text-sm font-bold">
          Walking · WASD to move, mouse to look, Esc to leave
        </p>
        <div class="cc-panel-glass absolute left-2 top-2 flex flex-wrap items-center gap-1 px-2 py-1.5 text-xs font-bold">
          <button
            v-for="m in GIZMO_MODES"
            :key="m.mode"
            type="button"
            :title="`${m.label} (${m.key.slice(3)})`"
            :class="['cc-btn cc-btn-sm px-2', gizmoMode === m.mode ? 'cc-btn-sun' : 'cc-btn-ghost']"
            @click="gizmoMode = m.mode"
          >
            <UiIcon :name="m.icon" :size="16" />
          </button>
          <label class="ml-2 flex items-center gap-1 text-mist" title="Grid snap (m)">
            <UiIcon name="grid" :size="14" />
            <select v-model.number="translationSnap" class="rounded bg-ink-950/70 px-1 py-0.5 text-fog">
              <option v-for="v in TRANSLATION_SNAPS" :key="v" :value="v">{{ v === 0 ? 'off' : v }}</option>
            </select>
          </label>
          <label class="flex items-center gap-1 text-mist" title="Rotation snap (°)">
            <UiIcon name="rotate-right" :size="14" />
            <select v-model.number="rotationSnap" class="rounded bg-ink-950/70 px-1 py-0.5 text-fog">
              <option v-for="v in ROTATION_SNAPS" :key="v" :value="v">{{ v === 0 ? 'off' : `${v}°` }}</option>
            </select>
          </label>
          <label class="flex items-center gap-1 text-mist" title="Scale snap">
            <UiIcon name="box" :size="14" />
            <select v-model.number="scaleSnap" class="rounded bg-ink-950/70 px-1 py-0.5 text-fog">
              <option v-for="v in SCALE_SNAPS" :key="v" :value="v">{{ v === 0 ? 'off' : v }}</option>
            </select>
          </label>
        </div>
      </div>
      <div class="w-1.5 shrink-0 cursor-col-resize rounded bg-ink-800 hover:bg-pool/60" title="Drag to resize" @pointerdown="startResize('aside', $event)" />
      <aside class="flex min-h-0 shrink-0 flex-col" :style="{ width: `${panels.aside}px` }">
        <MallEditorOutliner class="shrink-0" :style="{ height: `${panels.outliner}px` }" :props="template.props" :selected-id="selectedId" :hidden="hiddenIds" @select="selectedId = $event" @toggle-hidden="toggleHidden" />
        <div class="my-1 h-1.5 shrink-0 cursor-row-resize rounded bg-ink-800 hover:bg-pool/60" title="Drag to resize" @pointerdown="startResize('outliner', $event)" />
        <MallEditorDetails
          class="min-h-0 flex-1"
          :prop="selectedProp"
          :decor-keys="decorKeyList"
          :wear="editorAssets?.wear ?? emptyWear"
          :vendor-taken="vendorTaken"
          :preset="template.preset"
          :sale-codes="saleCodes"
          :wear-sale-codes="wearSaleCodes"
          :surfaces="template.surfaces"
          :textures="textureOptions"
          :texture-parts="texturePartsByKey"
          :own-parts="ownParts"
          :material-slots="selectedProp?.kind === 'decor' ? (materialSlotsById[selectedProp.id] ?? []) : []"
          @change="replaceProp"
          @surfaces="setSurfaces"
        />
      </aside>
    </div>
    <MallMapModal
      v-if="mapOpen"
      :cells="cells"
      :plazas="plazas"
      :stores="mallStores"
      :assignments="assignments"
      :preset="preset"
      :template-key="template.key"
      :has-props="template.props.length > 0"
      :can-assign="!dirty && keyValid"
      :can-write="CAN_WRITE"
      :selected-id="targetCell?.id ?? null"
      @close="mapOpen = false"
      @use="useCell"
      @assign="assignFromMap"
      @clear="clearFromMap"
    />
    <div class="mx-2 mb-1 h-1.5 shrink-0 cursor-row-resize rounded bg-ink-800 hover:bg-pool/60" title="Drag to resize" @pointerdown="startResize('browser', $event)" />
    <MallEditorContentBrowser class="m-2 mt-0 shrink-0" :style="{ height: `${panels.browser}px` }" :entries="entries" :armed-id="armedId" :notice="contentNotice" @pick="pick" />
  </div>
</template>
