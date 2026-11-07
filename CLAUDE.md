# CampusCove project rules

Rules are split by topic in `.claude/rules/`. Files without a `paths:` header load in every session. The others load only when you work on a matching file, so a UI task does not drag in database rules.

| File | Loads | Covers |
|---|---|---|
| `global.md` | always | Code principles (KISS, YAGNI, DRY, SoC, SOLID, composition, idempotence, contracts...), product voice, git |
| `roadmap.md` | always | Approved work, its status and the product decisions behind it |
| `economy.md` | backend services, socket games | Coin sources and sinks, server-owned rewards, decided balance |
| `backend.md` | `backend/**` | Laravel API, migrations, feature tests |
| `socket.md` | `socket/**` | Colyseus authority, timing, anti-cheat |
| `game-front.md` | `front/src/game/**`, game composables and components | Three.js gameplay, HUD, feedback |
| `ui.md` | Vue pages, layouts, components | Site UI, i18n, responsive |
| `seo.md` | `front/src/seo/**`, `front/src/content/**` | Titles, descriptions, keyword pages |
| `assets.md` | `front/scripts/**`, `front/public/assets/**`, `map-src/**` | Modular 3D assets |

When you start work that is on the roadmap, update its status in `roadmap.md` in the same change. When the user approves new work or takes a product decision, add it there.
