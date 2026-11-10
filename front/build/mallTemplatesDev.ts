import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { WEAR_SLOTS } from '../src/avatar/modularCharacterLogic.ts'
import {
  TEMPLATE_KEY,
  TemplateError,
  assignTemplate,
  parseMallTemplate,
  parseTemplateAssignments,
  type MallCell,
  type MallTemplate,
  type TemplateAssignments,
} from '../src/game/mallTemplates/mallTemplate.ts'
import { parseBuildingProp, parseZoneDecor, parseZoneDecorIndex, zoneDecorJson, zonePriceFile, type ZoneDecorIndex } from '../src/game/zoneDecor/zoneDecor.ts'
import { buildingPreviewKey, parseBuildings, type BuildingTable } from '../src/game/buildings/buildings.ts'
import type { BuildingProp } from '../src/game/mallTemplates/mallTemplate.ts'
import { parseCrops, type CropTable } from '../src/game/crops/crops.ts'
import { CONSUMABLE_FOLDERS, findHouse, findStore, findWork } from '../src/game/assets/catalog.ts'
import { parseAnimals, type AnimalTable } from '../src/game/animals/animals.ts'
import type { WorldManifest } from '../src/game/world/worldManifest.ts'

const ROUTE = '/__editor/'
const MAX_BODY_BYTES = 1_000_000
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', 'front']
const BLENDER_TIMEOUT_MS = 120_000
const PREVIEW_FILE = /^buildings\/([a-z0-9_]+)\.glb$/
type ManifestBuilding = NonNullable<WorldManifest['zones'][number]['buildings']>[number]
const BUILDING_SOURCES = ['lib_buildings.py', 'build_building.py', 'lib_kit.py', 'lib_common.py']

class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(`${path}.tmp`, path)
}

function modelFolders(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'model.glb')))
    .map((entry) => entry.name)
    .sort()
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'body over 1 MB')
    chunks.push(chunk as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'body is not valid JSON')
  }
}

function runBlender(repo: string, building: BuildingProp, out: string): Promise<void> {
  const script = join(repo, 'map-src', 'CampusCove', 'build_building.py')
  const expr = `BUILDING_PROP = ${JSON.stringify(JSON.stringify(building))}; BUILDING_OUT = ${JSON.stringify(out)}; p = ${JSON.stringify(script)}; exec(open(p).read(), {"__file__": p, "BUILDING_PROP": BUILDING_PROP, "BUILDING_OUT": BUILDING_OUT})`
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.BLENDER ?? 'blender', ['--background', '--factory-startup', '--python-exit-code', '1', '--python-expr', expr], { cwd: repo })
    let log = ''
    const keep = (chunk: Buffer) => (log = (log + chunk.toString()).slice(-2000))
    child.stdout.on('data', keep)
    child.stderr.on('data', keep)
    const timer = setTimeout(() => child.kill(), BLENDER_TIMEOUT_MS)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new HttpError(501, `cannot run Blender (${error.message}): run the editor dev server on a machine with Blender, or set BLENDER=/path/to/blender`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && existsSync(out)) return resolve()
      rmSync(out, { force: true })
      reject(new HttpError(500, `Blender failed to build ${building.id} (exit ${code}): ${log.trim().split('\n').slice(-6).join(' | ')}`))
    })
  })
}

function mallTemplatesApi(assets: string, backendZones: string, repo: string) {
  const buildScripts = join(repo, 'map-src', 'CampusCove')
  const previewsDir = () => {
    const hash = createHash('sha1')
    for (const file of BUILDING_SOURCES) hash.update(readFileSync(join(buildScripts, file)))
    hash.update(readFileSync(join(assets, 'buildings', 'buildings.json')))
    return join(buildScripts, 'out', 'building_previews', hash.digest('hex').slice(0, 12))
  }
  let previewQueue: Promise<unknown> = Promise.resolve()
  const mallDir = join(assets, 'store', 'mall')
  const templatesDir = join(mallDir, 'templates')
  const assignmentsPath = join(mallDir, 'template_assignments.json')
  const templatePath = (key: string) => join(templatesDir, `${key}.json`)
  const zonesDir = join(assets, 'zones')
  const zoneIndexPath = join(zonesDir, 'index.json')
  const zonePath = (key: string) => join(zonesDir, `${key}.json`)
  mkdirSync(templatesDir, { recursive: true })

  function storedTemplate(key: string): MallTemplate {
    const path = templatePath(key)
    if (!existsSync(path)) throw new HttpError(404, `no template ${key}`)
    try {
      const template = parseMallTemplate(readJson(path))
      if (template.key !== key) throw new Error(`holds key ${template.key}`)
      return template
    } catch (error) {
      throw new HttpError(500, `templates/${key}.json: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function templates(): MallTemplate[] {
    return readdirSync(templatesDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => storedTemplate(file.slice(0, -'.json'.length)))
  }

  function cells(): MallCell[] {
    return (readJson(join(mallDir, 'mall.layout.json')) as { cells: MallCell[] }).cells
  }

  function assignments(): TemplateAssignments {
    return parseTemplateAssignments(readJson(assignmentsPath))
  }

  function assertAssetsExist(template: Pick<MallTemplate, 'props' | 'surfaces'>): void {
    const missing = template.props.flatMap((prop) => {
      if (prop.kind === 'decor') return existsSync(join(assets, 'decor', prop.key, 'model.glb')) ? [] : [`${prop.id}: decor/${prop.key}`]
      if (prop.kind === 'field') {
        const crop = crops()[prop.crop]
        return crop && existsSync(join(assets, ...crop.plant.split('/'))) ? [] : [`${prop.id}: plant of ${prop.crop}`]
      }
      if (prop.kind === 'animal') return existsSync(join(assets, 'animals', prop.animal, 'model.glb')) ? [] : [`${prop.id}: animals/${prop.animal}`]
      if (prop.kind === 'npc' || prop.kind === 'mannequin') return prop.outfit.filter((p) => !existsSync(join(assets, 'wear', p.slot, p.key, 'model.glb'))).map((p) => `${prop.id}: wear/${p.slot}/${p.key}`)
      return []
    })
    const looks = [
      ...Object.entries(template.surfaces ?? {}).map(([surface, look]) => [surface, look.texture] as const),
      ...template.props.flatMap((prop) => (prop.kind === 'decor' ? Object.entries(prop.materials ?? {}).map(([name, look]) => [`${prop.id}.${name}`, look.texture] as const) : [])),
      ...template.props.flatMap((prop) => (prop.kind === 'building' ? Object.entries(prop.textures ?? {}).map(([part, key]) => [`${prop.id}.${part}`, key] as const) : [])),
    ]
    const libraryMaterials = template.props.flatMap((prop) => (prop.kind === 'decor' ? Object.entries(prop.materials ?? {}).flatMap(([name, look]) => (look.material ? [[`${prop.id}.${name}`, look.material] as const] : [])) : []))
    const textures = [
      ...looks.filter(([, key]) => key && !existsSync(join(assets, 'textures', key, 'texture.json'))).map(([where, key]) => `${where}: textures/${key}`),
      ...libraryMaterials.filter(([, key]) => !existsSync(join(assets, 'materials', key, 'material.json'))).map(([where, key]) => `${where}: materials/${key}`),
    ]
    if (missing.length || textures.length) throw new HttpError(400, `missing assets: ${[...missing, ...textures].join(', ')}`)
  }

  function manifestZones() {
    return (readJson(join(assets, 'world.manifest.json')) as WorldManifest).zones
  }

  function decoratableZones() {
    return manifestZones().filter((zone) => zone.key !== 'mall')
  }

  function exteriorOf(zoneKey: string, building: ManifestBuilding) {
    const asset = building.kind === 'house' ? findHouse(building.key) : building.kind === 'work' ? findWork(building.key) : findStore(building.key)
    if (!asset) throw new HttpError(500, `world.manifest.json: zone ${zoneKey} lists an unknown ${building.kind} ${building.key}`)
    const interior = building.interiorOffset ? { interiorUrl: asset.interiorUrl, interiorOffset: building.interiorOffset } : {}
    return { key: building.key, url: asset.exteriorUrl, position: building.position, rotationY: building.rotationY, ...interior }
  }

  function stored<T>(file: string, parse: () => T): T {
    try {
      return parse()
    } catch (error) {
      throw new HttpError(500, `zones/${file}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function crops(): CropTable {
    return stored('../crops/crops.json', () => parseCrops(readJson(join(assets, 'crops', 'crops.json'))))
  }

  function animals(): AnimalTable {
    return stored('../animals/animals.json', () => parseAnimals(readJson(join(assets, 'animals', 'animals.json'))))
  }

  function consumableCodes(): string[] {
    const table = Object.values(crops())
    const plantOnly = (folder: string, key: string) => table.some((c) => c.plant === `items/${folder}/${key}/model.glb` && c.item !== `farm_${key}`)
    return CONSUMABLE_FOLDERS.flatMap(([prefix, folder]) => modelFolders(join(assets, 'items', folder)).filter((key) => !plantOnly(folder, key)).map((key) => `${prefix}${key}`))
  }

  function buildingTable(): BuildingTable {
    return stored('../buildings/buildings.json', () => parseBuildings(readJson(join(assets, 'buildings', 'buildings.json'))))
  }

  async function buildingPreview(building: BuildingProp): Promise<{ key: string; url: string }> {
    const key = buildingPreviewKey(building)
    const dir = previewsDir()
    const out = join(dir, `${key}.glb`)
    if (!existsSync(out)) {
      mkdirSync(dir, { recursive: true })
      const partial = join(dir, `${key}.partial.glb`)
      const build = previewQueue.then(async () => {
        if (existsSync(out)) return
        await runBlender(repo, building, partial)
        renameSync(partial, out)
      })
      previewQueue = build.catch(() => undefined)
      await build
    }
    return { key, url: `${ROUTE}buildings/${key}.glb` }
  }

  function zoneIndex(): ZoneDecorIndex {
    return stored('index.json', () => parseZoneDecorIndex(readJson(zoneIndexPath)))
  }

  function decoratableZone(key: string) {
    if (key === 'mall') throw new HttpError(400, 'the mall is decorated cell by cell with templates')
    const zone = manifestZones().find((z) => z.key === key)
    if (!zone) throw new HttpError(404, `no zone ${key} in world.manifest.json`)
    return zone
  }

  function cellsHolding(key: string): string[] {
    return Object.entries(assignments().cells).filter(([, held]) => held === key).map(([cellId]) => cellId)
  }

  async function handle(method: string, path: string, overwrite: boolean, req: IncomingMessage): Promise<unknown> {
    if (method === 'GET' && path === 'assets') {
      return {
        decor: modelFolders(join(assets, 'decor')),
        wear: Object.fromEntries(WEAR_SLOTS.map((slot) => [slot, modelFolders(join(assets, 'wear', slot))])),
        consumables: consumableCodes(),
      }
    }
    if (method === 'GET' && path === 'templates') return templates().map(({ key, name, preset }) => ({ key, name, preset }))
    const templateKey = /^templates\/([a-z0-9_]+)$/.exec(path)?.[1]
    if (method === 'PUT' && templateKey) {
      const template = parseMallTemplate(await readBody(req))
      if (template.key !== templateKey) throw new HttpError(400, `body key ${template.key} does not match ${templateKey}`)
      assertAssetsExist(template)
      if (existsSync(templatePath(templateKey)) && !overwrite) throw new HttpError(409, `templates/${templateKey}.json exists, add ?overwrite=1 to replace it`)
      const current = assignments()
      const mall = cells()
      for (const cellId of cellsHolding(templateKey)) assignTemplate(current, mall, cellId, template)
      writeJson(templatePath(templateKey), template)
      return template
    }
    if (method === 'GET' && templateKey) return storedTemplate(templateKey)
    if (method === 'DELETE' && templateKey) {
      storedTemplate(templateKey)
      const holding = cellsHolding(templateKey)
      if (holding.length > 0) throw new HttpError(409, `${templateKey} still fills ${holding.join(', ')}, clear those cells first`)
      unlinkSync(templatePath(templateKey))
      return { deleted: templateKey }
    }
    if (method === 'GET' && path === 'zones') {
      const decorated = zoneIndex().zones
      return decoratableZones().map(({ key, bounds, modelUrl, heightmapUrl, buildings }) => ({
        key,
        bounds,
        modelUrl,
        heightmapUrl,
        buildings: (buildings ?? []).map((building) => exteriorOf(key, building)),
        decorated: decorated.includes(key),
      }))
    }
    const zoneKey = /^zones\/([a-z0-9_]+)$/.exec(path)?.[1]
    if (method === 'GET' && zoneKey) {
      const zone = decoratableZone(zoneKey)
      if (!existsSync(zonePath(zoneKey))) throw new HttpError(404, `zones/${zoneKey}.json is not decorated yet`)
      const table = crops()
      return zoneDecorJson(stored(`${zoneKey}.json`, () => parseZoneDecor(readJson(zonePath(zoneKey)), zone, table, animals(), buildingTable())), table)
    }
    if (method === 'PUT' && zoneKey) {
      const table = crops()
      const decor = parseZoneDecor(await readBody(req), decoratableZone(zoneKey), table, animals(), buildingTable())
      assertAssetsExist(decor)
      const index = zoneIndex()
      const json = zoneDecorJson(decor, table)
      writeJson(zonePath(zoneKey), json)
      const backendReachable = existsSync(join(backendZones, '..'))
      if (backendReachable) {
        mkdirSync(backendZones, { recursive: true })
        writeJson(join(backendZones, `${zoneKey}.json`), zonePriceFile(decor))
      }
      if (!index.zones.includes(zoneKey)) writeJson(zoneIndexPath, { version: 1, zones: [...index.zones, zoneKey].sort() })
      return { zone: json, prices: backendReachable ? 'written' : 'pending' }
    }
    const cellId = /^assignments\/([A-Z][0-9]{2})$/.exec(path)?.[1]
    if (method === 'PUT' && cellId) {
      const body = await readBody(req)
      const key = typeof body === 'object' && body !== null ? (body as { template?: unknown }).template : undefined
      if (key !== null && (typeof key !== 'string' || !TEMPLATE_KEY.test(key))) throw new HttpError(400, 'expected {"template": "<key>"} or {"template": null}')
      const next = assignTemplate(assignments(), cells(), cellId, key === null ? null : storedTemplate(key))
      writeJson(assignmentsPath, next)
      return next
    }
    if (method === 'POST' && path === 'buildings/preview') {
      const building = parseBuildingProp(await readBody(req), buildingTable())
      assertAssetsExist({ props: [building] })
      return buildingPreview(building)
    }
    throw new HttpError(404, `no route ${method} ${ROUTE}${path}`)
  }

  return async (req: IncomingMessage, res: ServerResponse) => {
    const [rawPath, query = ''] = (req.url ?? '').split('?')
    const path = rawPath!.replace(/^\//, '')
    try {
      const host = (req.headers.host ?? '').replace(/:\d+$/, '')
      if (req.method !== 'GET' && !LOCAL_HOSTS.includes(host)) throw new HttpError(403, `writes only from ${LOCAL_HOSTS.join(', ')}`)
      if (req.method === 'POST' && !(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'send the body as application/json')
      const preview = req.method === 'GET' || req.method === 'HEAD' ? PREVIEW_FILE.exec(path)?.[1] : undefined
      if (preview) {
        const file = join(previewsDir(), `${preview}.glb`)
        if (!existsSync(file)) throw new HttpError(404, `no preview ${preview}, click Rebuild`)
        res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'no-store' })
        res.end(req.method === 'HEAD' ? undefined : readFileSync(file))
        return
      }
      const body = await handle(req.method ?? 'GET', path, new URLSearchParams(query).get('overwrite') === '1', req)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error instanceof TemplateError ? 400 : 500
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    }
  }
}

export function mallTemplatesDev(): Plugin {
  return {
    name: 'mall-templates-dev',
    apply: 'serve',
    configureServer(server) {
      const repo = join(server.config.root, '..')
      const api = mallTemplatesApi(join(server.config.root, 'public', 'assets'), join(repo, 'backend', 'resources', 'zones'), repo)
      server.middlewares.use(ROUTE, (req, res) => void api(req, res))
    },
  }
}
