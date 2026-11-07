---
paths:
  - "socket/**"
---

# Socket rules (Colyseus)

- Use the `socket-message` skill for a new client message or broadcast.
- The socket is the authority on live state: position, reach, cooldowns, action durations, game timers and random rolls. Start and end times come from the server clock; the client may only be late, never early.
- Treat every message field as hostile: validate type and range, check reach and zone, rate-limit.
- Rewards are requested from Laravel through `backend.ts` on the `realtime` routes, with the outcome the socket computed, never a number the client sent.
- Keep tunable constants in one module (`pubConstants.ts` style) and cover game logic with a sibling `*.test.ts`.
