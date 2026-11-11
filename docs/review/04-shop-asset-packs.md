# 4. Brainstorm: asset pack themes for the next shops

Brainstorm only, 2026-11-11. No code, nothing decided. Twenty packs to pick from, each written against what is already in the repo so nothing is built twice.

**What exists, so it is not repeated.** Open shops: Northline and Cove Threads (clothes), Hearth & Hollow and Cove Home (decor and furniture), GreenCart (supermarket), Crispin's Hardware, Candy Cloud (sweets), Summit Sports, plus the clinic, the pub, the cafe, a boutique and a tech hub. The mall layout has 116 planned cells, two under construction (a pet shop in N12 and a services unit in N21) and a pharmacy marked ready to open. There are 127 decor props.

**Budgets from the style guide.** A furniture prop is about 600 triangles, one node, two materials, pastel low-poly.

**Procedural or AI.** Each card says which pieces should be procedural builders (boxy, repeated, sized to fit: shelves, counters, racks, signs) and which are better as AI models from `make model` (organic or detailed single objects).

**Performance warning.** Every shop adds draw calls, and clothes shops add mannequins (see the optimisation report, findings 1 and 3). The mesh merge should come before the next batch of shops.

## Quick view

| # | Pack | Mall cell it fits | New props | Sells something that changes play? | Cost |
|---|---|---|---|---|---|
| 1 | Tackle and Tide | new hut at the pond | 8 | yes: rods, bait | S |
| 2 | Pet shop | N12, already under construction | 10 | yes: a pet at home | M to L |
| 3 | Barber and salon | Quick Cuts | 8 | yes: the paid barber on the roadmap | M |
| 4 | Bakery | Golden Crust | 7 | yes: apple pie | S |
| 5 | Ice cream parlour | Scoop Dreams | 7 | small | S |
| 6 | Food court kit | 4 fast-food cells | 9, reskinned 4 times | meals with buffs | M |
| 7 | Record shop | Vinyl Vault | 8 | yes: music at home | M |
| 8 | Arcade | Pixel Palace Arcade | 9 | yes: mini-games and prizes | L |
| 9 | Bookshop | Page Turner Books | 7 | yes: the collection book, recipes | S |
| 10 | Electronics and watch bar | Volt Electronics, Pocket Gadgets | 8 | yes: watch faces and apps | M |
| 11 | Camera shop | Shutter Speed Cameras | 7 | yes: photos as wall frames | L |
| 12 | Florist and garden centre | Petal & Pot, Casa Verde | 9 | yes: plants that need water | M |
| 13 | Accessories trio | eyewear, jewellery, cosmetics cells | 8 | cosmetic | M |
| 14 | Shoe shop | Sole Society | 6 | cosmetic | S |
| 15 | Toy shop | Kokoro Toys | 9 | yes: toys to play with others | M |
| 16 | Pharmacy | Cove Pharmacy | 6 | yes, but changes a decision | S |
| 17 | Cinema | Starlight Cinema | 9 | a place to be together | L |
| 18 | Gym and boxing ring | the gym cell | 7 | yes: a fair place to fight | M |
| 19 | Weekly market stalls | outdoors, town square | 8 | rotating stock | M |
| 20 | Second-hand shop | a gifts cell | 7 | rotating rare stock | S |

## A. Packs that serve the next jobs

### 1. Tackle and Tide (bait and tackle)
- **Look:** weathered wood, navy and cream, rope and cork, a hand-painted fish sign.
- **Props to build:** rod wall rack, tackle pegboard, bait fridge with a glass door, net barrel, mounted-fish plaque, counter shaped like a rowing boat, buoy string, tide chalkboard.
- **Already have:** `fish_counter`, `wooden_barrel`, `aquarium`, 3 rods, 5 fish.
- **For sale:** the three rods as tiers, bait tins, a landing net, trophy plaques for your wall.
- **Wear:** bucket hat, fishing vest, waders.
- **Hook:** opens with the Angler job.
- **Build:** procedural for rack, pegboard, fridge, counter; AI for the mounted fish and the net barrel.

### 4. Bakery
- **Look:** warm cream and terracotta, wicker, brass, a striped awning.
- **Props to build:** bread wall rack, glass pastry case, cooling trolley, flour sacks, dough table, chalk menu board, tiered cake stand.
- **Already have:** `bakery_counter`, `bakery_oven`, `baguette_barrel`.
- **For sale:** croissant, baguette, cinnamon roll, apple pie (the roadmap's use for apples), a birthday cake you place at home and share by the slice.
- **Wear:** toque, floury apron.
- **Hook:** bring 5 apples, get a pie. Home of the Baker job.
- **Build:** all procedural except the cake and pastries (AI, then small).

### 12. Florist and garden centre
- **Look:** a greenhouse corner, sage green, terracotta, galvanised steel buckets.
- **Props to build:** greenhouse frame, seed spinner rack, bouquet buckets, potting bench, trellis, garden gnome, bird bath, small fountain, hanging baskets.
- **Already have:** `flower_stand`, `potted_plant`, `potted_shrub`, `monstera`, `cactus`, `vase_tulips`, `watering_can`, `wheelbarrow`, `garden_bench`, `sun_lounger`, `parasol`, `bbq_grill`.
- **For sale:** seeds that grow in a pot at home and need watering every day (a come-back reason), bouquets to give to another player, garden furniture.
- **Wear:** gardening gloves, apron, straw hat (exists).
- **Hook:** a living thing in your house. Home of the Park gardener job.
- **Build:** procedural frame, rack, bench, trellis; AI for gnome, bird bath, fountain.

### 18. Gym and boxing ring
- **Look:** rubber floor, black and safety yellow, mirrors, big wall lettering.
- **Props to build:** bench press, punching bag, boxing ring, lockers, water cooler, weight plates tree, pull-up frame.
- **Already have:** `treadmill`, `dumbbell_rack`, `yoga_mat_rolls`, `basketball_hoop`.
- **For sale:** boxing gloves (a hand cosmetic for the punch), sweatbands, protein shake.
- **Wear:** boxing shorts, hand wraps, gym vest.
- **Hook:** the ring is the one place where punching is agreed by both players, with a round, a bell and a winner. It gives the punch a home and lets the rest of town become safe.
- **Build:** procedural for all but the punching bag.

## B. Packs that make the house worth owning

### 2. Pet shop (cell N12 is already under construction)
- **Look:** bright, rounded, mint and orange, paw prints on the floor.
- **Props to build:** bird cage, hamster run, puppy pen, scratching post, pet bed stack, kibble sack pallet, leash rack, grooming table, fish tank wall, treat jar counter.
- **Already have:** `aquarium`, and the animal pipeline (Quaternius rigs with our own meshes).
- **For sale:** pet bed, bowl, scratching post as furniture; then a pet that lives in your house.
- **Hook:** phase 1, a pet that idles and wanders inside your house, built like the chicken. Phase 2, it follows you in town. Phase 1 is far cheaper and already a reason to own a house.
- **Build:** procedural pens, racks, shelves; AI for cage and scratching post; pets from the animal builder.

### 7. Record shop
- **Look:** dark wood, orange and teal, band posters, a neon note.
- **Props to build:** record crates, listening booth, sleeve wall, turntable counter, guitar wall, amp stack, neon sign, poster frames.
- **Already have:** five headsets as head accessories, a `music` asset folder.
- **For sale:** a record player that plays music in your house, records as collectables (one track each), a guitar (the Busker's tool), posters.
- **Hook:** your house has its own sound, and visitors hear it.
- **Build:** procedural crates, wall, counter; AI for guitar, turntable, amp.

### 9. Bookshop
- **Look:** green and brass, tall dark shelves, a rolling ladder, a reading corner.
- **Props to build:** tall bookcase with ladder, new-release table, magazine spinner, till desk with a bell, reading lamp, book stacks, a sleeping cat.
- **Already have:** `bookshelf`, `armchair_lounge`, `globe`, `floor_lamp`.
- **For sale:** the collection book (apple varieties, fish, shells), recipe books that unlock recipes, an angler's almanac that shows where fish bite, maps and posters.
- **Hook:** knowledge as a product: books unlock information, never income.
- **Build:** all procedural except the cat.

### 10. Electronics and watch bar
- **Look:** white and cool blue, glowing shelves, a long demo table.
- **Props to build:** TV wall, phone demo table, console kiosk, cable bins, boxed-goods pallet, watch bar with stands, speaker tower, security gate.
- **Already have:** `computer_setup`, `tv_bench`, `arcade_cabinet`, the smartwatch model.
- **For sale:** watch faces and straps, watch apps (Jobs, compass, fish finder), a TV and speaker for the house.
- **Hook:** the watch is already on every wrist. Selling faces and straps is the cheapest new cosmetic line in the game, because it is one small model everybody looks at all the time.
- **Build:** all procedural; faces are textures.

### 15. Toy shop
- **Look:** primary colours on white, oversized shapes, a kite ceiling.
- **Props to build:** plush mountain, train table, block tower, giant teddy, ball pit, kite ceiling, puppet theatre, spinning display, board-game shelf.
- **Already have:** `toy_chest`, `bean_bag`.
- **For sale:** plush toys as furniture, a ball to throw and catch with another player, a kite, a water pistol, a board-game table for your house.
- **Hook:** toys are the first items made to be used with someone else.
- **Build:** procedural table, tower, shelf; AI for plush and teddy.

## C. Packs for the character

### 3. Barber and salon
- **Look:** black and white tiles, red leather, chrome, a turning barber pole.
- **Props to build:** barber chair, mirror station, wash basin, barber pole, product shelf, hood dryer, waiting bench, tool trolley.
- **For sale:** a haircut (opens the hair part of the editor), hair dye, beard and moustache (a builder exists and is not wired yet).
- **Hook:** this is the paid barber the roadmap says will replace the free editor key. Sitting in the chair with a mirror camera is the moment.
- **Build:** procedural station, shelf, bench; AI for chair, basin, dryer.

### 13. Accessories trio (eyewear, jewellery, cosmetics)
- **Look:** small bright cells: white and gold for jewellery, pink and mirror for cosmetics, wood and glass for eyewear.
- **Props to build:** lit glass case, ring pedestal, spinning glasses rack, vanity with bulbs, necklace bust, perfume shelf, try-on mirror, velvet tray.
- **Already have:** `mirror_standing`, `display_plinth`, `head_form_table`.
- **For sale:** glasses and sunglasses, earrings, necklaces, makeup looks.
- **Hook:** faces are drawn, so makeup and eye colour are textures, not models: cheap to make in volume.
- **Build:** one shared glass-case builder for all three; AI only for a few hero jewels.
- **Check first:** which wear slots exist for face and neck (`docs/CHARACTER.md`). I assumed new slots are needed.

### 14. Shoe shop
- **Look:** concrete, plywood, one colour accent, a lit slanted wall.
- **Props to build:** slanted shoe wall, lit sneaker pedestal, try-on bench, foot measure, shoe-box tower, floor mirror.
- **Already have:** `shoe_wall_shelf`.
- **For sale:** 8 to 10 pairs; one limited pair each week.
- **Hook:** the weekly drop. Cosmetic only, no speed bonus.
- **Build:** all procedural; the shoes use the wear pipeline.

## D. Places to hang out

### 8. Arcade
- **Look:** dark carpet with neon shapes, purple and cyan glow, ticket strings.
- **Props to build:** three cabinet skins, claw machine, air hockey table, dance pad, hoop-shot machine, prize counter, ticket dispenser, change machine, neon signs.
- **Already have:** `arcade_cabinet`, `basketball_hoop`.
- **For sale:** tickets won at games buy plush, posters and a cabinet for your house.
- **Hook:** two playable machines reuse what exists: the claw is the power meter, the hoop shot is darts. Coins go in, only prizes come out: a clean sink.
- **Build:** procedural cabinets and counter; AI for claw machine and plush.

### 17. Cinema
- **Look:** burgundy velvet, gold trim, a marquee with bulbs.
- **Props to build:** ticket booth, popcorn machine, poster frames, velvet ropes, seat rows, screen, marquee sign, candy counter, usher stand.
- **For sale:** tickets, popcorn, a film poster for your house.
- **Hook:** sit together and watch a short loop. The most expensive pack here for what it adds; I would not do it soon.

### 11. Camera shop
- **Look:** black and warm wood, a small studio corner with a paper backdrop.
- **Props to build:** camera shelf, tripod stand, softbox light, paper backdrop roll, photo frame wall, print counter, lens case.
- **For sale:** a camera you hold, frames, filters.
- **Hook:** a photo you take becomes a framed picture on your wall. Home of the Street photographer job. Large in code (capturing and storing images), so later.
- **Build:** procedural shelf, wall, counter; AI for camera, tripod, softbox.

### 5. Ice cream parlour
- **Look:** pastel stripes, chrome stools, a giant cone on the roof.
- **Props to build:** scoop freezer with tubs, cone tower, sundae bar, soft-serve machine, giant cone sign, topping jars, striped booth.
- **Already have:** `bar_stool`, `parasol`.
- **For sale:** cones with 1 to 3 scoops, milkshake (uses farm milk), a flavour of the week.
- **Hook:** it melts: eat it before the timer or lose a scoop. Small and funny.
- **Build:** procedural freezer, bar, booth; AI for the cone sign.

## E. Food and everyday

### 6. Food court kit (one kit, four restaurants)
- **Look:** one shared counter, four skins: burgers (red and yellow), tacos (turquoise and coral), pizza (green, white, red), noodles (black and red lanterns).
- **Props to build:** counter front with a swappable sign and menu board, fryer, drinks fountain, tray rail, food-court table set, tray return, napkin stand, heat-lamp pass, mascot statue.
- **Already have:** `trash_bin`, `dining_table`, `dining_bench`.
- **For sale:** one signature meal per counter, each with a different buff (stamina, slower hunger, slower thirst, warmth).
- **Hook:** best ratio in this document: one build, four shops open.
- **Build:** all procedural with a colour and sign parameter; AI for the four mascots.

### 16. Pharmacy
- **Look:** white and green, a lit cross, drawers to the ceiling.
- **Props to build:** cross sign, pill-drawer wall, glass counter, blood-pressure chair, scale, leaflet rack.
- **Already have:** an `items/medical` folder.
- **For sale:** bandages, vitamins, sunscreen.
- **Careful:** `docs/MALL.md` records the decision that the clinic is the only place selling medicine. Opening this is a product decision to take first, not just an asset pack.

### 19. Weekly market stalls (outdoors)
- **Look:** striped canvas, wooden crates, chalk price tags, bunting across the square.
- **Props to build:** stall frame with canvas in four colours, cheese wheel table, honey jar pyramid, fish on ice, bread basket, flower cart, bunting line, cash tin.
- **Already have:** `produce_table` and its three variants, `vegetable_crate`, `produce_scale`, `hay_bale_round`, `milk_churn`.
- **For sale:** a stock that changes every week, including one item not sold anywhere else.
- **Hook:** the market is only there two days a week. That alone is a reason to log in.
- **Build:** all procedural.

### 20. Second-hand shop
- **Look:** mismatched everything, warm bulbs, a handwritten sign.
- **Props to build:** mismatched clothes rack, bric-a-brac shelf, record bin, old TV, suitcase stack, odd lamp table, bargain bucket.
- **Already have:** `knick_shelf`, `promo_bin`, mannequins.
- **For sale:** past weekly items coming back at random, a few oddities.
- **Hook:** the answer to "I missed last week's item", and a cheap way to get a rotating rare stock.
- **Build:** mostly reuse with new colours.

## Pieces worth building once for all shops

A parametric lit glass case, a counter with size and colour options, a wall slat panel that takes hooks and shelves, a neon sign builder from a text and a colour, a menu or price board, a lit pedestal. Six builders cover most of the "props to build" lists above.

## My picks

1. **Tackle and Tide**, if the Angler is the next job. Small, and the two ship together.
2. **Food court kit.** One build opens four cells, and the mall stops looking closed.
3. **Electronics and watch bar.** Watch faces are the cheapest cosmetic to produce and the most looked-at.
4. **Barber.** Already promised by the roadmap, and it turns a free menu into a place.
5. **Pet shop, phase 1 only.** The cell is already under construction, and a pet at home is the strongest reason to own a house. I would hold back the pet that follows you in town.

I would leave the cinema and the camera shop for much later: both are large pieces of code for one moment each.

## Out of scope, but worth knowing

Many of the 116 planned cell names in `front/public/assets/store/mall/mall.layout.json` look like the shop names of the mall that inspired the layout (`docs/MALL.md` names the game). Examples: "Colby's Movieland Lounge", "Jill's Sandwiches", "Kokonutz Sports", "Ned's Knicknackery", "Tucci's of Rome". I did not check each one against the source. For a real product these should get original names before a cell opens or a sign is drawn. Nothing was changed.
