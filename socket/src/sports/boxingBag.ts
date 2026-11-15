import type { Combo, PunchKind } from './boxingBout.ts'

export interface BagRules {
  roundSec: number
  windowMs: number
  leaveM: number
  pointsPerPunch: number
  streakForDouble: number
}

export interface BagRound {
  accountId: number
  sessionId: string
  bag: number
  endsAt: number
  combo: Combo
  index: number
  lastAt: number | null
  score: number
  combos: number
  streak: number
}

export type BagOutcome = 'hit' | 'combo' | 'wrong' | 'late' | 'over'

export function nextCombo(list: readonly Combo[], previous: Combo | null, random: () => number): Combo {
  const choices = list.length > 1 ? list.filter((c) => c !== previous) : list
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]
}

export function startBagRound(who: { accountId: number, sessionId: string }, bag: number, now: number, rules: BagRules, list: readonly Combo[], random: () => number): BagRound {
  return { ...who, bag, endsAt: now + rules.roundSec * 1000, combo: nextCombo(list, null, random), index: 0, lastAt: null, score: 0, combos: 0, streak: 0 }
}

export function bagPunch(round: BagRound, kind: PunchKind, now: number, rules: BagRules, list: readonly Combo[], random: () => number): BagOutcome {
  if (now >= round.endsAt) return 'over'
  const late = round.index > 0 && round.lastAt !== null && now - round.lastAt > rules.windowMs
  round.lastAt = now
  if (late) round.index = 0
  if (kind !== round.combo.sequence[round.index]) {
    round.index = kind === round.combo.sequence[0] ? 1 : 0
    round.streak = 0
    return late ? 'late' : 'wrong'
  }
  round.index += 1
  if (late) round.streak = 0
  if (round.index < round.combo.sequence.length) return late ? 'late' : 'hit'
  round.score += round.combo.sequence.length * rules.pointsPerPunch * (round.streak >= rules.streakForDouble ? 2 : 1)
  round.combos += 1
  round.streak += 1
  round.combo = nextCombo(list, round.combo, random)
  round.index = 0
  return 'combo'
}

export function bagRoundOver(round: BagRound, player: { x: number, z: number } | null, bag: { x: number, z: number }, now: number, rules: BagRules): boolean {
  return now >= round.endsAt || player === null || Math.hypot(player.x - bag.x, player.z - bag.z) > rules.leaveM
}
