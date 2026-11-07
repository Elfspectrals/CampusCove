---
paths:
  - "front/src/game/**"
  - "front/src/composables/game/**"
  - "front/src/components/game/**"
  - "front/src/views/GameView.vue"
---

# Game front rules (Three.js + Vue HUD)

- Start a gameplay feature with the `game-feature` skill; prove it with `playtest-game` before calling it done.
- The front sends intents and renders results. It never computes a reward, a roll or a final time that the server trusts.
- Logic goes in a plain TS module under `src/game/` with a `*.test.ts`; Vue components in `components/game/` only render HUD and forward input; wiring lives in `composables/game/`.
- Every player action gets feedback: a sound from `sfx.ts`, a visual (particle, pop, counter) and a HUD change. Use the `game-feel` skill.
- Mini-game overlays share one look: reuse the layout and styling of `GameDarts.vue`, `GameDrinkFast.vue` and `GamePubRaceBoard.vue` for new boards and leaderboards, instead of a 3D model or a new style.
- Items in hand or in the world use the same `model.glb` as the item sold in the shop (`public/assets/items/<category>/<item>/`); do not ship a second model of the same object.
- Keep `graphicsQuality.ts` tiers in mind: every new effect must have a cheap path on low quality.
