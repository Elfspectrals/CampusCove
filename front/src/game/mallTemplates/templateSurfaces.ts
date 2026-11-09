import * as THREE from 'three'
import { CEILING_HEIGHT, parseTextureMeta, presetArea, type CellArea, type MallTemplate, type MaterialLook, type Surface, type TextureMeta } from './mallTemplate.ts'

export const TEXTURES_URL = '/assets/textures'
const PANEL_OFFSET = 0.005

const metas = new Map<string, Promise<TextureMeta>>()
const images = new Map<string, Promise<THREE.Texture>>()
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

export async function libraryTexture(key: string, metresPerUv: [number, number]): Promise<THREE.Texture> {
  const meta = await textureMeta(key)
  const map = (await colorMap(meta)).clone()
  map.repeat.set(metresPerUv[0] / meta.tileMeters, metresPerUv[1] / meta.tileMeters)
  map.needsUpdate = true
  return map
}

export async function applyLook(material: THREE.MeshStandardMaterial, look: MaterialLook, metresPerUv: [number, number]): Promise<void> {
  if (look.texture) {
    material.map = await libraryTexture(look.texture, metresPerUv)
    material.color.set(look.color ?? '#ffffff')
  } else if (look.color) {
    material.map = null
    material.color.set(look.color)
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
  group.add(...panels)
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
