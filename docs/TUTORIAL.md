# Tutorial "First day in town"

Runs once for a new account, right after the character creator. The farmer at the orchard is the guide.

## Steps

In order (`TutorialService::STEPS`):

| Step | Done when (checked by the server) |
|---|---|
| `pick_apples` | 6 apples picked |
| `eat_apple` | 1 apple eaten |
| `sell_apples` | apples sold to the farmer |
| `deposit_cash` | one deposit at an ATM ("cash drops at death, the bank does not") |
| `play_darts` | one darts game played at the pub, free, paying 0 coins to anyone |

## Free darts game

While the tutorial is `active` at `play_darts`, `POST /pub/play` for `darts` answers `fee: 0` and debits nothing (the 60 s reward wait still applies). At the end of that darts game the socket sends `POST /pub/reward` with `free: true` for every player: the game counts as played (`darts_played`, which ends the tutorial step) but pays 0 coins to anyone, so an established player gains nothing by playing against a new account.

Finishing gives the "New citizen" badge next to the pseudo. No coins.

## Badges

A badge is a status shown as an icon, never an item: it cannot be traded, sold or lost at death.

- Table `account_badges` (`account_id`, `badge`, `granted_at`), one row per account and badge; the `CHECK` lists the stored codes (`new_citizen`).
- `BadgeService::badges()` is the one entry point for every badge of an account: `GET /api/user` returns it as `user.badges`. Task tier badges are not copied into `account_badges`: their truth is `account_task_tiers` (tasks branch), and `badges()` will add the highest tier of each task as `task:<task>:<tier>` when both branches meet. `BadgeService::grant()` is idempotent.
- The socket reads `user.badges` when the player joins and sends them to the other players (`badges` in the player payload); a malformed list refuses the join.
- The front maps each code to an icon of `front/src/components/ui/icons.ts` (`front/src/game/badges.ts`, `new_citizen` = `home`). Every badge shows in the Tab player list; only New citizen also shows before the pseudo over the head (decided 2026-11-13: task badges stay on the Home page and in the Tab list). A code the front does not know yet is not drawn.

## Marker

The front points at the objective of the current step (`front/src/game/tutorialMarker.ts`): the nearest orchard tree, nothing while eating (any place works), the orchard farmer, the nearest ATM, then the darts oche at the pub. The marker shows the ground distance in metres, through walls, and sticks to the screen edge with an arrow when the target is out of view.

## First-time bubbles

While the tutorial is active and the game is loaded, the first time the player comes within 4 m (ground distance) of an ATM, an NPC (zone buyers, the pub bartender) or a shop or work building door, a bubble explains it for 6 s over the nearest one (`front/src/game/tutorialHints.ts`). Order when several are in reach: ATM, NPC, door. Each kind shows once per account in this browser (`localStorage` key `cc.tutorialHints.<account_id>`).

## State

Table `account_tutorials`, one row per account, created by the first save of the character (`CharacterAppearanceService::save`). Accounts whose character existed before have no row: status `none`, they never see the tutorial.

| Status | Meaning |
|---|---|
| `none` | no tutorial for this account |
| `active` | in progress at `step` |
| `skipped` | the player skipped it; `step` is kept, no badge |
| `done` | finished, badge given; `step` is `null` in the API |

## API (signed-in player)

| Route | Answer |
|---|---|
| `GET /api/tutorial` | `{ status, step }` |
| `POST /api/tutorial/skip` | `active` to `skipped`; already `skipped` is a no-op |
| `POST /api/tutorial/resume` | `skipped` to `active`; already `active` is a no-op |

Skip or resume on `none` or `done` answers 409 with `code` `tutorial_none` or `tutorial_done`.
