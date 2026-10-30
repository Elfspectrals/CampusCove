/**
 * Esc and the pause menu.
 *
 * Losing the pointer lock opens the menu (the browser frees the mouse on Esc itself). Esc then toggles the
 * menu: closed = back to the game, the lock is asked again on the next click or key, because browsers never
 * count Escape as a user gesture and refuse a new lock for ~1 s after the player left it with Esc.
 */

/**
 * Some browsers (Firefox) also deliver the Esc that released the lock. Its keydown was created before (or
 * right as) the lock was lost, so compare the event's own timestamp, not the time it is handled: a lag spike
 * must not swallow a real second press, and nobody presses Esc twice within this window.
 */
export const LOCK_RELEASE_ESCAPE_MS = 60

/** Retry the lock at most this often while the player is back in the game without it (held keys repeat). */
export const LOCK_RETRY_MS = 250

/** True when this Escape keydown is the one that released the pointer lock and must not toggle the menu. */
export function isLockReleaseEscape(keyTimeStamp: number, unlockedAt: number): boolean {
  return keyTimeStamp - unlockedAt < LOCK_RELEASE_ESCAPE_MS
}
