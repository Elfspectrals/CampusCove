# Roadmap

Status: `todo`, `doing`, `done`. Update the status in the same change as the work. Add new approved work here with the decision behind it.

## 1. Close the money printers (done)

Playtested on 2026-11-07 against the dev stack: a solo Drink Fast race finished in 8017 ms on both client and server, paid 15 coins, and a second race inside the cooldown was refused with `pub_cooldown` before any fee.

- [done] Welcome bonus can no longer be funnelled: an account younger than 72 h can receive in a trade but not give coins or items (`TradeService::MIN_GIVER_AGE_HOURS`). Paying on email verification was dropped: there is no verification flow and no mail sending.
- [done] `pub/play` refused with `pub_cooldown` while that game's reward cooldown is running (`PubService`).
- [done] Drink Fast: the client sends only its press/release steps; the socket replays the balance simulation (`socket/src/drinkFastSim.ts`, fixed 1/60 s step, golden test shared with `front/src/game/pub/drinkFast.test.ts`) and owns progress, spills and finish time.
- [done] Meter Shot time comes from the socket clock less a 250 ms network allowance; the client's figure is ignored.

## 2. Pub: a place to spend, skill earns a little back (todo)

Decision (2026-11-06): you go to the pub to drink, not to make money. The UI shows the fee and the best payout before each game.

- [todo] Darts winner 20 coins, +10 for 80 points or more.
- [todo] Meter Shot fee 25; a run under 5 s pays 60 (only once the timing is server-owned).
- [todo] Weekly leaderboard (best darts total, fastest pint), persisted, shown as an HTML overlay in the style of `GameDarts.vue` / `GamePubRaceBoard.vue` (not a 3D model), small weekly prize.
- [todo] Fee and best payout shown on each pub game prompt.

## 3. Orchard: more fun, same income (todo)

Decision (2026-11-06): the orchard stays the main job at about 900 coins/day; new features must not raise daily income (offset with the after-quota price, set to 0 if needed). Run the `economist` before shipping each one.

- [todo] Feedback: rustle and pop on pick, apple flies into a "14/20" basket counter, coin clink and floating "+60" on sale, farmer voice line.
- [todo] Apples use the grocery apple model sold in the mall (`public/assets/items/grocery/apple/model.glb`) instead of the farm copy.
- [todo] Golden apple: 1 pick in 50, rolled server-side, sparkle and chime.
- [todo] Tree of the day: one tree per day glows and picks faster.
- [todo] Sweet-spot pick: release in a short window for 2 apples, judged by the socket clock.
- [todo] Farmer's daily order ("bring 40 apples today") with a streak counter.
- [todo] Picker rank: bigger baskets, then a straw-hat wear piece (built like player clothes).
- [todo] Co-op tree shake: two players shake one tree, both get apples.
- [todo] Trees run out: each tree holds 8-12 apples (server state) and regrows over a few minutes; the tree shows how many are left.
- [todo] Varieties and collection book: Gala, Granny Smith, Pink Lady and Golden grow on different trees. They are colour variants of the one grocery apple model, not new models. Collecting one of each fills a sticker book and unlocks a cosmetic badge. No coins.
- [todo] Apple pie at the café: 5 apples at the café oven make a pie that fills more hunger than 5 raw apples. A use for apples that adds no coins.
- [todo] House cider at the pub: apples sold to the farmer fill a weekly town counter; past the goal, "house cider" appears on the pub menu for everyone that week.

Decision (2026-11-06): picking stays simple because it is the first job. Hold to pick is the base loop and always works; skill (sweet spot, co-op shake) is an optional bonus on top, never a gate. No separate catch mini-game.

## 4. Character creator (doing)

Decision (2026-11-07): every player builds their character the first time they enter the game, in a 3D creator screen before spawning (GTA Online style). Accounts that already exist go through it once at their next login.

- [doing] Creator choices: sex (woman / man, two base bodies), skin tone, haircut (the 6 existing) and hair colour, a preset face (about 6 per sex) and a build (slim, normal, broad). Preset faces, no sliders, to stay low-poly. Built end to end (`docs/CHARACTER.md`); waiting for a playtest in the game before marking done.
- [done] Haircuts are part of the character (decided 2026-11-07): all 6 are free in the creator, no longer sold at Cove Threads, and never lost at death.
- [done] One shared skeleton: both bodies, every face and build, hair, clothes and the newcomer outfit are skinned to the same armature (same bones, names and rest pose), so the existing clips (Idle, Walk, Run...) play the same on every character. Builds and the woman / man bodies change the mesh, never the bone hierarchy.
- [done] Newcomer outfit: one free outfit made for new players (top, bottom, shoes), worn when leaving the creator. It is fine that it reads as "new or just respawned".
- [done] Death: only the worn clothes bought with coins are destroyed (the wardrobe is kept, decided 2026-11-07) and the player respawns in the newcomer outfit. Gem-bought (real-money) skins and clothes are never lost: they are only taken off and can be put back on. Run the `economist` before shipping, since this adds a clothes sink.
- [doing] A key (P, rebindable) opens the same editor anywhere in the game, free, everything editable including sex. A paid barber comes later and replaces it.
- [todo] A full shop skin (Night Owl, Street Runner...) replaces the custom character while it is worn. Not built: the modular avatar ignores the body slot today, so a worn skin does not show in the game.
- [done] Hair colour is a free colour picker, not a palette (decided 2026-11-08).

Decision (2026-11-08): the first playtest found the characters ugly. Target look: stylized low-poly characters like Just Create Studios' packs (justcreate3d.studio): believable proportions, sculpted faces, hair in clean locks, soft shading. They are a reference for the style only; we build our own with the `front/scripts/skins/` Blender scripts (no bought pack, no copy of their characters). Nothing on this branch is merged before the new characters are in.

Decision (2026-11-08, after the prototype renders): follow the look of the reference the user provided (`docs/apocalypse_free.blend`, licence unknown, so used as inspiration only, no mesh copied): a simple clean head, a drawn face (eyes, brows, mouth laid on the head surface) instead of sculpted features, hair as big clean volumes.

- [done] New stylized base bodies (`front/scripts/skins/stylized.py`, `stylized_base.py`) on the shared 21-bone rig, Idle/Walk/Run/Sit kept, split into the same body regions, builds and the fit system carried over; six drawn faces per sex replace the old ones. Waiting for an in-game playtest.
- [todo] Face sliders (morph targets: nose, jaw, eyes, mouth...) replacing the 6 fixed faces. Draco cannot carry morph targets: switch these files to meshopt.
- [todo] Beard and moustache chosen on their own, tinted with the hair colour (a beard builder exists in `stylized.py`, not wired to the creator yet).
- [todo] Eye colour.
- [todo] Facial expressions and emotes visible to other players.
- [done] The six haircuts rebuilt in the new style (basic, short quiff, long bob, curly, buzz, ponytail); tops, bottoms and shoes re-weighted on the new body and checked on all six fits.
- [doing] Sculpted haircuts (decided 2026-11-10, after a one-head prototype): each haircut keeps its low-poly mesh and rig but is wrapped onto a sculpt made from an original concept image with a local image-to-3D model (Hunyuan3D-2mini), and the locks are baked into a normal map (`front/scripts/skins/sculpt_bake.py`). Hair first; faces stay drawn, since the sculpted faces added little and lost the nose. `buzz` has no sculpt.
- [done] The zone outfits added on main (bandana, flannel jacket, staff polo, rubber boots) built on the new body; the bandana is a cloth cap over the short hair cap.
- [done] Head accessories (five headsets, straw hat) rebuilt on the new head over a short hair cap; that hair takes the player's hair colour (`W_head_accessory_<key>_Hair`).

## Farm animals (doing)

Decision (2026-11-10): animals reuse the skeleton and clips of a CC0 Quaternius animal and get our own pastel low-poly mesh, built as pieces skinned to its bones (`build_animals.py`). No hand rigging, no paid or cloud tool. Source rigs are committed in `docs/quaternius/` (CC0).

- [done] Chicken proof of concept: `public/assets/animals/chicken/model.glb`, 648 tris, 11 pieces, clips idle, idle_peck, run, attack, death. Not wired into the farm or the manifest.
- [todo] Cow, pig and sheep from the same Quaternius pack, then decide where they live in the world.
- [done] Chicken `walk` written in code (`bird_walk`), the missing clip of the Quaternius pack.

## Farm and orchard assets through make model (done)

Decision (2026-11-11): every farm and orchard asset is regenerated with `make model` for a cleaner look, at the same keys and paths, reviewed one family at a time on a before/after sheet. Animals get an AI mesh auto-skinned to their existing Quaternius rig so the clips are kept.

- [done] Farm items: new apple (one source for `farm/apple` and `grocery/apple`), potato, potato plant, corn, cabbage, pumpkin, egg, milk. The corn plant kept its previous model (the new ones lost the cobs or grew too wide).
- [done] Orchard (decided 2026-11-12): four apple tree varieties as decor `apple_tree_1`-`4` (Farm category), each a `make model` crown without fruit plus copies of the apple item placed on it in its own layout (spread, low, clusters, few big), the apples on the `IT_Crop_Apple` material so the editor recolours them. The 12 pickable trees stay baked by `build_orchard_site.py` and mix the four. Pine, basket and lantern (glass glows) from `make model`, fallen apples are the apple item; hay bales, crates, stall, shed and fences stay builders. The farm decor was not regenerated. Tree positions moved by up to 0.3 m (new random draws), the manifest follows.
- [done] Animals (decided 2026-11-12): the six farm animals already came from `make model` with their own rig and idle/walk/graze clips (`build_barnyard.py`, not Quaternius). Their glitches came from the pipeline, not the AI: a forced three-quarter concept image projected as a side view, a flat single-axis projection stretching rim pixels, a colour-based silhouette that dropped white areas, 1200-triangle decimation, and hind legs bending like front knees. Fixed with `VIEW=side`, automatic concept checks (`check_ai_image.py`, `make model-checked`), the rembg mask, a posterized palette texture, the full Hunyuan model at 3000-6000 triangles, eye pieces and point-backward hocks. All six regenerated to match their concept image. The chicken proof of concept on the Quaternius rig is untouched.

## Animation in code (doing)

Decision (2026-11-10): new clips for the human rig and the animals are written as phase functions in the Blender build scripts by the `animator` agent (`.claude/agents/animator.md`), from `docs/animation/` (skeleton contracts and a sourced playbook). No hand keying, no paid tool.

- [done] `Pick` on the base body (`wear/base`, 3.0 s one-shot, matches `PICK_MS`); not on premium skins.
- [done] Play `Pick` in game during the orchard pick: `setAvatarPicking` (third person), `pick()`/`cancelPick()` on the first-person arms, socket `user_picking` broadcast.
- [done] Rework of every human clip: Walk and Run designed for the real speeds (5 and 8.5 m/s) with IK-planted feet, Idle and Sit alive, skin secondary motion locked to the steps, first-person arms reworked plus a first-person Pick, run thresholds 6.7 / 5.8 m/s and speed-matched timeScale.
- [done] Eat and Drink clips (1.0 s) in first person and third person, base body and premium skins, seen by other players through `user_action`.

## First-person hands, punch and watch (done)

Decision (2026-11-11): the first-person hands get finger bones so they can relax, make a fist and grip; the punch becomes a left jab then a right cross (back to the jab after a pause), same impact frame and cooldown; the survival watch is an AI model from `make model` at real size, strapped to the forearm, with a square smartwatch face that keeps hunger and thirst. Shipped in three steps, each checked in game.

- [done] Watch: `make model` smartwatch, flat `Screen` cut into its face, strap fitted to the forearm, square face, mounted on the forearm instead of the hand.
- [done] Hands: rebuilt first-person hands on finger bones, poses relaxed, fist, grip, pick, key and door, on every arm model.
- [done] Punch: left jab then right cross with a closed fist, the other arm guards.

## Names, chat, cash and bank (doing, branch pseudos-money-system)

Decision (2026-11-11): money is split into cash (carried) and bank. Jobs pay in cash, shops take cash only, so players withdraw at ATMs placed around the world. At death the cash drops on the ground in a bag anyone can pick up for 5 minutes, then it is gone. Existing coins move to the bank. The ATM screen offers withdraw, deposit, balance, recent operations and a transfer to another player (same 72 h giver rule as trades). The inventory shows both cash and bank. Chat is a bubble over the speaker's head, seen by nearby players only, no chat log. Run the `economist` before shipping the cash split and the death bag.

- [done] Pseudo (with its #tag) above other players, hidden past 25 m.
- [done] Chat bubble above the speaker (Enter, rebindable), 120 characters, 1 s cooldown, heard within 30 m and not through house walls; the sender sees their own line in the HUD.
- [done] Cash and bank wallets: earnings in cash, shop payments in cash, deposit, withdraw, transfer, history. Housing, tax, hospital and hangover bills are taken from the bank; welcome bonus and referrals are paid to the bank; trades move cash (decided 2026-11-12). The housing tax is taken from the bank only: a player with too little in the bank loses the house even with cash on them, so keeping rent money in the bank is their job (decided 2026-11-12, after the economist flagged it).
- [done] Inventory shows cash ("On you") and bank, read from `GET /api/bank` each time it opens.
- [done] ATM model (`make model`, built by `build_street_decor.py` into `decor/atm`, editor category Street) placed as runtime items at five spots: town hall, orchard apple buyer, farm stand, pub door, Cove Home entrance.
- [done] ATM screen (`GameAtmScreen.vue`, styled like a real ATM): withdraw, deposit, balance, recent transactions and transfer by name#tag, through the socket `atm` message checked within 2.5 m of an ATM. Contract in `docs/BANK.md`.
- [done] Cash bag dropped at death, picked up by anyone within 5 minutes. From the economist review (2026-11-12): ship it with the cash split, since without it keeping everything in cash dodges the hospital bill; an account younger than 72 h drops no bag (its cash is destroyed), or the welcome bonus is funnelled by killing the alt; the killer cannot pick up their victim's bag; the bag is a ledger-backed row picked up once under a lock; the expiry is a ledger debit; one ATM within about 30 s walk of each pay point (orchard farmer, zone buyers, pub).

## Proximity voice chat (doing, branch feat/names-chat-cash-bank)

Decision (2026-11-12): voice goes through a self-hosted LiveKit SFU (open source), not a voice SaaS (ODIN was the other option). Docker in dev, a VPS with UDP and TURN later (Heroku has no UDP). The socket signs the LiveKit token, one LiveKit room per city instance; the socket decides who hears whom (within 30 m), the client places the voices in 3D with Web Audio. The player chooses push-to-talk (B, rebindable) or an open mic in the settings. Contract in `docs/VOICE.md`.

- [done] LiveKit dev server in docker-compose, socket signs `voice_token` on join.
- [done] Front: connect, publish the mic (push-to-talk or open mic, B, set in Settings), hear voices within 30 m (kept up to 34 m) through HRTF panners on the avatars. Checked with two tabs and a test tone; a real two-person voice test is still to do.
- [done] Speaking icon above the pseudo (crossed out when muted), player list on Tab (rebindable) with a mute button per account, kept in this browser until unmuted (decided 2026-11-12: a list, not aiming, so a running player can still be muted). A muted account is not even subscribed to.
- [done] The socket decides who hears whom: the client joins with auto-subscribe off and the socket subscribes every 500 ms through the LiveKit admin API (range, house walls, mutes sent with `voice_mute`). Tokens must allow subscribe, since LiveKit silently refuses the admin subscriptions otherwise (found 2026-11-12: nobody heard anyone); a modified client could therefore subscribe to the whole city instance itself.
- [todo] Close that hole: each publisher restricts who may subscribe to its track (`setTrackSubscriptionPermissions`) from a list the socket sends.
- [done] Audio starts on the first click or key; open mic turns on at Play (fixed after the first real test, 2026-11-12).
- [done] Voice settings like Discord: microphone and output device, mic and voices volume (0 to 200 %), mic test with a level meter.
- [done] Per-player volume (0 to 200 %) in the Tab list, saved per account in this browser (`cc.voiceVolumes`).
- [done] Voice from another PC on the same network: `make up` gives LiveKit the network address, `make share-local` reaches LiveKit through the page (`/livekit` proxy) over https (2026-11-12).
- [todo] Deploy LiveKit on a VPS with TURN; privacy page mentions voice.

## Later

- Fishing as the second job (reuse the darts power meter or the Drink Fast balance bar; rod and fish models exist).
- Real mobile version: touch input, mobile HUD, quality tier.
- Versioned contracts: an OpenAPI spec for the Laravel API and a JSON Schema for socket messages, generated or validated in CI, replacing the hand-written `docs/*.md` contracts.

## Shops in the zone editor (doing, branch feat/editor-store-zones)

Decision (2026-11-10): every shop works the same way (items and shelves in a seller area, a clerk at a checkout counter, a basket paid to the clerk). The six walk-in mall shops are their own zones, opened from the mall map, and their furniture is made of editable props instead of being baked into the interior.

- [done] Shop zones (`"parent": "mall"`), Campus Home naming, mall map with "Open shop editor", read-only shops in the mall zone.
- [done] Furniture of the six mall shops as decor props (`build_shop_decor.py`), interiors rebuilt and re-lit.
- [done] Shelf prop with item slots (gondola, wall, fridge, chiller): per slot item, count shown, arrangement (rows, messy, stack, front), "out of stock" tag, sold from the slot; GreenCart stocked with it. Spec in `design-plans/shelf-slots.md`.
- [todo] Playtest the shops in game (basket from slots, frame rate in GreenCart).

## Multi-shop cart (doing, branch feat/multi-shop-cart)

Decision (2026-11-12): one cart for every shop with a cashier, instead of one basket per shop emptied on leaving. A click on an item adds one to the cart (again for one more); the cart screen (L, rebindable, or Use at a cashier) shows every shop's lines with quantity, remove and totals. Each shop's lines are paid at that shop's own cashier, in cash. Clothes stay one at a time. A payment carries a checkout key so a retry never charges twice. Contract in `docs/SHOP_CART.md`.

- [doing] Cart and cart screen, quantities on `/shop/checkout` and `zone_checkout`, `shop_checkouts` idempotency table. Server checks tested; waiting for a playtest.
- [done] No price card in shops (decided 2026-11-12 from the user's screenshot of the GreenCart orange juice card): only the item models show; the price is in the aim prompt, the item card and the cart. The `priceTags` area option, its editor checkbox and `priceTag.ts` are gone.

## Mall editor (in progress, branch feat-shop-editor)

- [in progress] `/admin/editor`, a UE5-style level editor: templates built per cell size (decor by category, items for sale or as props, NPC extras, one vendor, dressable mannequins), saved as committed JSON by a dev-only endpoint, assigned to free planned cells, opened by a `build_mall.py` rebuild.

## Game loading (done)

Decision (2026-11-11): /game shows a loading screen (mockup `docs/mockups/game-loading-*.png`) from the first click, with real progress, instead of an empty page. Measured on the dev stack, page load to playable went from 113 s to about 4 s.

- [done] Loading screen with four stages (character, town, shops and decor, server), file counter and tips; a small route chunk shows it while the GameView chunk downloads.
- [done] Dev server: polling no longer starves Vite (1 s interval, binary assets not watched); a 1.8 MB lightmap went from 20 s to 30 ms.
- [done] World loads in one parallel wave instead of five, lightmaps decode off the main thread, the town's shaders compile behind the loading screen, decor collision files are fetched once per file instead of once per prop.
- [done] Lighter downloads for production. Lightmaps ship as WebP q85 at full size (`front/scripts/lightmap.mjs`, run by `assets:optimize`; the bake stays JPEG): 15.2 MB to 9.1 MB, worst PSNR about 36 dB (halving them to 1024 px blurred the shadows, 20 dB, so rejected). Rapier moved from `rapier3d-compat` (WASM inlined as base64) to `@dimforge/rapier3d` with `vite-plugin-wasm`: the shared game chunk went from 854 kB to 50 kB gzip plus a 584 kB `.wasm` that compiles while it streams and stays cached across deploys (Caddy marks hashed `.wasm` immutable).

## Low-config performance (doing, branch perf/low-config-wave-1)

Decision (2026-11-11): the floor is an office laptop with an integrated GPU and 8 GB RAM, at about 30 fps. Costs that need no visual sacrifice are fixed for every tier before new tiers are added. The camera stops where the fog is opaque, on both tiers. Freezing static matrices and the per-frame HUD writes wait for measured numbers. The review behind it is `docs/review/01-optimisation-low-config.md` on branch `docs/game-review-brainstorm`.

- [done] Dev-only render readout: in a dev build the HUD shows the draw calls and triangles of the frame next to the XYZ label, refreshed twice a second. First reading at the spawn on the low tier: 1,027 draw calls, 768,076 triangles for the world alone.
- [done] Camera far at the fog end: 120 m on low (was 300), 250 m on high (was 1000). Same picture, since the fog is opaque and sky-coloured from that distance. At the spawn on the low tier the frame went from about 770,000 to about 185,000 triangles: the farm fields, 150 to 210 m away, were drawn behind the fog.
- [done] Building meshes merged by material when a building loads (`front/src/game/town/mergeStaticMeshes.ts`), exteriors and interiors. The front door, the pub's secret door and its bell stay separate nodes; glass, mirrored and hidden meshes are left alone. A new node that the game moves or looks up by name must be added to `MOVING_EXTERIOR_NODES` or `MOVING_INTERIOR_NODES` in `openHouses.ts`. At the spawn on the low tier the frame went from 885 to 382 draw calls facing the hall, 1,008 to 351 and 1,049 to 500 in two other directions, with the same triangle count. Inside the pub the whole frame is 134 draw calls; its interior file alone held 548.
- [done] The 46 building files were checked after the merge: same triangles per material, same vertex positions and lightmap coordinates, 5,562 draw calls down to 1,131 in total, every front door, the pub's secret door and bell still found.
- [done] Characters out of the view are no longer drawn (`front/src/avatar/characterCulling.ts`): every skinned piece of a modular character is culled on one 2.5 m sphere around its feet, instead of never being culled. At the Northline door on the low tier, back to the shop: 371 to 238 draw calls, 219,738 to 136,856 triangles; facing the shop it is unchanged (430 draw calls), since its mannequins are in the view behind the door.
- [done] Shop mannequins are plain meshes frozen in their rest pose (`front/src/avatar/staticFigure.ts`), merged by material, instead of skinned characters that never moved. A character's regions now share one tinted material per source material. Northline holds 29 mannequins (25 with a hidden body, 41 outfit pieces): about 100 skinned meshes, each with its own skeleton updated every frame, are gone. Facing its door on the low tier the frame went from 430 to 396 draw calls; the skinning time saved was not measured.
- Dropped: instancing the farm plants. In the game they are already instanced by the zone bake (4 draw calls for 1,033 plants in `park/farm_site/farm_site.glb`); only the zone editor clones them. What weighed at the farm was the plant models, 442 to 698 triangles each, about 560,000 triangles for the fields.
- Left to the branch that owns the farm (decided 2026-11-11): lighter field plants. A trial in the zone bake (vertices welded at 0.5 mm, then decimated to 200 triangles a plant) brought `farm_site.glb` from 582,053 to 228,591 triangles with clean shapes; decimating without the weld tore the corn. Nothing of it is kept on this branch.
- [done] Medium tier between low and high (`graphicsQuality.ts`): antialiasing and the environment map on, pixel ratio 1, no shadows, fog and camera at 180 m, full shelf stock. The HUD button cycles low, medium, high. At the spawn its frame is about 720,000 triangles, because the farm fields come inside its fog.
- [done] On the low tier the blurred screen edges of drunkenness and thirst are not drawn; the vignettes stay.
- Not built: choosing the tier automatically at the first launch. It needs frame rates measured on a real low-end laptop to set its thresholds; a wrong upgrade would hurt the players this work is for.
- Withdrawn after reading the code: shop aim raycast every frame (already throttled), NPCs and animals animated far away (already gated on their zone being shown, 26 m). The per-frame HUD writes were left: one text node a frame, not worth the code.

## Tooling (done)

- [done] Two fixed local playtest accounts (`make playtest-accounts`, `PlaytestAccountSeeder`) instead of a new account per playtest; running it again resets coins, health and admin rights.
- [done] Admin watch teleport "Orchard": lands 2.5 m in front of the first orchard tree, facing it (`orchardDestination`, `socket/src/world.ts`).
- [done] Admin watch teleport "Farm": lands 2.5 m inside the farm gate, facing into the farm (`zoneGateDestination`).

## Site redesign with unslop (doing, branch feat/unslop-ui)

Decision (2026-11-11): the site pages are redesigned with the `unslop` skill (`.claude/skills/unslop/`, CC BY 4.0). Direction: cosy, playful, a little nocturnal; the town as it looks in the game, at golden hour; dark ink neutrals; lamplight yellow (`sun`) is the only accent in the chrome; the chunky pressable sun button is the signature and the primary action. Lilita One for large headlines only, Nunito for the interface. Site pages only: the game HUD keeps the current `cc-*` look until its own step. One screen group per step, each reviewed before the next.

- [doing] Landing: full-bleed render of the real town models (Blender, golden hour) instead of floating cubes, a visible headline that says what the game is, one sun button, quiet feature list and FAQ.
- [doing] Auth pages (login, register, forgot and reset password): form on plain ink with the town render beside it on desktop, labels in sentence case, one sun button, quiet links.
- [doing] Logged-in pages and the app shell (home, friends, gems, settings, footer): quiet header and drawer, town render on the Home play card, Home keeps only real player data (the hardcoded level, items, trophies and dates are gone), Home and Friends strings in English and French. Waiting for a review in the browser.
- [todo] Game HUD and overlays.

Decision (2026-11-11, after review): the first redesign looked too close to the old one. The player now picks one of six styles (mockup `docs/mockups/style-directions.html`): Graphite lobby (default), Arcade, Comic, Tactical HUD, Console, Fireside. A style changes colours, fonts, shapes and the page layout, on the site and in the game. Saved in the browser (`cc.theme`), not on the account. Cove Nights is dropped.

- [done] Theme system: `src/theme/themes.ts`, `useTheme`, the saved theme applied in `index.html` before the first paint, every `cc-*` class driven by per-theme CSS variables, twelve self-hosted fonts, style picker in Settings.
- [done] Per-theme layouts (`src/theme/layouts.ts`): top bar, side menu (Tactical HUD) or floating pill (Console) on desktop; landing hero on the left, centred, at the bottom or in two columns with a framed render (Comic); auth form beside the render, or in a card over it (Arcade, Fireside). Phones keep the top bar and drawer.
- [done] Home, Friends, Gems and Settings on every theme: pages use the theme panel (`cc-panel`) and the `line` token instead of white lines, so the light Comic theme works. The Home lobby changes layout per theme (three columns, play banner, big play card, profile strip...).
- [done] Game HUD on every theme and the style picker in the in-game Settings, checked in a playtest (loading screen, pause screen, vitals, hotbar, inventory, live switch from the game menu). HUD positions stay the same on every theme: they are gameplay, not decoration. Not checked yet: the pub mini-games, trade window and shops on each theme.
