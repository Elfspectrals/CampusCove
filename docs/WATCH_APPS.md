# Watch apps

The survival watch on the left wrist is also the player's phone: a tap on the watch key (T, rebindable) opens its apps in the bottom left corner. The player keeps looking around while it is open; the movement keys (ZQSD / WASD as bound, or the arrows) choose, Enter acts and Backspace goes back, so the player stands still while using it. Mockup: `docs/mockups/watch-apps.html`.

## Keys

| Key | Home | Inside an app |
|---|---|---|
| ↑ ↓ ← → | choose an app (grid of 3 columns) | ↑ ↓ choose a row |
| Enter | open the app | act on the chosen row |
| Backspace | close the watch | back to home |
| T (watch key) | close the watch | close the watch |
| Y / N (`acceptChallenge` / `declineChallenge`) | answer a trade request | answer a trade request |

Movement, jump, sprint and the mouse keep working. Every other game key is ignored while the watch is open. Freeing the mouse (Esc) closes the watch. Navigation lives in `front/src/game/watch/watchNav.ts` (tested).

## Adding an app

1. Write `front/src/components/game/watch/Watch<Name>App.vue`. It receives `selected: number` (the chosen row) and exposes `{ rowKeys, activate }` with `defineExpose`, where `rowKeys` is a computed list of one stable key per selectable row, in display order (the selection follows its row when the list reorders), and `activate(row)` acts on one. An app with pages of its own can also expose `key(key, row)`, called before the watch moves: it returns the new selected row when it used the key (Backspace up one page, ◀ ▶ on a stepper, held Enter) or `null` to let the watch handle it; `text(e)` to take typed letters (a search field; the arrows still choose); and `title` / `keyHint` to replace the app name and the Enter hint. Render rows with `WatchRow.vue` (dot colour, name, meta) and mark nothing else as selectable.
2. Add it to the `apps` list in `GameWatchMenu.vue`: key, icon (`UiIconName`), tile colour, badge, and the label of Enter (`null` when Enter does nothing there: the hint is hidden). Render it in the template next to the other apps.
3. Add its strings under `watch.apps.<key>` and `watch.<key>` in `front/src/i18n/messages.ts`, in English and French.
4. Data and server calls go in a composable under `front/src/composables/game/`, never in the app component.

The screen is 228 × 272 px: keep a row to one line (name and a short meta) and let the list scroll.

## Apps

| App | Shows | Enter |
|---|---|---|
| GPS | the nearest ATM and the map's places (shops, jobs, your home), closest first | follow the place (a flag on the corner and full map, an arrow and the distance under the corner map), or stop; it clears within 8 m (`front/src/game/watch/gps.ts`, tested) |
| Bank (read only) | cash, bank, recent operations (`GET /api/bank`, loaded when the app opens); deposit and withdraw stay at the ATM | first row: follow the nearest ATM on the GPS |
| Contacts | friend requests received, friends in this town (distance), players within 30 m who are not friends, friends elsewhere (`GET /friends`, `GET /friends/pending`; `front/src/game/watch/contacts.ts`, tested) | accept the request, follow the friend live on the GPS, or send a friend request to the player |
| Trade | nearby players, the pending request | ask the chosen player, or cancel the request |
| Alarm | the alarms of your house: each one that went off while you were in town, and when you come back the break-in attempts made while you were away (`POST /api/house-alarms/report`, read once at join); a badge until you open it, a message and the siren when one goes off (`docs/LOCKPICK.md`) | nothing |
| Admin (admins only) | four tiles: Players (sheet with cash, bank and stars: go to them, bring here, give money or an item), Places (last one first), Events (state of the quiz, storage sale and market; taxes and market close need Enter held 1 s), Console | teleport, give, start events, open the docked console |
