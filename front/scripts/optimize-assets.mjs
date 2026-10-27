// Optimizes the Blender exports in map-src/CampusCove/out/ into front/public/assets/.
//
//   npm run assets:optimize            (all categories)
//   npm run assets:optimize -- houses  (one category: skins | decor | houses | town | work | park | items | store)
//
// Blender (map-src/CampusCove/build_*.py) writes raw GLBs + *.colsrc.glb collision sources to
// map-src/CampusCove/out/<category>/<key>/. This script:
//   1. compresses every GLB (Draco geometry, WebP textures) into public/assets/<category>/<key>/
//   2. turns each *.colsrc.glb into <name>.collision.json with scripts/extract-collision.mjs
// Interiors keep one node per object (--join false) so House_Floor_* / Door_Entrance names survive,
// and house exteriors keep their `Door` node (map-src/CampusCove/build_house_doors.py).
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(FRONT, '../map-src/CampusCove/out')
const DEST = resolve(FRONT, 'public/assets')
const CATEGORIES = ['skins', 'decor', 'houses', 'town', 'work', 'park', 'items', 'store']

/** Texture size per category: characters / props are small on screen, the town is not. */
const TEXTURE_SIZE = { skins: 512, decor: 512, houses: 1024, town: 1024, work: 1024, park: 1024, items: 512, store: 1024 }

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: FRONT, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })
  if (r.status !== 0) {
    process.stderr.write(r.stdout?.toString() ?? '')
    process.stderr.write(r.stderr?.toString() ?? '')
    throw new Error(`${cmd} ${args.join(' ')} failed`)
  }
  return r.stdout.toString()
}

function optimizeGlb(input, output, { textureSize, keepNodes, keepLightmapUvs }) {
  mkdirSync(dirname(output), { recursive: true })
  const args = ['--yes', '@gltf-transform/cli', 'optimize', input, output,
    '--compress', 'draco', '--texture-compress', 'webp', '--texture-size', String(textureSize)]
  if (keepNodes) args.push('--join', 'false')
  if (keepLightmapUvs) args.push('--prune-attributes', 'false', '--simplify', 'false')
  run('npx', args)
}

function extractCollision(colsrc, outputJson) {
  run('node', ['scripts/extract-collision.mjs', colsrc])
  // the extractor writes <colsrc basename>.collision.json next to its input
  const produced = join(dirname(colsrc), `${basename(colsrc, '.glb')}.collision.json`)
  mkdirSync(dirname(outputJson), { recursive: true })
  copyFileSync(produced, outputJson)
}

function processDir(category, dir, rel) {
  for (const file of readdirSync(dir)) {
    const full = join(dir, file)
    if (statSync(full).isDirectory()) {
      processDir(category, full, join(rel, file))
      continue
    }
    const shipsAsIs = (category === 'work' || category === 'park' || category === 'items' || category === 'store') && (file === 'preview.png' || file.endsWith('.layout.json'))
    if (shipsAsIs || ((category === 'houses' || category === 'work') && file === 'lightmap.jpg')) {
      // work buildings / the store ship their preview + layout next to the GLBs
      mkdirSync(join(DEST, category, rel), { recursive: true })
      copyFileSync(full, join(DEST, category, rel, file))
      console.log(`copy       ${category}/${join(rel, file)}`)
      continue
    }
    if (!file.endsWith('.glb')) continue
    if (file.endsWith('.colsrc.glb')) {
      const name = file.replace('.colsrc.glb', '')
      const out = join(DEST, category, rel, `${name}.collision.json`)
      extractCollision(full, out)
      console.log(`collision  ${category}/${join(rel, `${name}.collision.json`)}`)
      continue
    }
    const out = join(DEST, category, rel, file)
    const walkIn = category === 'houses' || category === 'work'
    const keepNodes = file === 'interior.glb' || file === 'fp_arms.glb' || (walkIn && file === 'exterior.glb')
    const keepLightmapUvs = walkIn && file === 'interior.glb'
    optimizeGlb(full, out, { textureSize: TEXTURE_SIZE[category], keepNodes, keepLightmapUvs })
    console.log(`glb        ${category}/${join(rel, file)}  ${(statSync(out).size / 1024).toFixed(0)} KB`)
  }
}

const only = process.argv[2]
for (const category of CATEGORIES) {
  if (only && only !== category) continue
  const dir = join(SRC, category)
  if (!existsSync(dir)) {
    console.warn(`skip ${category}: ${dir} not found (run the Blender build first)`)
    continue
  }
  processDir(category, dir, '')
}
