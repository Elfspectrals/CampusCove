# 2. Brainstorm: the next jobs

Brainstorm only, 2026-11-11. No code, nothing decided. Pick, cross out, or ask for another round. Twelve full cards (with the `game-designer` agent), then nine shorter pitches, then the systems worth building once for all jobs.

**Rules every idea follows.** The outcome is judged by the socket clock and paid by Laravel; the client never decides a reward. Inputs reuse what exists: hold to act, the darts power meter, the Drink Fast balance bar, a timing window, an item carried in hand. Clip lengths and costs are estimates. FP = first person, TP = third person. Cost is S / M / L for assets, code, animation.

**One warning before reading.** Orchard plus farm already pay about 4,100 coins a day against a decided 900 (see the gameplay checkup). Any new job should come with a shared daily wage budget, otherwise each job adds income instead of choice.

## Quick view

| # | Job | Mood | With others | Reuses | Cost (assets / code / anim) |
|---|---|---|---|---|---|
| 1 | Angler | calm, skill spike | tournament | rods, fish, pond spots, cooking | S / M / M |
| 2 | Farmhand: eggs and milk | calm, daily | solo | animals, coop, barn, farm outfit | S / M / S |
| 3 | Courier | active | visits houses | whole map, sprint, doors | S / M / S |
| 4 | Barista | indoor, rush | 2 stations | Campus Cafe | M / M / M |
| 5 | Night bartender | social | serves players | pub, pour timing | S / M / S |
| 6 | Beachcomber | explorer | solo | - | L / M / S |
| 7 | Crab potter | come back later | haul in pairs | pond jetty | M / M / S |
| 8 | Paramedic | co-op, urgent | saves players | clinic, punch, death | S / M / M |
| 9 | Cider runner | shady, night | stealth | pub basement, apples | M / L / M |
| 10 | Woodcutter and carpenter | physical, crafting | two-person saw | Crispin's Hardware | M / M / M |
| 11 | Shelf stocker | indoor, memory | solo | shelf slots, staff polo | S / M / S |
| 12 | Busker | performance | needs a crowd | town square | S / M / M |

## The twelve cards

### 1. Angler (fishing, done properly)
- **Pitch:** cast at the pond, later a pier. Calm with a skill spike. Rods, fish, spots and the cooking recipe already exist.
- **Loop:** cast with the power meter (distance picks the fish table), wait for a bite rolled by the server, hook inside a timing window, reel with the balance bar, sell to a fishmonger or cook it.
- **Building:** a bait-and-tackle hut by the pond gate (small exterior, counter, clerk); a fishmonger stall reusing the `fish_counter` prop.
- **Clothing:** bucket hat, fishing vest, waders, rubber boots (exist), creel basket. Rare: yellow sou'wester set.
- **Animations:** `Cast` one-shot 1.2 s, `FishIdle` loop 2 s, `Hook` one-shot 0.4 s, `Reel` loop 1 s, `HoldCatch` one-shot 1.5 s, FP and TP.
- **Gamify:** line tension as the skill, fish that only bite at certain spots or weeks, weekly biggest-catch board, two-player tournament.
- **Special rewards:** fish collection book, trophy fish as wall furniture, rod skins. **Jackpot:** the golden arowana, announced to the room.
- **Economy:** inside the shared wage budget; rods and bait are the sink. The server owns bite time, species, size, hook window and the reel simulation (reuse `drinkFastSim`).

### 2. Farmhand: eggs and milk
- **Pitch:** the morning round. The animals already walk around with nothing to give, and `farm_egg` and `farm_milk` already exist as items.
- **Loop:** collect eggs from nests that refill on a server timer, milk the cow on a three-beat timing window, carry the churn in hand to the farmer.
- **Building:** nothing new: coop, barn and churn exist. Add nest props and a milking stool.
- **Clothing:** the farm pack exists (bandana, flannel, boots). Rare: prize-rosette apron.
- **Animations:** `Milk` loop 1.5 s, `Gather` one-shot 1 s (crouch), `CarryTwoHands` loop.
- **Gamify:** good rhythm fills the churn faster, nests go stale after a few hours (a come-back hook), an animal that remembers being fed each day.
- **Special rewards:** recipes (omelette, milkshake), a pet hen for the house. **Jackpot:** a golden egg that becomes a trophy.
- **Economy:** capped by timers, so naturally small and daily. A good place to move income out of the hold-to-pick crops.

### 3. Courier
- **Pitch:** parcels from a depot to houses and shops. Makes the whole map and the sprint matter.
- **Loop:** take a parcel (in hand) and an address, run the route, knock (hold), next. Fragile parcels break on a fall or a punch.
- **Building:** a depot counter in the work district. Later a hand cart.
- **Clothing:** cap, polo, shorts, trainers, satchel. Rare: gold-stripe express jacket.
- **Animations:** `CarryBox` loop, `Knock` one-shot 0.8 s, `HandOver` one-shot 1 s.
- **Gamify:** route choice and stamina, express timers, three-parcel chains, daily fastest-round board.
- **Special rewards:** titles, a doormat with your name. **Jackpot:** a mystery parcel you may keep.
- **Economy:** paid per delivery on a distance computed by the server. Deliveries to player houses get players visiting each other.

### 4. Barista at Campus Cafe
- **Pitch:** short indoor shifts in a shop that already exists.
- **Loop:** read the ticket, pull the shot (stop a meter in the zone), steam milk (balance bar), serve the queue or a real player.
- **Building:** a working counter behind the cafe bar: machine, ticket rail, three customer spots.
- **Clothing:** apron, rolled-sleeve shirt, visor. Rare: latte-art champion apron.
- **Animations:** `PullShot` one-shot 1.5 s, `Pour` loop 1 s, `Serve` one-shot 0.8 s.
- **Gamify:** stars per cup, a morning rush, two baristas splitting stations, combo streaks.
- **Special rewards:** a secret-menu recipe, a coffee machine for the house. **Jackpot:** "the critic" visits; a perfect cup earns a signed photo.
- **Economy:** a shift wage plus tips. Tips must be transfers between players, never new coins.

### 5. Night bartender at the pub
- **Pitch:** the pub hires; players serve players.
- **Loop:** take the order, pour a pint (the 3 s pour exists; add a tilt on the balance bar), slide it to the seat, collect empties.
- **Building:** none: bar, taps and seats exist.
- **Clothing:** waistcoat, bow tie, bar towel. Rare: emerald waistcoat.
- **Animations:** `PullPint` one-shot 3 s, `Slide` one-shot 0.6 s, `Wipe` idle loop.
- **Gamify:** head-size accuracy, regulars with a favourite drink, last-orders bell, tip of the night.
- **Special rewards:** a spot on the staff photo wall, an engraved tankard. **Jackpot:** the basement crowd orders a round.
- **Economy:** keeps the pub a place to spend: the bartender takes a cut of what customers pay, a transfer.

### 6. Beachcomber
- **Pitch:** walk the shore for shells and washed-up finds. The calmest job, for explorers.
- **Loop:** spot a glint (seeded by the server, moved daily), dig (hold), identify, sell to a collector or donate to a museum shelf.
- **Building:** needs a shore: no beach zone exists today, so a new zone plus a collector hut.
- **Clothing:** sun hat, linen shirt, rolled trousers, sandals, bucket. Rare: pearl necklace.
- **Animations:** `Dig` loop 1.5 s, `Inspect` one-shot 1.2 s.
- **Gamify:** knowing where things wash up, two tide windows a day, a metal detector upgrade.
- **Special rewards:** shell collection book, driftwood furniture. **Jackpot:** a message in a bottle that starts a small treasure trail.
- **Economy:** few coins, high collection value.

### 7. Crab potter
- **Pitch:** drop pots, come back later. The "see you tomorrow" job.
- **Loop:** buy bait, drop up to three pots, wait 20 minutes to several hours, haul (hold plus a tug timing), sort and sell.
- **Building:** a pier and a pot rack. Could start small at the pond with crayfish.
- **Clothing:** oilskin jacket, bib trousers, gloves, beanie. Rare: captain's cap.
- **Animations:** `Haul` loop 1.2 s, `ThrowPot` one-shot 1 s.
- **Gamify:** bait and spot choice, pots that spoil if left too long, two players haul faster.
- **Special rewards:** aquarium furniture, a crab pet. **Jackpot:** a blue lobster.
- **Economy:** capped by pot count and timers; bait is the sink. Pots are saved in the database.

### 8. Paramedic
- **Pitch:** turns the punch and death into co-op: reach a downed player before they lose their things.
- **Loop:** an alert on the watch, run, revive (hold plus two timing beats), walk them to the clinic.
- **Building:** none: clinic, nurse and beds exist. A locker and a kit prop.
- **Clothing:** green tunic, cargo trousers, kit bag. Rare: gold pin.
- **Animations:** `Kneel` and `Revive` loop 2 s, `Bandage` one-shot.
- **Gamify:** response time, a saves counter, an on-duty rota of two.
- **Special rewards:** "Lifesaver" title, a thank-you emote from the saved player. **Jackpot:** a 100th-save medal.
- **Economy:** paid from the hospital fee the victim avoids, a transfer. Exploit: friends punching each other to farm revives, so a cap per pair and per day. Needs a longer downed window than today's knockout.

### 9. Cider runner (shady, at night)
- **Pitch:** the pub's secret basement finally has a purpose: a still. Fits the passphrase and the bouncer.
- **Loop:** bring your own apples, press and time the still, carry the crate through town out of the watchman's sight, collect.
- **Building:** a still set in the basement, a watchman on a patrol path.
- **Clothing:** flat cap, dark coat, fingerless gloves. Rare: bootlegger's scarf.
- **Animations:** `Press` loop 1.5 s, `Sneak` loop, the carry clip.
- **Gamify:** stealth routes, crate quality, weekly demand.
- **Special rewards:** bottled house cider (drinkable, tradeable), a speakeasy poster. **Jackpot:** a vintage batch with a unique label.
- **Economy:** pays in goods, not coins, and gives apples a use that mints nothing. Replaces the roadmap's weekly cider counter with something players do.

### 10. Woodcutter and carpenter
- **Pitch:** chop behind the orchard, build furniture at Crispin's Hardware. Feeds housing.
- **Loop:** three swings in the sweet spot per log, carry logs, saw at the bench (balance bar), get a plank or a furniture piece.
- **Building:** a wood lot (trees, stump, log pile) and a bench inside Crispin's.
- **Clothing:** checked shirt, work trousers, gloves, ear defenders. Rare: carved-handle axe skin.
- **Animations:** `Chop` one-shot 1 s, `Saw` loop 1 s, `CarryLog` loop.
- **Gamify:** perfect swings, weekly blueprints, a two-person saw.
- **Special rewards:** craft-only furniture never sold in shops, your name on your pieces. **Jackpot:** a rare burl that gives a unique table.
- **Economy:** pays mostly in furniture. Crafted pieces must follow the same rules as bought ones, or trade gets flooded.

### 11. Shelf stocker
- **Pitch:** the mall hires; restock the shelf slots that already track counts.
- **Loop:** take a box from the stock room, carry it, face the right slot, place (hold), repeat before the timer.
- **Building:** a stock room door per shop. No new shop.
- **Clothing:** the staff polo exists; add a name badge. Rare: employee-of-the-month badge.
- **Animations:** `PlaceItem` one-shot 0.8 s, the carry clip.
- **Gamify:** remembering where items live, rush hours, a tidy-shelf bonus.
- **Special rewards:** a staff discount for the day, a shop-sign furniture. **Jackpot:** a mystery pallet.
- **Economy:** a small wage.

### 12. Busker
- **Pitch:** play at the fountain. A job that only exists when others are around.
- **Loop:** pick a pitch, play a four-lane timing chart, a crowd meter fills, passers-by tip.
- **Building:** three marked pitches; guitar and hat props.
- **Clothing:** beanie, denim jacket, guitar strap. Rare: sequin jacket.
- **Animations:** `Strum` loop 2 s, `Bow` one-shot 1.2 s, a listener clap.
- **Gamify:** song difficulty, duets, a Saturday open mic.
- **Special rewards:** a song book, a street poster of you. **Jackpot:** an encore with a town-wide banner.
- **Economy:** almost no new coins. Needs music to be made, which is its real cost.

## Nine more pitches (shorter, for volume)

| # | Job | Loop in one line | Building and props | Outfit | New clips | Twist and special reward |
|---|---|---|---|---|---|---|
| 13 | Beekeeper | Smoke the hive (hold), lift frames on a calm balance bar, spin honey | Six hives beside the orchard, an extractor shed | Veil hat, white suit, gloves. Rare: gold smoker | `Smoke` loop, `LiftFrame` one-shot | Bees get angry if you rush. Honey jar recipe, a hive for your garden. Jackpot: royal jelly |
| 14 | Mall night guard | Patrol checkpoints with a torch after closing, catch an NPC shoplifter | Security office (a `security` asset folder already exists), camera wall | Uniform shirt, cap, torch, radio. Rare: sergeant stripes | `TorchWalk` loop, `Radio` one-shot | Only at night; stealth in reverse. Master key cosmetic, CCTV monitor furniture |
| 15 | Street photographer | Daily brief ("a player picking", "the pub sign at dusk"), frame it, the server checks what is in view | Photo counter in the camera shop cell | Camera strap, vest. Rare: vintage camera skin | `RaiseCamera`, `Snap` | Your photos become framed pictures for your house. Weekly gallery vote |
| 16 | Gadget repair at the Tech Hub | A broken device arrives, find the fault (memory), solder on a timing window | A bench inside the Tech Hub work building | Lab coat or hoodie, magnifier headband | `Solder` loop, `Inspect` one-shot | Hard mode devices. Watch faces and straps as rewards |
| 17 | Baker | Knead (rhythm), shape, oven timing window: too early is raw, too late is burnt | The bakery cell; counter and oven props exist | Toque, white jacket, floury apron. Rare: gold whisk pin | `Knead` loop, `SlideTray` one-shot | Dawn shift bonus. Apple pie recipe (uses orchard apples), a cake you can place and share |
| 18 | Park gardener | Water, prune and replant beds that wilt on a server timer | Park shed, hose reel, wheelbarrow (exists) | Dungarees, gloves, knee pads, straw hat (exists) | `Water` loop, `Prune` one-shot | The park visibly blooms when players keep it up. Plant pots for the house |
| 19 | Sheep shearer | Catch the sheep, hold it steady (balance bar), shear in strokes | Shearing pen at the farm; the sheep is already planned | Vest, cap, shears. Rare: blue-ribbon rosette | `Shear` loop, `Catch` one-shot | Seasonal week. Wool gives a knitted jumper nobody can buy |
| 20 | Litter picker and recycler | Pick litter spawned around town, sort into three bins by type | Recycling point with three bins, a grabber tool | Hi-vis vest, gloves. Rare: green cape | `Grab` one-shot, `Toss` one-shot | A town cleanliness meter everybody fills. Statue plaque with the week's top names |
| 21 | Boutique stylist | An NPC asks for a look ("smart, blue, under 300"), you dress a mannequin from the racks | The boutique work building and mannequins exist | Tape measure, pin cushion, smart outfit | `Measure`, `Present` | Players can ask for a look too. A discount token, your look in the shop window for a day |

## How I would rank them

**By fun per cost:** Angler, Farmhand, Courier, Bartender, Paramedic, Shelf stocker, Baker, Barista, Beekeeper, Busker, Crab potter, Woodcutter, Cider runner, Beachcomber.

**My top three, and why:**
1. **Angler.** Models, rods, spots, the recipe and both input mechanics already exist, and it removes a stub a new player runs into. It is the first job with real skill and a collection.
2. **Farmhand.** Animals, items, buildings and the outfit are done. Timer-gated nests are the cheapest "come back later" hook in the list.
3. **Courier.** Almost no assets, and it gives a purpose to the map, the sprint, the doors and other players' houses. Take Paramedic instead if the priority is to fix the punch.

**Where I disagree with a pure fun ranking:** Cider runner is the most original and the one players would talk about, but it is the most expensive in code (stealth, a patrol, detection). I would keep it as the reward for later, not the next job. Beachcomber needs a whole new zone, so it only makes sense on the day a shore is built for another reason.

**Jobs that fit buildings already built:** barista (cafe), bartender (pub), paramedic (clinic), stylist (boutique), gadget repair (tech hub). The five work buildings have folders under `front/public/assets/work`; I did not check what each interior already contains.

## Systems to build once, for every job

1. **Shared wage budget.** One daily full-price allowance across all jobs, sized by the `economist`. A new job adds choice, not income.
2. **Work action module** in the socket: hold, timing window, power meter and balance simulation behind one judged contract.
3. **Job ranks.** Experience per job from paid actions, shown on the watch. Ranks unlock uniform pieces and tools, never raw income.
4. **Jobs app on the watch, with a daily board.** Today's orders, streaks, quota left, where each job is.
5. **Uniform locker and tool tiers.** Uniforms handed out at the workplace as wear pieces; tools (three rods, then axe and pots) sold at Crispin's.
6. **Collection book and weekly boards.** Fish, apple varieties, shells and trophies in one book with badges, plus the same HTML board as the pub.

## Open questions for the economist before any of this

- Is 4,100 coins a day (orchard plus farm) intended? If not, merge or cut the quotas first.
- How big is the shared wage budget, and what share does each job get at best and at realistic play?
- Which sink absorbs tool tiers and bait?
- Caps per pair and per day for the paramedic and for tips.
