/**
 * Central catalog of every 3D asset served from `public/assets/`.
 *
 *   public/assets/
 *     skins/<key>/model.glb, preview.png, fp_arms.glb
 *     houses/<key>/exterior.glb, interior.glb, interior.collision.json, preview.png
 *     town/town.glb, town.collision.json, town.layout.json
 *     showroom/new_nation.glb, new_nation.layout.json
 *     decor/<key>/model.glb, preview.png               (furniture, sold in the Cove Home store)
 *     store/cove_home/exterior.glb, interior.glb, interior.collision.json, interior.layout.json
 *     store/park/park.glb, park.layout.json
 *     store/cove_threads/..., store/threads_site/threads_site.glb   (clothing store, same files as cove_home)
 *     wear/base/model.glb, wear/<slot>/<key>/model.glb, preview.png, wear/top/<key>/fp_arms.glb
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
  fpArmsUrl: string
  /** Granted to every player for free and worn by default. */
  isDefault: boolean
}

export interface HouseAsset {
  key: HouseKey
  name: string
  exteriorUrl: string
  interiorUrl: string
  interiorCollisionUrl: string
  interiorLayoutUrl: string
  interiorLightmapUrl: string
  previewUrl: string
}

const skin = (key: SkinKey, name: string, shopCode: string, isDefault = false): SkinAsset => ({
  key,
  name,
  shopCode,
  modelUrl: `${ROOT}/skins/${key}/model.glb`,
  previewUrl: `${ROOT}/skins/${key}/preview.png`,
  fpArmsUrl: `${ROOT}/skins/${key}/fp_arms.glb`,
  isDefault,
})

const house = (key: HouseKey, name: string): HouseAsset => ({
  key,
  name,
  exteriorUrl: `${ROOT}/houses/${key}/exterior.glb`,
  interiorUrl: `${ROOT}/houses/${key}/interior.glb`,
  interiorCollisionUrl: `${ROOT}/houses/${key}/interior.collision.json`,
  interiorLayoutUrl: `${ROOT}/houses/${key}/interior.layout.json`,
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

type WearTopKey = 'basic' | 'tee' | 'tank' | 'hoodie' | 'varsity' | 'sweater'

const WEAR_TOPS: readonly WearTopKey[] = ['basic', 'tee', 'tank', 'hoodie', 'varsity', 'sweater']

export const WEAR_BASE_MODEL_URL = `${ROOT}/wear/base/model.glb`

const WEAR_BARE_FP_ARMS_URL = `${ROOT}/wear/bare/fp_arms.glb`

export function wearTopFpArmsUrl(topModelUrl: string | null): string {
  if (topModelUrl === null) return WEAR_BARE_FP_ARMS_URL
  const key = WEAR_TOPS.find((k) => `${ROOT}/wear/top/${k}/model.glb` === topModelUrl)
  if (!key) throw new Error(`No first-person arms for the top model ${topModelUrl}`)
  return `${ROOT}/wear/top/${key}/fp_arms.glb`
}

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
export type WorkKey = 'tech_hub' | 'boutique' | 'cafe' | 'clinic' | 'pub'
export type WorkJob = 'dev' | 'commerce' | 'resto' | 'medic' | 'barman'

export interface WorkAsset {
  key: WorkKey
  name: string
  job: WorkJob
  exteriorUrl: string
  exteriorCollisionUrl: string
  interiorUrl: string
  interiorCollisionUrl: string
  interiorLightmapUrl: string
  interiorLayoutUrl: string
  previewUrl: string
}

const work = (key: WorkKey, name: string, job: WorkJob): WorkAsset => ({
  key,
  name,
  job,
  exteriorUrl: `${ROOT}/work/${key}/exterior.glb`,
  exteriorCollisionUrl: `${ROOT}/work/${key}/exterior.collision.json`,
  interiorUrl: `${ROOT}/work/${key}/interior.glb`,
  interiorCollisionUrl: `${ROOT}/work/${key}/interior.collision.json`,
  interiorLightmapUrl: `${ROOT}/work/${key}/lightmap.jpg`,
  interiorLayoutUrl: `${ROOT}/work/${key}/interior.layout.json`,
  previewUrl: `${ROOT}/work/${key}/preview.png`,
})

const WORKS: readonly WorkAsset[] = [
  work('tech_hub', 'Tech Hub', 'dev'),
  work('boutique', 'Boutique', 'commerce'),
  work('cafe', 'Campus Cafe', 'resto'),
  work('clinic', 'Cove Clinic', 'medic'),
  work('pub', 'The Salty Shamrock', 'barman'),
]

export function findWork(key: string | null | undefined): WorkAsset | null {
  return WORKS.find((w) => w.key === key) ?? null
}

/**
 * Cove Home, the furniture store east of the business-district plaza: furniture is bought by walking its
 * showroom (no web shop). Built by map-src/CampusCove/build_store.py + build_store_ext.py → public/assets/store/.
 * Walked into like the work buildings (public door, never locked; world.manifest.json zone `retail_park`).
 * `interior.layout.json` lists the displays (decor model + price tag per shop code), see `StoreLayout`.
 */
export const COVE_HOME = {
  key: 'cove_home',
  name: 'Cove Home',
  exteriorUrl: `${ROOT}/store/cove_home/exterior.glb`,
  exteriorCollisionUrl: `${ROOT}/store/cove_home/exterior.collision.json`,
  interiorUrl: `${ROOT}/store/cove_home/interior.glb`,
  interiorCollisionUrl: `${ROOT}/store/cove_home/interior.collision.json`,
  interiorLightmapUrl: `${ROOT}/store/cove_home/lightmap.jpg`,
  interiorLayoutUrl: `${ROOT}/store/cove_home/interior.layout.json`,
} as const

export const COVE_THREADS = {
  key: 'cove_threads',
  name: 'Cove Threads',
  exteriorUrl: `${ROOT}/store/cove_threads/exterior.glb`,
  exteriorCollisionUrl: `${ROOT}/store/cove_threads/exterior.collision.json`,
  interiorUrl: `${ROOT}/store/cove_threads/interior.glb`,
  interiorCollisionUrl: `${ROOT}/store/cove_threads/interior.collision.json`,
  interiorLightmapUrl: `${ROOT}/store/cove_threads/lightmap.jpg`,
  interiorLayoutUrl: `${ROOT}/store/cove_threads/interior.layout.json`,
  /** map-src/CampusCove/build_threads_music.py */
  musicUrl: `${ROOT}/music/cove_threads.mp3`,
} as const

/**
 * The Cove Parkview Mall anchors (docs/MALL.md), west of the clinic: Northline sells clothes with the Cove Threads
 * layout contract, Hearth & Hollow sells decor and GreenCart sells food with the Cove Home contract. Built by
 * map-src/CampusCove/build_{northline,hearth,greencart}.py → public/assets/store/<key>/ (same files as cove_home).
 */
const mallStore = <K extends string>(key: K, name: string) => ({
  key,
  name,
  exteriorUrl: `${ROOT}/store/${key}/exterior.glb`,
  exteriorCollisionUrl: `${ROOT}/store/${key}/exterior.collision.json`,
  interiorUrl: `${ROOT}/store/${key}/interior.glb`,
  interiorCollisionUrl: `${ROOT}/store/${key}/interior.collision.json`,
  interiorLightmapUrl: `${ROOT}/store/${key}/lightmap.jpg`,
  interiorLayoutUrl: `${ROOT}/store/${key}/interior.layout.json`,
}) as const

export const NORTHLINE = mallStore('northline', 'Northline')
export const HEARTH_HOLLOW = mallStore('hearth_hollow', 'Hearth & Hollow')
export const GREENCART = mallStore('greencart', 'GreenCart')
/** The shops that took over a mall cell: hardware (decor), sweets (consumables) and sportswear (wear pieces). */
export const CRISPINS_HARDWARE = mallStore('crispins_hardware', "Crispin's Hardware")
export const CANDY_CLOUD = mallStore('candy_cloud', 'Candy Cloud')
export const SUMMIT_SPORTS = mallStore('summit_sports', 'Summit Sports')

const STORES = [COVE_HOME, COVE_THREADS, NORTHLINE, HEARTH_HOLLOW, GREENCART, CRISPINS_HARDWARE, CANDY_CLOUD, SUMMIT_SPORTS] as const

export type StoreKey = (typeof STORES)[number]['key']

export function findStore(key: string | null | undefined): (typeof STORES)[number] | null {
  return STORES.find((s) => s.key === key) ?? null
}

/** Survival (map-src/CampusCove/build_food_items.py): the first-person wrist watch and the town drinking fountain. */
export const SURVIVAL_WATCH_URL = `${ROOT}/items/tools/watch/model.glb`
export const DRINKING_FOUNTAIN_URL = `${ROOT}/park/drinking_fountain/model.glb`

const CONSUMABLE_FOLDERS: ReadonlyArray<[prefix: string, folder: string]> = [
  ['food_', 'food'],
  ['candy_', 'sweets'],
  ['med_', 'medical'],
  ['drink_', 'drinks'],
]

function consumableFolder(code: string): string {
  const match = CONSUMABLE_FOLDERS.find(([prefix]) => code.startsWith(prefix))
  if (!match) throw new Error(`No asset folder for consumable code "${code}"`)
  const [prefix, folder] = match
  return `${ROOT}/items/${folder}/${code.slice(prefix.length)}`
}

/**
 * Preview picture of a consumable (backend FoodCatalog): `food_<key>` -> items/food/<key>/preview.png,
 * `candy_<key>` -> items/sweets/<key>/preview.png, `med_<key>` -> items/medical/<key>/preview.png,
 * `drink_<key>` -> items/drinks/<key>/preview.png.
 */
export function consumablePreviewUrl(code: string): string {
  return `${consumableFolder(code)}/preview.png`
}

/** The model of a consumable: on the GreenCart and Candy Cloud shelves, and on the pub bar while the barman pours it. */
export function consumableModelUrl(code: string): string {
  return `${consumableFolder(code)}/model.glb`
}

/** Furniture model shown in the store and placed in houses: public/assets/decor/<key>/model.glb. */
export function decorModelUrl(key: string): string {
  return `${ROOT}/decor/${key}/model.glb`
}

/** Shape of `store/cove_home/interior.layout.json` (written by build_store.py). */
export interface StoreLayout {
  version: number
  key: string
  name: string
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  departments: Array<{ id: string; label: string; color: string; sign: [number, number, number] }>
  displays: StoreDisplay[]
  /** Stores that sell through a basket: where the customer stands to pay, and the cashier behind it. */
  counter?: [number, number, number]
  clerk?: { position: [number, number, number]; yaw: number }
}

export interface StoreDisplay {
  /** decor asset key (public/assets/decor/<key>/). */
  key: string
  /** item_defs.code of the item sold here. */
  code: string
  department: string
  description: string
  /** Where the model stands (y > 0: on a plinth) and its yaw (rotation.y; the model's front faces the route). */
  position: [number, number, number]
  yaw: number
  /** Model bounding size [w, h, d] in metres. */
  size: [number, number, number]
  /** Copies lined up on the spot as [columns, rows] (small goods on a shelf); one model when omitted. */
  stack?: [number, number]
  /** Price-tag board (centre) at the edge of the route. */
  tag: { position: [number, number, number]; yaw: number }
}

export const SHOWROOM = {
  modelUrl: `${ROOT}/showroom/new_nation.glb`,
  layoutUrl: `${ROOT}/showroom/new_nation.layout.json`,
} as const

export function findHouse(key: string | null | undefined): HouseAsset | null {
  return HOUSES.find((h) => h.key === key) ?? null
}
