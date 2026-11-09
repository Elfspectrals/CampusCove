export type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export function recolorPixels(color: Uint8ClampedArray, mask: Uint8ClampedArray, means: readonly Rgb[], targets: readonly (Rgb | null)[]): Uint8ClampedArray<ArrayBuffer> {
  if (color.length !== mask.length) throw new Error(`colour map and mask differ in size (${color.length / 4} vs ${mask.length / 4} pixels)`)
  const out = new Uint8ClampedArray(color.length)
  out.set(color)
  for (let i = 0; i < color.length; i += 4) {
    const part = mask[i]!
    const target = targets[part]
    const mean = means[part]
    if (!target || !mean) continue
    for (let c = 0; c < 3; c++) out[i + c] = (color[i + c]! * target[c]!) / Math.max(1, mean[c]!)
  }
  return out
}
