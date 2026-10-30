import { CHALLENGE_FLOOR_TOLERANCE, CHALLENGE_REACH } from '../gameRoomConstants.ts'
import type { PubSeat } from '../world/worldManifest.ts'
import { isStool } from './seats.ts'

/** Drink Fast challenges between two players on bar stools (socket/src/pubGames.ts re-checks all of it). */

export type ChallengeResultReason = 'declined' | 'expired' | 'busy' | 'cancelled'

/** Both on stools of the same floor, at most CHALLENGE_REACH apart. */
export function canChallenge(mine: Pick<PubSeat, 'kind' | 'position'> | null, theirs: Pick<PubSeat, 'kind' | 'position'> | null): boolean {
  if (!mine || !theirs || !isStool(mine) || !isStool(theirs)) return false
  const [ax, ay, az] = mine.position
  const [bx, by, bz] = theirs.position
  return Math.abs(ay - by) <= CHALLENGE_FLOOR_TOLERANCE && Math.hypot(ax - bx, az - bz) <= CHALLENGE_REACH
}

/** Whole seconds left before `expiresAt` (ms epoch), never negative. */
export function secondsLeft(expiresAt: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAt - now) / 1000))
}

/** What the challenger reads once the target answered (or did not). */
export function challengeResultText(name: string, accepted: boolean, reason?: ChallengeResultReason): string {
  if (accepted) return `${name} accepted! Pints up…`
  switch (reason) {
    case 'expired':
      return `No answer from ${name}.`
    case 'busy':
      return `${name} is busy right now.`
    case 'cancelled':
      return 'Challenge cancelled.'
    default:
      return `${name} declined.`
  }
}

const CHALLENGE_ERRORS: Record<string, string> = {
  challenge_not_on_stool: 'Sit on a bar stool to challenge someone.',
  challenge_target_unavailable: 'They can’t be challenged right now (they must sit on a bar stool).',
  challenge_too_far: 'Too far: sit within 4 m of them to challenge.',
  race_in_progress: 'A race is already on. Wait for it to end.',
  challenge_pending: 'A challenge is already waiting for an answer.',
  challenge_cooldown: 'Give it a few seconds before challenging again.',
}

/** A friendly line for a challenge `pub_error` code, or null when the code is not about challenges. */
export function challengeErrorText(code: string): string | null {
  return CHALLENGE_ERRORS[code] ?? null
}
