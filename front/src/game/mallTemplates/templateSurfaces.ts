import * as THREE from 'three'
import { CEILING_HEIGHT, parseMaterialMeta, parseTextureMeta, type MaterialMeta, presetArea, type CellArea, type MallTemplate, type MaterialLook, type Surface, type TextureMeta, type TexturePart } from './mallTemplate.ts'
import { hexToRgb, recolorPixels } from './partRecolor.ts'

export const TEXTURES_URL = '/assets/textures'
export const MATERIALS_URL = '/assets/materials'
const materialMetas = new Map<string, Promise<MaterialMeta>>()

function materialMeta(key: string): Promise<MaterialMeta> {
  let meta = materialMetas.get(key)
  if (!meta) {
    meta = fetch(`${MATERIALS_URL}/${key}/material.json`).then(async (response) => {
      if (!response.ok || !response.headers.get('content-type')?.includes('json')) throw new Error(`${MATERIALS_URL}/${key}/material.json: missing`)
      return parseMaterialMeta(await response.json(), key)
    })
    meta.catch(() => materialMetas.delete(key))
    materialMetas.set(key, meta)
  }
  return meta
}

const materialMaps = new Map<string, Promise<THREE.Texture>>()

function materialMap(url: string): Promise<THREE.Texture> {
  let map = materialMaps.get(url)
  if (!map) {
    map = loader.loadAsync(url)
    map.catch(() => materialMaps.delete(url))
    materialMaps.set(url, map)
  }
  return map
}

async function applyLibraryMaterial(material: THREE.MeshStandardMaterial, key: string): Promise<void> {
  const meta = await materialMeta(key)
  if (meta.maps.color && material.userData.flatOnly) throw new Error(`${material.name} has no texture coordinates to take the ${key} material`)
  const previous = material.map
  material.map = meta.maps.color ? (await materialMap(`${MATERIALS_URL}/${key}/${meta.maps.color}`)).clone() : null
  if (material.map) {
    material.map.colorSpace = THREE.SRGBColorSpace
    material.map.magFilter = THREE.NearestFilter
    material.map.wrapS = THREE.RepeatWrapping
    material.map.wrapT = THREE.RepeatWrapping
    if (previous) {
      material.map.flipY = previous.flipY
      material.map.repeat.copy(previous.repeat)
      material.map.offset.copy(previous.offset)
      material.map.channel = previous.channel
    } else {
      material.map.flipY = false
    }
  }
  material.color.set(meta.color)
  material.roughness = meta.roughness
  material.metalness = meta.metalness
}
const PANEL_OFFSET = 0.005

const metas = new Map<string, Promise<TextureMeta>>()
const images = new Map<string, Promise<THREE.Texture>>()
const masks = new Map<string, Promise<Uint8ClampedArray>>()
const loader = new THREE.TextureLoader()

function textureMeta(key: string): Promise<TextureMeta> {
  let meta = metas.get(key)
  if (!meta) {
    meta = fetch(`${TEXTURES_URL}/${key}/texture.json`).then(async (response) => {
      if (!response.ok) throw new Error(`${TEXTURES_URL}/${key}/texture.json: HTTP ${response.status}`)
      return parseTextureMeta(await response.json(), key)
    })
    meta.catch(() => metas.delete(key))
    metas.set(key, meta)
  }
  return meta
}

function textureColorUrl(meta: TextureMeta): string {
  return `${TEXTURES_URL}/${meta.key}/${meta.maps.color}`
}

function colorMap(meta: TextureMeta): Promise<THREE.Texture> {
  const url = textureColorUrl(meta)
  let image = images.get(url)
  if (!image) {
    image = loader.loadAsync(url).then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.magFilter = THREE.NearestFilter
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.RepeatWrapping
      return texture
    })
    image.catch(() => images.delete(url))
    images.set(url, image)
  }
  return image
}

interface PanelFrame {
  width: number
  height: number
  position: THREE.Vector3
  rotation: THREE.Euler
}

function panelFrame(surface: Surface, area: CellArea): PanelFrame {
  const { minX, maxX, minZ } = area
  const width = maxX - minX
  const midX = (minX + maxX) / 2
  const depth = -minZ
  const midZ = minZ / 2
  const midY = CEILING_HEIGHT / 2
  switch (surface) {
    case 'floor':
      return { width, height: depth, position: new THREE.Vector3(midX, PANEL_OFFSET, midZ), rotation: new THREE.Euler(-Math.PI / 2, 0, 0) }
    case 'ceiling':
      return { width, height: depth, position: new THREE.Vector3(midX, CEILING_HEIGHT - PANEL_OFFSET, midZ), rotation: new THREE.Euler(Math.PI / 2, 0, 0) }
    case 'back':
      return { width, height: CEILING_HEIGHT, position: new THREE.Vector3(midX, midY, minZ + PANEL_OFFSET), rotation: new THREE.Euler(0, 0, 0) }
    case 'left':
      return { width: depth, height: CEILING_HEIGHT, position: new THREE.Vector3(minX + PANEL_OFFSET, midY, midZ), rotation: new THREE.Euler(0, Math.PI / 2, 0) }
    case 'right':
      return { width: depth, height: CEILING_HEIGHT, position: new THREE.Vector3(maxX - PANEL_OFFSET, midY, midZ), rotation: new THREE.Euler(0, -Math.PI / 2, 0) }
  }
}

function pixelsOf(image: CanvasImageSource & { width: number; height: number }): Uint8ClampedArray {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('no 2D canvas to recolour a texture')
  context.drawImage(image, 0, 0)
  return context.getImageData(0, 0, canvas.width, canvas.height).data
}

function maskPixels(url: string): Promise<Uint8ClampedArray> {
  let mask = masks.get(url)
  if (!mask) {
    mask = loader.loadAsync(url).then((texture) => pixelsOf(texture.image as HTMLImageElement))
    mask.catch(() => masks.delete(url))
    masks.set(url, mask)
  }
  return mask
}

async function recolorTexture(source: THREE.Texture, maskUrl: string, parts: readonly TexturePart[], colors: Record<string, string>): Promise<THREE.Texture> {
  const image = source.image as HTMLImageElement
  const color = pixelsOf(image)
  const recolored = recolorPixels(color, await maskPixels(maskUrl), parts.map((p) => hexToRgb(p.color)), parts.map((p) => (colors[p.id] ? hexToRgb(colors[p.id]!) : null)))
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  canvas.getContext('2d')!.putImageData(new ImageData(recolored, image.width, image.height), 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.flipY = source.flipY
  texture.colorSpace = source.colorSpace
  texture.wrapS = source.wrapS
  texture.wrapT = source.wrapT
  texture.magFilter = source.magFilter
  texture.minFilter = source.minFilter
  texture.repeat.copy(source.repeat)
  texture.offset.copy(source.offset)
  texture.channel = source.channel
  return texture
}

async function libraryTexture(key: string, metresPerUv: [number, number], partColors: Record<string, string> = {}): Promise<THREE.Texture> {
  const meta = await textureMeta(key)
  const base = await colorMap(meta)
  const recolor = meta.maps.mask && meta.parts && Object.keys(partColors).length > 0
  const map = recolor ? await recolorTexture(base, `${TEXTURES_URL}/${key}/${meta.maps.mask}`, meta.parts!, partColors) : base.clone()
  map.repeat.set(metresPerUv[0] / meta.tileMeters, metresPerUv[1] / meta.tileMeters)
  map.needsUpdate = true
  return map
}

export interface OwnParts {
  maskUrl: string
  parts: TexturePart[]
}

export async function applyLook(material: THREE.MeshStandardMaterial, look: MaterialLook, metresPerUv: [number, number], ownParts?: OwnParts): Promise<void> {
  if (look.material) {
    await applyLibraryMaterial(material, look.material)
    if (look.color) material.color.set(look.color)
  } else if (look.texture) {
    material.map = await libraryTexture(look.texture, metresPerUv, look.parts)
    material.color.set(look.color ?? '#ffffff')
  } else if (look.color) {
    material.map = null
    material.color.set(look.color)
  } else if (look.parts && ownParts && material.map) {
    material.map = await recolorTexture(material.map, ownParts.maskUrl, ownParts.parts, look.parts)
  }
  material.needsUpdate = true
}

async function createPanel(surface: Surface, look: MaterialLook, area: CellArea): Promise<THREE.Mesh> {
  const frame = panelFrame(surface, area)
  const material = new THREE.MeshStandardMaterial({ roughness: 0.9 })
  await applyLook(material, look, [frame.width, frame.height])
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(frame.width, frame.height), material)
  panel.name = `Surface_${surface}`
  panel.position.copy(frame.position)
  panel.rotation.copy(frame.rotation)
  panel.raycast = () => {}
  return panel
}

export async function createSurfacePanels(template: Pick<MallTemplate, 'preset' | 'surfaces'>, area: CellArea = presetArea(template.preset)): Promise<THREE.Group> {
  const group = new THREE.Group()
  group.name = 'CellSurfaces'
  const results = await Promise.allSettled(Object.entries(template.surfaces ?? {}).map(([surface, look]) => createPanel(surface as Surface, look, area)))
  const panels = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (panels.length) group.add(...panels)
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed) {
    disposeSurfacePanels(group)
    throw failed.reason
  }
  return group
}

export function disposeSurfacePanels(group: THREE.Group): void {
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    obj.geometry.dispose()
    const material = obj.material as THREE.MeshStandardMaterial
    material.map?.dispose()
    material.dispose()
  })
}
