import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
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

const ROUTE = '/__mall-editor/'
const MAX_BODY_BYTES = 1_000_000
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', 'front']

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

function mallTemplatesApi(assets: string) {
  const mallDir = join(assets, 'store', 'mall')
  const templatesDir = join(mallDir, 'templates')
  const assignmentsPath = join(mallDir, 'template_assignments.json')
  const templatePath = (key: string) => join(templatesDir, `${key}.json`)
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

  function assertAssetsExist(template: MallTemplate): void {
    const missing = template.props.flatMap((prop) => {
      if (prop.kind === 'decor') return existsSync(join(assets, 'decor', prop.key, 'model.glb')) ? [] : [`${prop.id}: decor/${prop.key}`]
      if (prop.kind === 'npc' || prop.kind === 'mannequin') return prop.outfit.filter((p) => !existsSync(join(assets, 'wear', p.slot, p.key, 'model.glb'))).map((p) => `${prop.id}: wear/${p.slot}/${p.key}`)
      return []
    })
    const looks = [
      ...Object.entries(template.surfaces ?? {}).map(([surface, look]) => [surface, look.texture] as const),
      ...template.props.flatMap((prop) => (prop.kind === 'decor' ? Object.entries(prop.materials ?? {}).map(([name, look]) => [`${prop.id}.${name}`, look.texture] as const) : [])),
    ]
    const libraryMaterials = template.props.flatMap((prop) => (prop.kind === 'decor' ? Object.entries(prop.materials ?? {}).flatMap(([name, look]) => (look.material ? [[`${prop.id}.${name}`, look.material] as const] : [])) : []))
    const textures = [
      ...looks.filter(([, key]) => key && !existsSync(join(assets, 'textures', key, 'texture.json'))).map(([where, key]) => `${where}: textures/${key}`),
      ...libraryMaterials.filter(([, key]) => !existsSync(join(assets, 'materials', key, 'material.json'))).map(([where, key]) => `${where}: materials/${key}`),
    ]
    if (missing.length || textures.length) throw new HttpError(400, `missing assets: ${[...missing, ...textures].join(', ')}`)
  }

  function cellsHolding(key: string): string[] {
    return Object.entries(assignments().cells).filter(([, held]) => held === key).map(([cellId]) => cellId)
  }

  async function handle(method: string, path: string, overwrite: boolean, req: IncomingMessage): Promise<unknown> {
    if (method === 'GET' && path === 'assets') {
      return {
        decor: modelFolders(join(assets, 'decor')),
        wear: Object.fromEntries(WEAR_SLOTS.map((slot) => [slot, modelFolders(join(assets, 'wear', slot))])),
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
    const cellId = /^assignments\/([A-Z][0-9]{2})$/.exec(path)?.[1]
    if (method === 'PUT' && cellId) {
      const body = await readBody(req)
      const key = typeof body === 'object' && body !== null ? (body as { template?: unknown }).template : undefined
      if (key !== null && (typeof key !== 'string' || !TEMPLATE_KEY.test(key))) throw new HttpError(400, 'expected {"template": "<key>"} or {"template": null}')
      const next = assignTemplate(assignments(), cells(), cellId, key === null ? null : storedTemplate(key))
      writeJson(assignmentsPath, next)
      return next
    }
    throw new HttpError(404, `no route ${method} ${ROUTE}${path}`)
  }

  return async (req: IncomingMessage, res: ServerResponse) => {
    const [rawPath, query = ''] = (req.url ?? '').split('?')
    const path = rawPath!.replace(/^\//, '')
    try {
      const host = (req.headers.host ?? '').replace(/:\d+$/, '')
      if (req.method !== 'GET' && !LOCAL_HOSTS.includes(host)) throw new HttpError(403, `writes only from ${LOCAL_HOSTS.join(', ')}`)
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
      const api = mallTemplatesApi(join(server.config.root, 'public', 'assets'))
      server.middlewares.use(ROUTE, (req, res) => void api(req, res))
    },
  }
}
