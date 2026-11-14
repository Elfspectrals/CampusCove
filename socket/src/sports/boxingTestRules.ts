import { readFileSync } from 'node:fs'

export function boxingRulesJson(): Record<string, unknown> {
  const raw = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/boxing.json', import.meta.url), 'utf8'))
  return {
    ...raw,
    ring: { ...raw.ring, centre: { x: 0, y: 1.1, z: 0 }, halfM: 3.05 },
    coach: { x: -4.2, z: 4.2 },
    punchBags: [{ x: 6, z: 0 }, { x: 6, z: 3 }],
    corners: { red: { x: -2.45, y: 1.1, z: -2.45 }, blue: { x: 2.45, y: 1.1, z: 2.45 } },
    exits: { red: { x: -1, y: 0.2, z: 5.5 }, blue: { x: 1.6, y: 0.2, z: 5.5 } }
  }
}
