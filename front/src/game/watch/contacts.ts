const NEARBY_RADIUS_M = 30

export interface ContactFriend {
  accountId: string
  name: string
}

export interface ContactRequest {
  accountId: string
  name: string
  incoming: boolean
}

export interface ContactPlayer {
  sessionId: string
  accountId: string
  pseudo: string
  distance: number
}

export type ContactRow =
  | { kind: 'request'; accountId: string; name: string }
  | { kind: 'friendHere'; accountId: string; sessionId: string; name: string; distance: number }
  | { kind: 'stranger'; sessionId: string; pseudo: string; distance: number; asked: boolean }
  | { kind: 'friendAway'; accountId: string; name: string }

export function contactRows(friends: readonly ContactFriend[], requests: readonly ContactRequest[], players: readonly ContactPlayer[]): ContactRow[] {
  const friendIds = new Set(friends.map((f) => f.accountId))
  const incomingIds = new Set(requests.filter((r) => r.incoming).map((r) => r.accountId))
  const askedIds = new Set(requests.filter((r) => !r.incoming).map((r) => r.accountId))
  const playerOf = new Map(players.map((p) => [p.accountId, p]))
  const byDistance = <T extends { distance: number }>(rows: T[]) => rows.sort((a, b) => a.distance - b.distance)

  const incoming: ContactRow[] = requests.filter((r) => r.incoming).map((r) => ({ kind: 'request', accountId: r.accountId, name: r.name }))
  const here = byDistance(
    friends.flatMap((f) => {
      const player = playerOf.get(f.accountId)
      return player ? [{ kind: 'friendHere' as const, accountId: f.accountId, sessionId: player.sessionId, name: f.name, distance: player.distance }] : []
    }),
  )
  const strangers = byDistance(
    players
      .filter((p) => p.distance <= NEARBY_RADIUS_M && !friendIds.has(p.accountId) && !incomingIds.has(p.accountId))
      .map((p) => ({ kind: 'stranger' as const, sessionId: p.sessionId, pseudo: p.pseudo, distance: p.distance, asked: askedIds.has(p.accountId) })),
  )
  const away: ContactRow[] = friends.filter((f) => !playerOf.has(f.accountId)).map((f) => ({ kind: 'friendAway', accountId: f.accountId, name: f.name }))
  return [...incoming, ...here, ...strangers, ...away]
}
