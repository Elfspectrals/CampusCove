// Writes the job stations of the open jobs into world.manifest.json (`jobs.stations`, world coordinates), read by
// the front (game/jobs/stations.ts) and the realtime server (socket/src/world.ts). Source of truth: each work
// building's interior.layout.json (map-src/CampusCove/build_work_<key>.py). docs/JOBS.md.
//   npm run jobs:apply   (make jobs-apply)
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')

// Jobs players can take (each also needs its entry in backend/config/jobs.php). Add a job here when it opens.
const OPEN_JOBS = new Set(['dev'])

const round3 = (n) => Math.round(n * 1000) / 1000
const round4 = (n) => Math.round(n * 10000) / 10000

// interior local -> world, as scripts/apply-pub.mjs: interiorOffset, then the building's yaw and position
function toWorldFor(building) {
  const [ox, oy, oz] = building.interiorOffset ?? [0, 0, 0]
  const [px, py, pz] = building.position
  const yaw = building.rotationY ?? 0
  return {
    point: ([lx, ly, lz]) => {
      const x = lx + ox
      const z = lz + oz
      return [round3(px + x * Math.cos(yaw) + z * Math.sin(yaw)), round3(py + ly + oy), round3(pz - x * Math.sin(yaw) + z * Math.cos(yaw))]
    },
    yaw: (y) => round4((((y + yaw) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)),
  }
}

const manifest = JSON.parse(readFileSync(WORLD_MANIFEST, 'utf8'))
const works = manifest.zones.flatMap((zone) => zone.buildings ?? []).filter((b) => b.kind === 'work' && OPEN_JOBS.has(b.job))
const stations = []
for (const building of works) {
  const layoutFile = join(ASSETS, 'work', building.key, 'interior.layout.json')
  if (!existsSync(layoutFile)) {
    console.error(`Missing ${layoutFile} - run "npm run assets:optimize -- work" first.`)
    process.exit(1)
  }
  const layout = JSON.parse(readFileSync(layoutFile, 'utf8'))
  const toWorld = toWorldFor(building)
  for (const station of layout.stations ?? []) {
    if (station.job !== building.job) continue
    if (!Number.isFinite(station.seatHeight)) {
      console.error(`${building.key}/${station.id} has no seatHeight: rebuild the interior with map-src/CampusCove/build_work_${building.key}.py`)
      process.exit(1)
    }
    if (stations.some((s) => s.id === station.id)) {
      console.error(`Duplicate job station id ${station.id}`)
      process.exit(1)
    }
    const [x, floorY, z] = toWorld.point(station.position)
    stations.push({
      id: station.id,
      job: station.job,
      building: building.key,
      seat: [x, round3(floorY + station.seatHeight), z],
      seatHeight: station.seatHeight,
      yaw: toWorld.yaw(station.yaw),
      lookAt: toWorld.point(station.lookAt),
    })
  }
}

manifest.jobs = { stations }
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: ${stations.length} job stations (${[...OPEN_JOBS].join(', ')}) in ${works.map((b) => b.key).join(', ')}`)
