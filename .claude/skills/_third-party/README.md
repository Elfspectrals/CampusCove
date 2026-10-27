# Vendored skills

Copied unchanged except for a `> **CampusCove note.**` block inserted under each SKILL.md front matter.
Every file was read before it was added (2026-10-26). To update, re-fetch the same paths at a newer commit,
re-read the diff, and keep the notes.

| Skills | Source | Commit | License |
|---|---|---|---|
| `threejs-performance`, `threejs-loaders`, `threejs-lighting`, `threejs-textures`, `threejs-animation`, `threejs-asset-pipeline` | https://github.com/CloudAI-X/threejs-skills (`skills/<name>/SKILL.md`) | 0e18186 | MIT, `LICENSE-CloudAI-X.txt` |
| `threejs-debug-profiler` (+ `references/debug-playbook.md`) | https://github.com/majidmanzarpour/threejs-game-skills (`skills/threejs-debug-profiler/`) | 8286774 | MIT, `LICENSE-majidmanzarpour.txt` |
| `game-feel`, `camera-systems`, `input-systems`, `level-design`, `procedural-gen` (+ their `references/`) | https://github.com/gamedev-skills/awesome-gamedev-agent-skills (`skills/disciplines/<name>/`) | 184b72b | Apache-2.0, `LICENSE-gamedev-skills.txt` + `NOTICE-gamedev-skills.txt` |
| `threejs-interaction` | https://github.com/CloudAI-X/threejs-skills (`skills/threejs-interaction/SKILL.md`) | 0e18186 | MIT, `LICENSE-CloudAI-X.txt` |
| `vue`, `vite` (+ `references/`, `GENERATION.md`) | https://github.com/antfu/skills (`skills/<name>/`) | 8886fe2 | MIT, `LICENSE-antfu.txt` |
| `colyseus-multiplayer` (SKILL.md + `references/` only; its `.audits/`, `evals/`, `.tekhne/` left out) | https://github.com/pantheon-org/tekhne (`skills/specialized/colyseus-multiplayer/`) | 659d0a6 | MIT, `LICENSE-tekhne.txt` |

Second batch read and added 2026-10-27.

Left out on purpose: `threejs-qa-release` (needs that pack's Playwright scaffold and director skill; `playtest-game`
covers QA here), the generators that call paid external APIs, React Three Fiber / WebGPU-first packs, and the
Godot / Unity / Roblox / Phaser skills.
