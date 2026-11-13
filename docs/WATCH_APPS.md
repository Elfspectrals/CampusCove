# Watch apps

The survival watch on the left wrist is also the player's phone: a tap on the watch key (T, rebindable) opens its apps in the bottom left corner. The player keeps walking and looking around while it is open, so every app is driven by the keyboard only. Mockup: `docs/mockups/watch-apps.html`.

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

1. Write `front/src/components/game/watch/Watch<Name>App.vue`. It receives `selected: number` (the chosen row) and exposes `{ rowCount, activate }` with `defineExpose`, where `rowCount` is a computed number of selectable rows and `activate(row)` acts on one. Render rows with `WatchRow.vue` (dot colour, name, meta) and mark nothing else as selectable.
2. Add it to the `apps` list in `GameWatchMenu.vue`: key, icon (`UiIconName`), tile colour, badge, and the label of Enter (`null` when Enter does nothing there: the hint is hidden). Render it in the template next to the other apps.
3. Add its strings under `watch.apps.<key>` and `watch.<key>` in `front/src/i18n/messages.ts`, in English and French.
4. Data and server calls go in a composable under `front/src/composables/game/`, never in the app component.

The screen is 228 × 272 px: keep a row to one line (name and a short meta) and let the list scroll.

## Apps

| App | Shows | Enter |
|---|---|---|
| GPS | the nearest ATM and the map's places (shops, jobs, your home), closest first | follow the place (a flag on the corner and full map, an arrow and the distance under the corner map), or stop; it clears within 8 m (`front/src/game/watch/gps.ts`, tested) |
| Bank (read only) | cash, bank, recent operations (`GET /api/bank`, loaded when the app opens); deposit and withdraw stay at the ATM | first row: follow the nearest ATM on the GPS |
| Trade | nearby players, the pending request | ask the chosen player, or cancel the request |
| Admin (admins only) | public places, online players | teleport there, or bring the player here |
