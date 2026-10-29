const BULL_CM = 0.635
const OUTER_BULL_CM = 1.59
const TRIPLE_MIN_CM = 9.9
const TRIPLE_MAX_CM = 10.7
const DOUBLE_MIN_CM = 16.2
const BOARD_CM = 17.0
const SECTOR_DEG = 18
const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]

export function dartsScore(x: number, y: number): number {
  const r = Math.hypot(x, y)
  if (r <= BULL_CM) return 50
  if (r <= OUTER_BULL_CM) return 25
  if (r > BOARD_CM) return 0
  const clockwiseFromTop = (Math.atan2(x, y) * 180) / Math.PI
  const sectorIndex = Math.floor(((clockwiseFromTop + 360 + SECTOR_DEG / 2) % 360) / SECTOR_DEG)
  const sector = SECTORS[sectorIndex]
  if (r >= TRIPLE_MIN_CM && r <= TRIPLE_MAX_CM) return sector * 3
  if (r >= DOUBLE_MIN_CM) return sector * 2
  return sector
}
