// Widens the walkable world to a square of +-HALF metres around the town centre, so planned zones fit inside it.
// Idempotent, and it only ever grows the bounds (like the other apply-*.mjs scripts).
//
//   node scripts/apply-world-bounds.mjs          (default half-size: 500 m, a 1 km x 1 km world)
//   node scripts/apply-world-bounds.mjs 800      (custom half-size)
//
// 1. town.collision.json : bounds (the game puts its invisible border walls on them)
// 2. world.manifest.json : bounds (read by the game, the planner and the socket's out_of_world check;
//                          restart the socket container to pick them up)
// 3. town.glb            : re-centres and widens the skyline ring and the ground disc on the new bounds.
//                          Past the fog distance (250 m) both melt into the sky colour, so the edge reads as haze.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fitTownBackdrop } from './lib/worldBackdrop.mjs'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const TOWN_GLB = join(ASSETS, 'town/town.glb')
const DEFAULT_HALF = 500

const half = Number(process.argv[2] ?? DEFAULT_HALF)
if (!Number.isFinite(half) || half <= 0) {
  console.error(`Invalid half-size "${process.argv[2]}" - expected a number of metres, e.g. 500.`)
  process.exit(1)
}

function grow(bounds) {
  return {
    minX: Math.min(bounds.minX, -half),
    maxX: Math.max(bounds.maxX, half),
    minZ: Math.min(bounds.minZ, -half),
    maxZ: Math.max(bounds.maxZ, half),
  }
}

// ---------------------------------------------------------------- 1. collision
const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
col.bounds = grow(col.bounds)
writeFileSync(TOWN_COL, JSON.stringify(col))
console.log(`town.collision.json: bounds ${JSON.stringify(col.bounds)}`)

// ---------------------------------------------------------------- 2. manifest
const manifest = JSON.parse(readFileSync(WORLD_MANIFEST, 'utf8'))
manifest.bounds = grow(manifest.bounds)
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: bounds ${JSON.stringify(manifest.bounds)}`)

// ---------------------------------------------------------------- 3. skyline ring + ground disc
const backdrop = await fitTownBackdrop(TOWN_GLB, manifest.bounds)
console.log(`town.glb: Sky_Ring radius ${backdrop.skyRadius.toFixed(1)} and Ground radius ${backdrop.groundRadius.toFixed(1)} around (${backdrop.cx.toFixed(1)}, ${backdrop.cz.toFixed(1)})`)
