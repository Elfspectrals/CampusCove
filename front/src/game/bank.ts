export const ATM_MAX_AMOUNT = 1_000_000

export function parseRecipient(raw: string): { username: string; tag: number } | null {
  const [, username, tag] = /^\s*(.+?)\s*#\s*(\d{1,4})\s*$/.exec(raw) ?? []
  if (username === undefined || tag === undefined) return null
  return { username, tag: Number(tag) }
}

export function parseAmount(raw: string): number | null {
  if (!/^\s*\d+\s*$/.test(raw)) return null
  const amount = Number(raw)
  return amount >= 1 && amount <= ATM_MAX_AMOUNT ? amount : null
}
