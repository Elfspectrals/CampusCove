// Interior lightmaps: Blender bakes lightmap.jpg (map-src/CampusCove/build_house_lightmaps.py), the game ships
// lightmap.webp. Full resolution is kept: the bakes pack many small UV islands, so halving them blurs the shadows
// (measured: worst PSNR 20 dB at 1024 px). WebP q85 over the JPEG keeps a worst PSNR of 36 dB and is ~40 % lighter.
import sharp from 'sharp'

export const LIGHTMAP_SOURCE = 'lightmap.jpg'
export const LIGHTMAP_SHIPPED = 'lightmap.webp'
const WEBP_QUALITY = 85

export async function encodeLightmap(input, output) {
  await sharp(input).webp({ quality: WEBP_QUALITY, effort: 6 }).toFile(output)
}
