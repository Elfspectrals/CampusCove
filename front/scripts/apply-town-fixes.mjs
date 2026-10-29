import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TOWN_COL = join(FRONT, 'public/assets/town/town.collision.json')
const UNROTATED_COLLIDER_RE = /^COL_Mailbox_/

const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
let unrotated = 0
for (const c of col.cuboids) {
  if (!UNROTATED_COLLIDER_RE.test(c.name) || (c.qx === 0 && c.qy === 0 && c.qz === 0 && c.qw === 1)) continue
  Object.assign(c, { qx: 0, qy: 0, qz: 0, qw: 1 })
  unrotated++
}
writeFileSync(TOWN_COL, JSON.stringify(col))
console.log(`town.collision.json: ${unrotated} mailbox boxes aligned with their unrotated model`)
