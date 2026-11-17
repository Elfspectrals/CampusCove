# Global rules

## Code principles

- **KISS**: pick the simplest design that works. No abstraction, config flag or generic layer until a second real use needs it.
- **YAGNI**: build what the current feature needs, nothing "for later". Delete dead code instead of commenting it out.
- **DRY**: a rule, price, constant or formula lives in one place. When two layers (Blender, API, socket, front) must agree on a value, one owns it and the others read it or share a contract doc (`docs/*.md`). Extract code the second time it appears instead of copying and adapting it.
- **SoC**: Laravel owns persistent truth (money, items, ownership), the socket owns live state, timing and anti-cheat, the front only displays and sends intents, and Blender scripts only build assets. Vue components render and delegate logic to composables or plain TS modules.
- **SOLID**: one responsibility per class or service. Extend through new classes or strategies instead of growing `if` chains. Inject dependencies (Laravel container) instead of building them inline.
- **Composition over inheritance**: build behaviour from small parts (services, composables, strategies, asset builders) instead of base classes and deep hierarchies.
- **Idempotence**: an operation that may be retried (reward, purchase, webhook, seeder, socket message sent twice) gives the same result the second time. Use a unique key or a state check, never "hope it runs once".
- **Make illegal states unrepresentable**: model state so a wrong combination cannot be written: TS unions instead of flags that can conflict, enums and DB constraints instead of free strings.
- **Law of Demeter**: talk to your direct collaborators only; no `a.b.c.d()` chains reaching into another module's internals.
- **Design by contract**: when two layers must agree (API payload, socket message, asset manifest), the contract is written down in `docs/*.md` and checked on both sides: the server validates every field it receives. New contracts state their fields, types and ranges.
- **Fail fast, trust no client**: validate at the edge, never trust an amount, position, count or duration sent by the client, and surface errors instead of swallowing them.
- **Emergent gameplay**: a player does whatever the game lets them do, not what the feature expects. Before an action ships, list what the player can still do while it runs (move, turn, jump, leave the area, press another key, open a menu, do it twice, do it early, late or in the wrong order, disconnect) and decide each case: allowed and handled, or blocked. The server judges an action from where the player really is at that moment, never from where the flow assumes they are. Example: the tennis server could walk away from their toss and still hit it; the fix puts them on the baseline, locks them while they serve and only accepts the hit from under the ball. Each case decided is written in the feature's doc and covered by a test.
- **Least astonishment**: follow the conventions already in the file or module you touch (naming, folder layout, patterns) before introducing a new one; a function does what its name says and nothing else.
- **Boy Scout Rule, in scope**: leave the code you touch cleaner than you found it, but no drive-by refactors outside the task.
- **Tested logic**: pure gameplay logic lives in a small module with a sibling `*.test.ts` (front, socket) or a Laravel feature test (backend).

## Product voice

CampusCove is presented as a real product. Never mention a school, course, assignment, grade, teacher or "projet annuel" in code, comments, docs, commits, PRs, UI text, SEO content or legal pages.

## Shops: no price tags

Shops show no price tag, tag post or prompt bubble over an item (decided 2026-11-14). Aiming at an item shows only the item card in the bottom right (`GameStoreItemCard.vue`: name, type, use, price). Never add a tag board, a `tag` / `priceTags` field, a tag post mesh or a price-tag helper, and when merging or rebasing a branch written before this decision, drop its tags instead of keeping them. `front/src/game/store/noPriceTags.test.ts` fails if one comes back.

## New assets

Before planning a new asset that holds items or a new plant, even from a zone file or game code, follow "Variety before building" in `.claude/rules/assets.md`: variety plan, product questions, explicit validation, then build.

## Git

- Branches follow the Airbnb naming: `<type>/<what-it-does>` in kebab-case (`feat/`, `fix/`, `chore/`, `docs/`, `refactor/`...), for example `fix/economy-exploits`. Never `claude/...` or a generated hash; rename before the first push.
- Commits follow Conventional Commits. No AI attribution lines in commits or PRs.
