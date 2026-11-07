---
name: playtest-game
description: Play CampusCove's /game in the built-in browser pane to prove a change works — throwaway test player, faking pointer lock, walking and turning by script, a second player for multiplayer, collision overlay, logs and the code gates. Use after any change to the game, socket, assets or game-facing API, before reporting it done.
---

# Playtest CampusCove

## 0. Stack up

```bash
docker ps --format '{{.Names}} {{.Status}}'      # campuscove-front / -backend / -socket / -db
make up                                          # if not running
```

Front http://localhost:5173 (Vite HMR), API http://localhost:8000/api, socket :3000 (`node --watch`, restarts on
save), Postgres :5432. New migration → `make migrate`. Seeds → `make seed`.

## 1. Playtest accounts (local only)

Use the two fixed accounts instead of creating one per session. `make playtest-accounts` creates them on the
first run and resets them on every later run: admin, full outfit, 5,000 coins, full health / hunger / thirst,
and older than the 72 h trade limit. E-mails and the password are in
`backend/database/seeders/PlaytestAccountSeeder.php` (`ACCOUNTS`, `PASSWORD`); read them from there and do not
repeat the password in chat. Run the reset before each playtest: a player left in the world keeps starving
between sessions.

Open the pane with `preview_start {url: "http://localhost:5173/"}` (the Docker front is already serving; do not
start a second Vite). Then sign in from the page with `javascript_tool`, `EMAIL` and `PASSWORD` taken from the
seeder:

```js
const r = await fetch('http://localhost:8000/api/login', { method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
const d = await r.json()
if (r.ok) localStorage.setItem('campus_cove_auth', JSON.stringify({ user: d.user, token: d.token }))
;({ status: r.status, account_id: d.user?.account_id })
```

Then `navigate` to `/game` and wait ~5 s for the town to load. Create a fresh account through `/api/register`
only when the test is about new accounts (welcome bonus, the 72 h trade rule).

## 2. Drive the game

Real pointer lock never engages in the pane (the Play overlay stays). Fake it — movement, mouse look and
left-click interactions are gated on `document.pointerLockElement === canvas` (`useGameMovement.ts`):

```js
const c = document.querySelector('canvas')
Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => c })
document.dispatchEvent(new Event('pointerlockchange'))
```

Input listeners are on `document`:
- Walk: `document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))` … then `keyup`. Codes are in
  `config/keybindings.ts` (WASD/ZQSD, G or right click interact, left click punch, E inventory, K keys,
  T watch (Admin teleport), X put away, R rotate, Digit1-9 hotbar, **C collision overlay**).
- Turn: `document.dispatchEvent(new MouseEvent('mousemove', { movementX: 600, movementY: 0 }))` (~90°); send
  several small moves rather than one big one.
- Doors, seats, counters: aim at them and press `G` (interact takes whatever prompt is in the crosshair, so a
  stool can win over a door). The Play overlay can come back after an interaction: click `Play` and fake the
  lock again before the next input.
- Position: the HUD shows `XYZ x, y, z` — read it from the DOM instead of guessing from screenshots.

When the pane is **hidden** (`tabs_context` says so) `requestAnimationFrame` only advances on screenshots:
hold a key, take 2–3 small screenshots (`scale: 0.3`), then release. Timed `setTimeout` walks do not move.
Even when shown, the pane can run at ~1 fps (check with a `requestAnimationFrame` counter). Real-time mini-games
(Drink Fast, Meter Shot) cannot be played well at that rate: drive the socket instead with a small Node script
using `@colyseus/sdk` from `front/node_modules` and the account's token (join `city`, `admin_teleport`, `move` at
walking speed, `sit`, then the game's messages), and keep the pane for what the player sees.

## 3. Two players

Same origin = same localStorage = same account, and one session per account (the second kicks the first,
code 4001). Put player 2 on the other allowed origin: `tabs_create`, `navigate` to `http://127.0.0.1:5173/`,
sign in there as the second playtest account, then `/game`. Confirm the join with `read_network_requests`
(`urlPattern: "3000"` → `POST /matchmake/joinOrCreate/city 200`). Check that both see the change and a player in
another zone does not. Close the extra tab after.

## 4. What to look at

- `read_console_messages {onlyErrors: true}` in each tab; `docker logs --tail 50 campuscove-socket` and
  `docker logs --tail 50 campuscove-backend` for server errors.
- Screenshot proof of the feature (a door open, a prompt, the item in hand). Use the collision overlay (C) for
  any wall/door/collision change; compare against `docs/OPEN_WORLD.md` expectations.
- Edge cases the game has already broken on: background tab (dt clamp), relog after an admin change, a locked
  house with a key holder inside, a seized house (`make collect-taxes`).

## 5. Gates

```bash
cd front && npx vue-tsc -b && node --experimental-strip-types --test "src/**/*.test.ts" && npx knip
make test
```

(Host Node is 22.13: the flag is required; see skill `game-feature` §4 for the knip note.)

Report exactly what was played, what was only checked by gates, and what was not verified.
