# Global rules

## Code principles

- **KISS**: pick the simplest design that works. No abstraction, config flag or generic layer until a second real use needs it.
- **YAGNI**: build what the current feature needs, nothing "for later". Delete dead code instead of commenting it out.
- **DRY**: a rule, price, constant or formula lives in one place. When two layers (Blender, API, socket, front) must agree on a value, one owns it and the others read it or share a contract doc (`docs/*.md`). Extract code the second time it appears instead of copying and adapting it.
- **SoC**: Laravel owns persistent truth (money, items, ownership), the socket owns live state, timing and anti-cheat, the front only displays and sends intents, and Blender scripts only build assets. Vue components render and delegate logic to composables or plain TS modules.
- **SOLID**: one responsibility per class or service. Extend through new classes or strategies instead of growing `if` chains. Inject dependencies (Laravel container) instead of building them inline.
- **Fail fast, trust no client**: validate at the edge, never trust an amount, position, count or duration sent by the client, and surface errors instead of swallowing them.
- **Least surprise**: follow the conventions already in the file or module you touch (naming, folder layout, patterns) before introducing a new one.
- **Boy-scout, in scope**: fix what you touch, but no drive-by refactors outside the task.
- **Tested logic**: pure gameplay logic lives in a small module with a sibling `*.test.ts` (front, socket) or a Laravel feature test (backend).

## Product voice

CampusCove is presented as a real product. Never mention a school, course, assignment, grade, teacher or "projet annuel" in code, comments, docs, commits, PRs, UI text, SEO content or legal pages.

## Git

- Branches: `<type>/<what-it-does>` (`feat/`, `fix/`, `chore/`...). Never `claude/...`.
- Commits follow Conventional Commits. No AI attribution lines in commits or PRs.
