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

Finishing gives the "New citizen" badge next to the pseudo. No coins.

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
