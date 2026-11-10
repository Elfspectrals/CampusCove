import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { WorldManifest } from '../src/game/world/worldManifest.ts'
import { parseZoneDecor, parseZoneDecorIndex, withStaff, zonePriceFile } from '../src/game/zoneDecor/zoneDecor.ts'

const assets = new URL('../public/assets/', import.meta.url)
const backendZones = new URL('../../backend/resources/zones/', import.meta.url)
const readJson = (url: URL): unknown => JSON.parse(readFileSync(url, 'utf8'))

const manifestUrl = new URL('world.manifest.json', assets)
const manifest = readJson(manifestUrl) as WorldManifest
let staffed = manifest
mkdirSync(backendZones, { recursive: true })
for (const key of parseZoneDecorIndex(readJson(new URL('zones/index.json', assets))).zones) {
  const zone = manifest.zones.find((z) => z.key === key)
  if (!zone) throw new Error(`zones/index.json: zone ${key} is not in world.manifest.json`)
  const decor = parseZoneDecor(readJson(new URL(`zones/${key}.json`, assets)), zone, null, null, null)
  const prices = zonePriceFile(decor)
  writeFileSync(new URL(`${key}.json`, backendZones), `${JSON.stringify(prices, null, 2)}\n`)
  console.log(`backend/resources/zones/${key}.json  ${Object.keys(prices.prices).length} item(s) for sale`)
  staffed = withStaff(staffed, decor)
}
if (JSON.stringify(staffed) !== JSON.stringify(manifest)) {
  writeFileSync(manifestUrl, `${JSON.stringify(staffed, null, 2)}\n`)
  console.log('world.manifest.json  staff positions copied from the zone files')
}
