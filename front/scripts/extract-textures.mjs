import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const TEXTURES = join(ASSETS, 'textures')
const MALL = 'store/mall/mall.glb'
const COVE_HOME = 'store/cove_home/interior.glb'
const HOUSE = 'houses/house_01/interior.glb'

const PICKS = [
  { key: 'mall_floor', label: 'Mall floor tiles', glb: MALL, material: 'TW_MallFloor', tileMeters: 3 },
  { key: 'mall_floor_upper', label: 'Mall upper floor', glb: MALL, material: 'TW_MallFloorUpper', tileMeters: 3 },
  { key: 'soft_checker', label: 'Soft checker floor', glb: MALL, material: 'TW_MallSoftFloor', tileMeters: 2 },
  { key: 'stone', label: 'Stone', glb: MALL, material: 'TW_MallStone', tileMeters: 2 },
  { key: 'paving', label: 'Paving', glb: MALL, material: 'TW_MallPaving', tileMeters: 2 },
  { key: 'store_floor', label: 'Store floor', glb: COVE_HOME, material: 'IN_Floor', tileMeters: 2 },
  { key: 'kitchen_floor', label: 'Kitchen floor', glb: COVE_HOME, material: 'IN_Dept_kitchen_Floor', tileMeters: 2 },
  { key: 'bathroom_floor', label: 'Bathroom floor', glb: COVE_HOME, material: 'IN_Dept_bathroom_Floor', tileMeters: 2 },
  { key: 'living_floor', label: 'Living room floor', glb: COVE_HOME, material: 'IN_Dept_living_Floor', tileMeters: 2 },
  { key: 'wood_floor', label: 'Wood floor', glb: HOUSE, material: 'IN_house_01_FloorMain', tileMeters: 2 },
  { key: 'floor_tile', label: 'Floor tile', glb: HOUSE, material: 'IN_house_01_FloorTile', tileMeters: 2 },
  { key: 'mall_wall', label: 'Mall wall', glb: MALL, material: 'TW_MallWall', tileMeters: 2 },
  { key: 'brick', label: 'Brick', glb: MALL, material: 'TW_MallBrick', tileMeters: 2 },
  { key: 'facade', label: 'Facade', glb: MALL, material: 'TW_MallOuter', tileMeters: 2 },
  { key: 'plywood', label: 'Plywood', glb: MALL, material: 'TW_MallPlywood', tileMeters: 2 },
  { key: 'shutter', label: 'Shutter', glb: MALL, material: 'TW_MallShutter', tileMeters: 2 },
  { key: 'living_wall', label: 'Living room wall', glb: COVE_HOME, material: 'IN_Dept_living_Wall', tileMeters: 2 },
  { key: 'kids_wall', label: 'Kids room wall', glb: COVE_HOME, material: 'IN_Dept_kids_Wall', tileMeters: 2 },
  { key: 'kitchen_wall', label: 'Kitchen wall', glb: COVE_HOME, material: 'IN_Dept_kitchen_Wall', tileMeters: 2 },
  { key: 'bedroom_wall', label: 'Bedroom wall', glb: COVE_HOME, material: 'IN_Dept_bedroom_Wall', tileMeters: 2 },
  { key: 'house_wall', label: 'House wall', glb: HOUSE, material: 'IN_house_01_WallMain', tileMeters: 2 },
  { key: 'bath_tile', label: 'Bath tile', glb: HOUSE, material: 'IN_house_01_BathTile', tileMeters: 2 },
  { key: 'backsplash', label: 'Backsplash', glb: HOUSE, material: 'IN_house_01_Backsplash', tileMeters: 2 },
  { key: 'wood', label: 'Wood', glb: MALL, material: 'TW_MallWood', tileMeters: 2 },
  { key: 'door_wood', label: 'Door wood', glb: HOUSE, material: 'IN_house_01_DoorWood', tileMeters: 2 },
  { key: 'pallet', label: 'Pallet wood', glb: MALL, material: 'TW_MallPallet', tileMeters: 2 },
  { key: 'slab', label: 'Concrete slab', glb: MALL, material: 'TW_MallSlab', tileMeters: 3 },
  { key: 'store_ceiling', label: 'Store ceiling', glb: COVE_HOME, material: 'IN_Ceiling', tileMeters: 2 },
  { key: 'metal', label: 'Metal', glb: MALL, material: 'TW_MallMetal', tileMeters: 2 },
  { key: 'steel', label: 'Steel', glb: MALL, material: 'TW_MallSteel', tileMeters: 2 },
]

const EXTENSIONS = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })

const documents = new Map()
for (const pick of PICKS) {
  if (!documents.has(pick.glb)) documents.set(pick.glb, await io.read(join(ASSETS, pick.glb)))
  const material = documents.get(pick.glb).getRoot().listMaterials().find((m) => m.getName() === pick.material)
  const texture = material?.getBaseColorTexture()
  if (!texture) throw new Error(`${pick.glb}: no base colour texture on ${pick.material}`)
  const extension = EXTENSIONS[texture.getMimeType()]
  if (!extension) throw new Error(`${pick.glb} ${pick.material}: unsupported ${texture.getMimeType()}`)
  const dir = join(TEXTURES, pick.key)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `color.${extension}`), texture.getImage())
  const meta = { version: 1, key: pick.key, label: pick.label, tileMeters: pick.tileMeters, maps: { color: `color.${extension}` } }
  writeFileSync(join(dir, 'texture.json'), `${JSON.stringify(meta, null, 2)}\n`)
  console.log(`texture    ${pick.key} <- ${pick.glb} ${pick.material}`)
}
