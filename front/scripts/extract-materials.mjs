import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { Color, LinearSRGBColorSpace } from 'three'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DECOR = join(FRONT, 'public/assets/decor')
const MATERIALS = join(FRONT, 'public/assets/materials')
const BUILD = `${MATERIALS}.tmp`
const SOURCE = /^DC_([A-Za-z0-9]+)$/
const EXTENSIONS = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }
const GROUPS = [
  { id: 'wood', label: 'Wood', test: /oak|walnut|pine|wood|birch|cherry|teak|bamboo|cork|plank/i },
  { id: 'fabric', label: 'Fabric', test: /fabric|cloth|knit|rug|cushion|linen|velvet|leather|towel/i },
  { id: 'metal', label: 'Metal', test: /metal|steel|chrome|brass|copper|iron|gold|silver|alu/i },
  { id: 'stone', label: 'Stone & ceramic', test: /ceramic|stone|marble|concrete|tile|porcelain|terracotta/i },
  { id: 'glass', label: 'Glass & plastic', test: /glass|plastic|acrylic|screen|mirror/i },
  { id: 'paint', label: 'Paint', test: /paint|lacquer|enamel/i },
  { id: 'plants', label: 'Plants', test: /leaf|plant|stem|petal|flower|cactus|soil|moss|grass/i },
]
const OTHER = { id: 'other', label: 'Other' }

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })

const hex = ([r, g, b]) => `#${new Color().setRGB(r, g, b, LinearSRGBColorSpace).getHexString()}`
const slug = (name) => name.replace(/([a-z])([A-Z0-9])/g, '$1_$2').toLowerCase()
const label = (name) => slug(name).split('_').join(' ').replace(/^./, (c) => c.toUpperCase())

rmSync(BUILD, { recursive: true, force: true })
mkdirSync(BUILD, { recursive: true })
const seen = new Map()
for (const key of readdirSync(DECOR).sort()) {
  const glb = join(DECOR, key, 'model.glb')
  if (!existsSync(glb)) continue
  for (const material of (await io.read(glb)).getRoot().listMaterials()) {
    const name = SOURCE.exec(material.getName())?.[1]
    if (!name) continue
    const id = slug(name)
    if (seen.has(name)) {
      const first = JSON.parse(readFileSync(join(BUILD, id, 'material.json'), 'utf8'))
      if (first.color !== hex(material.getBaseColorFactor().slice(0, 3))) console.warn(`material   ${id}: decor/${key} differs from ${first.source}, keeping ${first.source}`)
      continue
    }
    const dir = join(BUILD, id)
    mkdirSync(dir, { recursive: true })
    const texture = material.getBaseColorTexture()
    const maps = {}
    if (texture) {
      const extension = EXTENSIONS[texture.getMimeType()]
      if (!extension) throw new Error(`${glb} ${material.getName()}: unsupported ${texture.getMimeType()}`)
      writeFileSync(join(dir, `color.${extension}`), texture.getImage())
      maps.color = `color.${extension}`
    }
    const meta = {
      version: 1,
      key: id,
      label: label(name),
      color: hex(material.getBaseColorFactor().slice(0, 3)),
      roughness: Number(material.getRoughnessFactor().toFixed(3)),
      metalness: Number(material.getMetallicFactor().toFixed(3)),
      maps,
      source: `decor/${key}`,
    }
    writeFileSync(join(dir, 'material.json'), `${JSON.stringify(meta, null, 2)}\n`)
    seen.set(name, id)
    console.log(`material   ${id} <- decor/${key} ${material.getName()}`)
  }
}

const categories = [...GROUPS, OTHER].map(({ id, label: name, test }) => ({
  id,
  label: name,
  keys: [...seen].filter(([source]) => (test ? test.test(source) && !GROUPS.slice(0, GROUPS.findIndex((g) => g.id === id)).some((g) => g.test.test(source)) : !GROUPS.some((g) => g.test.test(source)))).map(([, key]) => key),
})).filter((c) => c.keys.length > 0)
writeFileSync(join(BUILD, 'categories.json'), `${JSON.stringify({ version: 1, categories }, null, 2)}\n`)
rmSync(MATERIALS, { recursive: true, force: true })
renameSync(BUILD, MATERIALS)
console.log(`${seen.size} materials in ${categories.length} categories`)
