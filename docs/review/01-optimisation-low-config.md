# 1. Optimisation review: letting lower configs play

Review date: 2026-11-11, on `feat/fp-hands-punch-watch` at `287fbf2`.

Target floor (confirmed with the owner): an office laptop with an integrated GPU (Intel UHD / Iris, old MacBook Air), 8 GB RAM, Chrome, about 30 fps at 720p to 1080p.

**How to read this.** Nothing was profiled in a browser. Every finding comes from reading the code and from parsing the asset files on disk. Tags: **[code]** read in code, **[disk]** measured from files, **[guess]** inferred and still to be measured. No frame-time number in this document is real until step 0 below is done.

## Verdict

- The game is not limited by textures, physics or the network. It is limited by **draw calls and CPU per frame**: thousands of tiny meshes, one mesh per plant, 15 to 20 skinned meshes per character.
- A `low` tier already exists and is the default, but it only turns off cosmetic options (shadows, antialiasing, env map). It does not touch the three real costs, so a weak laptop gets the ugly version without getting the fast one.
- The three biggest wins need no visual sacrifice at all: merge building meshes, instance the farm plants, give each character one skeleton and let it be culled.
- Loading time has nothing big left to fix.

## Outcome on 2026-11-11

Work done on branch `perf/low-config-wave-1`. Each number below was read in the game with the dev readout (draw calls and triangles of the frame, low tier unless stated). Frame rate on a real low-end laptop is still not measured, so none of this proves the game is smooth yet.

| # | Finding | Outcome |
|---|---|---|
| 1 | Buildings unmerged | Done. Meshes are merged by material when a building loads. At the spawn: 885 to 382 draw calls, same triangles. Over the 46 building files: 5,562 to 1,131 draw calls, identical geometry and lightmap coordinates. |
| 2 | Farm fields clone one mesh per plant | Wrong for the game: the zone bake already instances the plants (4 draw calls for 1,033 plants); only the zone editor clones them. The real cost is the plant models, 442 to 698 triangles each, about 560,000 triangles. Left to the branch that owns the farm. |
| 3 | Characters never culled, mannequins skinned | Mostly done. Characters out of the view are no longer drawn (back to Northline: 371 to 238 draw calls). Shop mannequins are static meshes (facing Northline: 430 to 396 draw calls, about 100 skeletons gone). Left: one skeleton per character instead of one per wear piece. |
| 4 | Camera draws behind the fog | Done on every tier. At the spawn: about 770,000 to 185,000 triangles. |
| 5 | Lightmap memory | Not done. Waits for a memory reading in Chrome. |
| 6 | Scene graph recomposed each frame | Not done. Waits for a profile; freezing matrices can break doors and moved furniture. |
| 7 | Shop aim raycast every frame | Wrong: already throttled. |
| 8 | Vue refs written each frame | Left as it is: one text node a frame. |
| 9 | Full-screen blur when drunk or thirsty | Done: not drawn on the low tier. |
| 10 | Sun shadow camera on high | Not done. A visual feature, not an optimisation. |
| 11 | NPCs and animals animate when far | Wrong: already gated on their zone being shown (26 m). |

Also done: a dev-only readout of draw calls and triangles in the HUD, and a medium tier (antialiasing and environment map on, no shadows, fog at 180 m). On medium the spawn frame is about 720,000 triangles, because the farm fields come inside its fog.

Not done: choosing the tier automatically at the first launch. Its thresholds need frame rates measured on a real low-end laptop.

Three of the eleven findings came from an audit that read the code without running it, and were wrong. The sections below are kept as written on the day of the review.

## What exists today

- Two tiers, `low` and `high`, default `low`, stored in localStorage, switched from the HUD with a page reload. No auto-detection and no FPS-based scaling. [code] `front/src/game/graphicsQuality.ts:5-11`, `front/src/components/game/GameHudToolbar.vue:19-23`
- `low`: no MSAA, pixel ratio 1, shadows off, camera far 300 m, fog 30 to 120 m, no HDR env map, shelf stock halved. `high`: MSAA, pixel ratio up to 2, PCFSoft, one 1024 px sun shadow, far 1000 m, fog 250 m, 1k HDR. [code] `front/src/game/gameScene.ts:42-50`, `front/src/game/roomEnvironments.ts:206`, `front/src/composables/game/useZoneDecor.ts:149`
- No post-processing. The first-person arms are a second render on a cleared depth buffer. [code] `gameScene.ts:51,95-105`
- Interiors use `MeshBasicMaterial` plus a lightmap and are hidden beyond 20 / 26 m; zone decor groups follow the same distances. Exteriors and zone scenery are always in the scene. [code] `front/src/game/town/openHouses.ts:36-37,191-228`, `useZoneDecor.ts:288-290`
- The glTF loader has Draco only (no KTX2, no meshopt). World textures are WebP and almost all 64x64. There are 23 lightmaps: 12 at 2048 px and 11 at 1024 px. [code] `front/src/game/gltfLoaderFactory.ts:20-24`, [disk]
- Avatars are modular: each body region and each wear piece is its own `SkinnedMesh` with its own `Skeleton`, `frustumCulled = false`, `castShadow = true`. Remote animation stops beyond 60 m, but the avatar is never hidden. [code] `front/src/avatar/modularCharacter.ts:47-60`, `front/src/avatar/glbCharacter.ts:101`, `front/src/composables/game/useRemoteAvatars.ts:38,399-405`
- Rapier holds fixed colliders only, with one character-controller query per frame and no `world.step`. [code] `front/src/game/collision/worldCollision.ts:392-416`
- `move` is sent every 50 ms while the pointer is locked, even standing still; 30 players per room. [code] `useGameMovement.ts:22,157-161`, `socket/src/config.ts:4`

## Findings, ranked

| # | Problem | Evidence | Gain on the target laptop | Effort | Visual risk |
|---|---|---|---|---|---|
| 1 | Buildings ship unmerged: one draw call per small object | [code] `--join false` for interiors and walk-in exteriors, `front/scripts/optimize-assets.mjs:42`. [disk] the 10 house exteriors are 1,524 draws for about 17k triangles; all 23 exteriors 2,218 draws; pub interior 548; each house interior 175 to 275 | High (draw calls, CPU) | M | None |
| 2 | Farm fields clone one mesh per plant | [code] `plant.clone(true)` in a loop, `front/src/game/mallTemplates/templateProps.ts:230-235`, while an `instancedParts` helper exists in the same file. [disk] `farm.json` holds 1,033 plants at 442 to 698 triangles each, about 560k triangles | High at the farm (draw calls, vertices) | S | None |
| 3 | A character costs 15 to 20 skinned draws and is never culled | [disk] the base body has 17 mesh nodes and 35 primitives, plus wear. [code] one `new THREE.Skeleton` per piece. [disk] 29 mannequins in Northline, 29 in the fashion zone, 8 in Summit Sports, static but still skinned, `templateProps.ts:86-94` | High in clothes shops and with 10+ players (draw calls, CPU) | M | None |
| 4 | `low` draws 120 to 300 m that the fog already hides | [code] far 300 against fog end 120 | Medium (draw calls, vertices) | S | None |
| 5 | Lightmap memory | [disk] 12 x 2048 px + 11 x 1024 px. [code] all decoded at boot, with mipmaps, never released, `roomEnvironments.ts:66-72,153-158`. [guess] about 250 MB of bitmaps in RAM and up to about 330 MB on the GPU once every interior was visited | Medium to high on 8 GB with shared video memory | S to M | Low |
| 6 | The whole scene graph is recomposed every frame | [code] no `matrixAutoUpdate = false` anywhere in the game. [disk] about 5,400 static nodes plus the plants plus bones | Medium to low (CPU) | S | None |
| 7 | ~~In a shop, an aim raycast runs every frame against the whole store group~~ **Withdrawn on 2026-11-11.** The raycast is already throttled to once every 0.08 s (`AIM_INTERVAL`, `front/src/composables/game/useFurnitureStore.ts:68,523-528`) and only runs in shops without price tags | - | - | - | - |
| 8 | Vue refs are written every frame | [code] `positionLabel` rebuilt each frame, `front/src/views/GameView.vue:975`; `doorPrompt` gets a new object plus a `getBoundingClientRect()` each frame, `useInteractionTargets.ts:105,149` | Low to medium (CPU, GC, layout) | S | None |
| 9 | Full-screen `backdrop-filter: blur` over the canvas when drunk or starving | [code] `GameDrunkEffects.vue:45`, `GameSurvivalEffects.vue:100` | Medium while active (GPU fill) | S | Low |
| 10 | `high` only: the sun shadow camera is never set up and does not follow the player | [code] only `mapSize` is set, `gameScene.ts:60-63`. [guess] shadows are paid for everywhere and visible almost nowhere | Medium on `high` | M | Changes the look |
| 11 | Zone NPCs and animals animate whenever their zone is shown | [code] `useZoneDecor.ts:175-187,292-295` | Low (CPU) | S | None |

Checked and fine: world texture memory (about 47 MB uncompressed for 712 textures, decor about 29 MB), Rapier, network handling, download size (`front/public/assets` is 76 MB in total, largest file is the 1.5 MB HDR used on `high` only).

## What I would do, in order

**Step 0. Measure first (half a day).** A dev-only overlay that prints `renderer.info.render.calls`, `.triangles` and `renderer.info.memory`, read at five spots (house street, farm fields, Northline, GreenCart, pub), alone and with 10+ players, in Chrome with 4x CPU throttling or on a real weak laptop. Without this, the ranking above is an educated guess and nobody can prove a fix worked.

**Wave 1. Free wins, every tier, no visual change.**
1. Instance the farm plants (finding 2). Smallest change, biggest local gain.
2. Camera far = fog end + a margin on `low` (finding 4). One number.
3. Freeze static world matrices after placement (finding 6).
4. Stop rewriting Vue refs when the value did not change (finding 8). The shop raycast part of this item was withdrawn with finding 7.

First measurement (2026-11-11, dev readout, low tier, standing at the spawn): 1,027 draw calls and 768,076 triangles in the world pass, 3,072 geometries and 601 textures in memory.

**Wave 2. The structural ones.**
5. Merge static building meshes by material, keeping only the named nodes the game needs (doors, `House_Floor_*`, hidden nodes) (finding 1). This is the single largest gain and the reason every future shop is cheaper.
6. One shared skeleton per character, a bounding sphere so culling works, hide avatars beyond the fog, and bake mannequins to static meshes (finding 3).
7. Lightmaps: release the bitmap after upload and drop the mipmaps first (S); load on approach and dispose on leave if memory is still a problem (M) (finding 5).

**Wave 3. Tiers that mean something.**

| | Low | Medium (new) | High |
|---|---|---|---|
| Antialias | off | on | on |
| Pixel ratio | 1 (0.75 as an option at 1080p) | 1 | up to 2 |
| Shadows | off, avatars do not cast | off | on, once finding 10 is fixed |
| Env map | off | on | on |
| Fog end / camera far | 120 / 130 | 180 / 200 | 250 / 270 |
| Shelf stock | halved | full | full |
| Remote animation distance | 25 m | 60 m | 60 m |
| Remote avatars | hidden beyond fog | hidden beyond fog | hidden beyond fog |
| Drunk / hunger overlay | vignette only | blur | blur |

Then pick the starting tier automatically: measure the first few seconds behind the loading screen and start on `medium` when the machine holds its frame rate, instead of giving everybody `low`. Today a player with a good machine sees the worst-looking version until they find the HUD switch.

## My opinion on the trade-offs

- Do not start with tiers. Tiers hide problems; findings 1 to 3 remove them for everyone, including phones later.
- KTX2 textures are not worth it now: textures are 64 px and are not the problem. Lightmaps are the only place where it could pay, and the cheaper fixes should be tried first.
- Halving lightmaps on `low` was already rejected for blur (roadmap, "Game loading"), and I agree.
- The shadow fix (finding 10) is a visual feature for `high`, not an optimisation for weak machines. Keep it out of this work.
- Every new shop multiplies findings 1 and 3. If the next shops come before wave 2, the mall gets slower with each one.

## Not verified

- No profile was taken. Draw-call counts are per-file totals from GLB headers, not what is inside the view at a given spot.
- 15 to 20 draws per character comes from the file structure and the hide rules, not from a live count.
- The lightmap memory figures assume RGBA8 with mipmaps and a bitmap that stays alive after upload.
- The shadow frustum claim rests on three.js defaults and was not seen on screen.
- The cost in milliseconds of findings 6 to 8 is unknown.
