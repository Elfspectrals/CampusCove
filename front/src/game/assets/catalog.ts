/**
 * Central catalog of every 3D asset served from `public/assets/`.
 *
 *   public/assets/
 *     skins/<key>/model.glb, preview.png
 *     houses/<key>/exterior.glb, interior.glb, interior.collision.json, preview.png
 *     town/town.glb, town.collision.json, town.layout.json
 *     showroom/new_nation.glb, new_nation.layout.json
 *
 * Sources: Blender build scripts in `map-src/CampusCove/` (+ `map-src/NewNation/` for the showroom),
 * optimized with `npm run assets:optimize`. Keys / shop codes must match the backend seeders
 * (`ShopSeeder`, `HousingUnitSeeder`, `StarterCosmeticGrantService`).
 */

const ROOT = '/assets'

export type SkinKey =
  | 'campus_classic' | 'street_runner' | 'scholar' | 'explorer' | 'night_owl'
  | 'neon_ronin' | 'street_luxe' | 'astral_oracle'
export type HouseKey =
  | 'house_01' | 'house_02' | 'house_03' | 'house_04' | 'house_05'
  | 'house_06' | 'house_07' | 'house_08' | 'house_09' | 'house_10'

export interface SkinAsset {
  key: SkinKey
  name: string
  /** item_defs.code in the shop (cosmetic, slot "body"). */
  shopCode: string
  modelUrl: string
  previewUrl: string
  /** Granted to every player for free and worn by default. */
  isDefault: boolean
}

export interface HouseAsset {
  key: HouseKey
  name: string
  exteriorUrl: string
  interiorUrl: string
  interiorCollisionUrl: string
  interiorLightmapUrl: string
  previewUrl: string
}

const skin = (key: SkinKey, name: string, shopCode: string, isDefault = false): SkinAsset => ({
  key,
  name,
  shopCode,
  modelUrl: `${ROOT}/skins/${key}/model.glb`,
  previewUrl: `${ROOT}/skins/${key}/preview.png`,
  isDefault,
})

const house = (key: HouseKey, name: string): HouseAsset => ({
  key,
  name,
  exteriorUrl: `${ROOT}/houses/${key}/exterior.glb`,
  interiorUrl: `${ROOT}/houses/${key}/interior.glb`,
  interiorCollisionUrl: `${ROOT}/houses/${key}/interior.collision.json`,
  interiorLightmapUrl: `${ROOT}/houses/${key}/lightmap.jpg`,
  previewUrl: `${ROOT}/houses/${key}/preview.png`,
})

export const SKINS: readonly SkinAsset[] = [
  skin('campus_classic', 'Campus Classic', 'COS_WEAR_BODY_DEFAULT', true),
  skin('street_runner', 'Street Runner', 'COS_WEAR_BODY_STREET_RUNNER'),
  skin('scholar', 'Scholar', 'COS_WEAR_BODY_SCHOLAR'),
  skin('explorer', 'Explorer', 'COS_WEAR_BODY_EXPLORER'),
  skin('night_owl', 'Night Owl', 'COS_WEAR_BODY_NIGHT_OWL'),
  // Premium tier: semi-realistic PBR, rigged, with Idle / Walk / Run clips (built in Blender, see front/scripts/skins/).
  skin('neon_ronin', 'Neon Ronin', 'COS_WEAR_BODY_NEON_RONIN'),
  skin('street_luxe', 'Street Luxe', 'COS_WEAR_BODY_STREET_LUXE'),
  skin('astral_oracle', 'Astral Oracle', 'COS_WEAR_BODY_ASTRAL_ORACLE'),
]

export const DEFAULT_SKIN: SkinAsset = SKINS.find((s) => s.isDefault)!

const HOUSES: readonly HouseAsset[] = [
  house('house_01', 'Maple Cottage'),
  house('house_02', 'Bluebell Bungalow'),
  house('house_03', 'Sunny Nook'),
  house('house_04', 'Mint Villa'),
  house('house_05', 'Brick Townhouse'),
  house('house_06', 'Rose Cottage'),
  house('house_07', 'Terracotta Casa'),
  house('house_08', 'Modern Cube'),
  house('house_09', 'Neon Loft'),
  house('house_10', 'Forest Lodge'),
]

/**
 * Work buildings of the business district (south of the town, through the hedge gate).
 * Built by map-src/CampusCove/build_work_*.py → public/assets/work/<key>/ (see docs/ASSETS_STYLE_GUIDE.md §7).
 * `interior.layout.json` lists the stations (`station_<job>_NN`) that the job gameplay attaches to.
 */
export type WorkKey = 'tech_hub' | 'boutique' | 'cafe'
export type WorkJob = 'dev' | 'commerce' | 'resto'

export interface WorkAsset {
  key: WorkKey
  name: string
  job: WorkJob
  exteriorUrl: string
  interiorUrl: string
  interiorCollisionUrl: string
  interiorLayoutUrl: string
  previewUrl: string
}

const work = (key: WorkKey, name: string, job: WorkJob): WorkAsset => ({
  key,
  name,
  job,
  exteriorUrl: `${ROOT}/work/${key}/exterior.glb`,
  interiorUrl: `${ROOT}/work/${key}/interior.glb`,
  interiorCollisionUrl: `${ROOT}/work/${key}/interior.collision.json`,
  interiorLayoutUrl: `${ROOT}/work/${key}/interior.layout.json`,
  previewUrl: `${ROOT}/work/${key}/preview.png`,
})

const WORKS: readonly WorkAsset[] = [
  work('tech_hub', 'Tech Hub', 'dev'),
  work('boutique', 'Boutique', 'commerce'),
  work('cafe', 'Campus Cafe', 'resto'),
]

export function findWork(key: string | null | undefined): WorkAsset | null {
  return WORKS.find((w) => w.key === key) ?? null
}

/** Used when a house unit has no (or an unknown) model key. */
export const DEFAULT_HOUSE: HouseAsset = HOUSES[0]!

export const SHOWROOM = {
  modelUrl: `${ROOT}/showroom/new_nation.glb`,
  layoutUrl: `${ROOT}/showroom/new_nation.layout.json`,
} as const

export function findHouse(key: string | null | undefined): HouseAsset | null {
  return HOUSES.find((h) => h.key === key) ?? null
}

export function findSkinByCode(code: string | null | undefined): SkinAsset | null {
  if (!code) return null
  const normalized = code.trim().toUpperCase()
  return SKINS.find((s) => s.shopCode === normalized) ?? null
}
