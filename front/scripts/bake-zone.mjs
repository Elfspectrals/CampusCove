import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BUILD_DIR = resolve(FRONT, '../map-src/CampusCove')
const ZONES = {
  orchard: { build: 'build_orchard_site.py', category: 'park', folder: 'orchard_site', apply: 'apply-orchard.mjs' },
  farm: { build: 'build_farm_site.py', category: 'park', folder: 'farm_site', apply: 'apply-farm.mjs' },
}

const key = process.argv[2]
const zone = ZONES[key]
if (!zone) {
  console.error(`Usage: npm run zone:bake -- <zone>, zones with a bake: ${Object.keys(ZONES).join(', ')}`)
  process.exit(1)
}

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { cwd: FRONT, stdio: 'inherit' })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`${cmd} exited with ${r.status}`)
}

const build = join(BUILD_DIR, zone.build)
run(process.env.BLENDER ?? 'blender', ['--background', '--factory-startup', '--python-exit-code', '1', '--python-expr', `p = ${JSON.stringify(build)}; exec(open(p).read(), {"__file__": p})`])
run('node', ['scripts/optimize-assets.mjs', zone.category, zone.folder])
run('node', [join('scripts', zone.apply)])

const manifestPath = join(FRONT, 'public/assets/world.manifest.json')
const site = JSON.parse(readFileSync(join(FRONT, 'public/assets', zone.category, zone.folder, `${zone.folder}.layout.json`), 'utf8'))
if (!Array.isArray(site.crops)) throw new Error(`${zone.folder}.layout.json has no crops list, rebuild ${zone.build}`)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.crops = [...(manifest.crops ?? []).filter((plant) => plant.zone !== key), ...site.crops.map((plant) => ({ zone: key, ...plant }))]
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: ${site.crops.length} crop plants in ${key}`)
