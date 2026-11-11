# 3. Checkup of the gameplay that exists

Review date: 2026-11-11, on `feat/fp-hands-punch-watch` at `287fbf2`. Read from the code and data, with the `game-designer` agent. **Nothing was playtested**: walk times and feel are estimates.

## Verdict

- **Earning is a silent grind.** Orchard and farm are both "hold a key for 3 seconds", with no sound, no variance and no progression. Minute 1 and hour 50 are the same.
- **The farm quietly broke the economy decision.** The roadmap says the orchard is the main job at about 900 coins a day. The farm's four crops have their own quotas worth 3,200 more, so the real daily ceiling is about 4,100. Checked in `backend/resources/zones/farm.json` (300 corn x 3, 300 potato x 3, 200 cabbage x 4, 100 pumpkin x 6) and `backend/app/Services/OrchardService.php` (300 apples x 3).
- **It is a multiplayer game with nothing to do together.** No chat, no emotes, no co-op job, no leaderboard. The only way to affect a stranger is to punch them.
- **No reason to come back tomorrow.** No daily order, streak, rotating stock or timed event.
- **One visible bug-looking stub:** the fishing prompt at the pond opens a browser alert, `front/src/views/GameView.vue:508`. A new player reaches the pond in the first minutes.

## System by system

| # | System | State | What is fun | What is weak | Improvements, best ratio first |
|---|---|---|---|---|---|
| 1 | Orchard: hold 3 s on one of 12 trees, carry 20, sell at 3 coins | built | Clear and calm, first-person Pick clip, others see you pick | No sound, no variance, infinite trees, 300 identical holds a day | 1. Feedback pack: rustle, pop, basket counter, coin clink, floating "+60" (S, on the roadmap). 2. Golden apple (S). 3. Daily order and streak (M). 4. Trees run out (M) |
| 2 | Farm crops: same hold on 1,033 plants, sold to a second farmer | built | Four crops, big fields, animals around | A copy of the orchard loop that undermines the orchard decision | 1. One shared daily quota with the orchard (S, economist first). 2. A different verb per crop later (M). 3. A path from the orchard to the farm gate (S) |
| 3 | Farm animals: cow, pig, sheep, dog, hen, rooster wandering in pens | decor only | The town feels alive | No interaction; `farm_egg` and `farm_milk` exist as items but cannot be collected or sold | Make it the "farmhand" job (see the jobs document) |
| 4 | Pub games: darts up to 4 players, Drink Fast race and challenge, Meter Shot | built | Real skill, duels, outcomes owned by the server | No ranks, Meter Shot always loses money, the roadmap numbers are not applied yet | 1. Fee and best payout on the prompt (S, roadmap). 2. Apply darts 20 + 10 and Meter Shot 25 / 60 (S, roadmap). 3. Weekly leaderboard (M, roadmap) |
| 5 | Pub ambience: drinks, intoxication, hangover fee, secret basement with a weekly passphrase and a bouncer | built | The best "place" in the game; the secret is a real explorer hook | Nothing seems to happen behind the door (not checked) | 1. Put something behind the door. 2. More passphrases (S) |
| 6 | Survival: hunger empties in 40 min, thirst in 30, regen above 80, fall damage, free fountains, eat and drink clips | built | Gives the food shops a purpose | Pure upkeep, almost no upside for eating well | 1. Meal buffs tied to jobs (M). 2. Recipes cooked from what you harvest (M) |
| 7 | Cooking: stove or BBQ turns raw fish into grilled fish | stub | - | Raw fish has no source | Ships with fishing |
| 8 | Punch and stamina: 8 damage, 0.8 s cooldown, jab then cross, knockout | built | Good feel work (hit marker, flash, whoosh) | No reason to fight and no safe zone found in `socket/src/punch.ts`; about 13 hits cost a picker their harvest and worn clothes | 1. No-punch zones at jobs and shops (S). 2. A consensual outlet: a boxing ring (M) |
| 9 | Death and clinic: lose consumables, carried furniture and coin-bought worn clothes; hospital fee | built | Real stakes and a clothes sink | The attacker gains nothing, so it is pure griefing; a new player can starve without ever being told about food | 1. First death is free (S). 2. A warning on the watch before starving (S). 3. Paramedic revive (jobs document) |
| 10 | Shops: 14 zones, baskets, clerks, shelf slots | built, playtest pending | Walk-in shopping is charming | Nothing sold changes how you play | 1. Sell job tools and uniforms (M). 2. One rare item rotating weekly (S) |
| 11 | Housing: 10 houses at 2,400 to 5,200, 5% tax per 24 h, keys, furniture | built | The long-term goal and the main sink | 10 units for 30 players per room; nothing to do inside; nobody visits | 1. House perks: a storage chest, a bed that restores health (M). 2. Visitor likes and a "house of the week" (M) |
| 12 | Trade: proximity trade from the watch, 72 h giver age | built | Safe and clear | Nothing rare exists to trade | Rare job drops give it a purpose |
| 13 | Social: remote avatars, sit, trade, friends list on the site | half-built | Seeing others pick, eat, punch | No chat, no emotes, no friends in game | 1. Quick-chat bubbles (S). 2. Emote wheel of 6 clips (M). 3. Text chat (M, needs moderation) |
| 14 | Character and wardrobe: creator, wear slots, premium skins | doing | Identity | Clothes mean nothing: no uniform, no rank piece | Job uniforms and rank cosmetics |
| 15 | World: open town, minimap, doors | built | Compact and readable | No day and night found, no secrets beyond the pub, no job markers on the map (not checked) | 1. Job icons on the minimap (S). 2. Collectibles hidden in town (M) |
| 16 | Onboarding: loading tips, creator, 300-coin welcome bonus | half-built | Fast load, strong creator | No tutorial, quest or objective anywhere | A three-step "first day" checklist on the watch (S to M) |
| 17 | Fishing: spots, 5 fish and 3 rod models | stub | - | The prompt opens a browser alert | Hide the prompt now (S); build the job |
| 18 | Watch: vitals plus a menu with Trade and Admin | half-built | A HUD that lives in the world | Empty; it is the natural home for jobs, orders and ranks | A "Jobs" app (M) |

## Scores (1 to 5)

| Activity | Loop | Feedback | Mastery | Variety | Progression | Social | Verdict |
|---|---|---|---|---|---|---|---|
| Orchard | 5 | 2 | 1 | 1 | 1 | 2 | grind |
| Farm crops | 4 | 2 | 1 | 2 | 1 | 1 | grind |
| Darts | 4 | 3 | 4 | 2 | 1 | 4 | needs ranks |
| Drink Fast | 4 | 3 | 4 | 2 | 1 | 4 | needs ranks |
| Meter Shot | 3 | 3 | 3 | 1 | 1 | 2 | needs depth |

## The numbers behind it

- **Orchard:** 20 apples at about 3.5 s is 70 s, plus about 25 s to walk and sell (estimate): 60 coins per 95 s, about 38 coins a minute. The 300-apple quota is 15 trips, about 24 minutes, of which 15 are pure key-holding.
- **Farm:** 3,200 coins for 900 picks, about an hour at roughly 50 coins a minute.
- **Pub, net per game:** Drink Fast solo -5, duel win +20; Meter Shot -5 at best; a darts duel win +20 to +40. Darts still pays above the "+20" the roadmap decided.
- **Goals:** the cheapest house (2,400) takes 2.7 days on the orchard alone and under one day with the farm. Its tax is 120 coins a day.

## The five biggest gaps

1. **No reason to come back tomorrow.** The only clocks are a rolling sale quota and the house tax.
2. **Nothing to do together except the pub.**
3. **No progression or mastery in earning.** No rank, tool, unlock or skill bonus.
4. **Goals stop at the house.** No status layer after it (titles, collections, boards, rare cosmetics), and no rarity that would make trading matter.
5. **The systems do not feed each other.** Survival does not help jobs, cooking has no input, animals give nothing, shops sell no tools, the pub basement leads nowhere.

## The first 10 minutes of a new player

| Time | What happens | Risk |
|---|---|---|
| 0:00 | Loading screen with tips, about 4 s | Fine |
| 0:05 to 2:00 | Character creator | Strong first moment |
| 2:00 | Spawn in the town centre, newcomer outfit, 300 coins. No objective, arrow or greeting | **Quit point 1: "what do I do?"** |
| 2:00 to 5:00 | Wanders. Shops are closest; a top costs 60 to 400, so the bonus goes on one item, or on a pint and a Meter Shot that cannot pay back | **Quit point 2: broke, with no visible way to earn** |
| 5:00 to 6:00 | Reaches the pond, presses the fishing prompt, gets a browser alert | **Quit point 3: looks broken** |
| 6:00 to 7:00 | If they find the west gate: an orchard prompt, a silent 3 s bar, one apple | |
| 7:00 to 9:00 | Nineteen more silent holds, "basket full". First 60 coins arrive 8 to 9 minutes after spawn | **Quit point 4: the first reward is late and small** |
| 9:00 to 10:00 | Thirst is at about 70%; nobody explained fountains. Has met nobody they can talk to | |

## What I would improve, in order

1. **Hide the fishing prompt** until fishing exists. Minutes of work, removes the worst first impression.
2. **Orchard feedback pack** (already on the roadmap, section 3). It is the cheapest fun in the whole list, and the farm gets it for free.
3. **"First day" checklist on the watch:** pick 5 apples, sell them, buy a drink, with a small one-off payment and an orchard marker on the minimap. Fixes quit points 1, 2 and 4.
4. **Decide the farm's place in the economy** with the `economist`: one shared daily quota across orchard and farm, or lower farm quotas. Until then the 900 a day decision is not true.
5. **No-punch zones** at jobs and inside shops, and a free first death.
6. **Quick-chat bubbles, then an emote wheel.** The cheapest way to make 30 players in a room feel like company.
7. **A daily order and a streak**, shown in a Jobs app on the watch. This is the come-back reason and the home for every future job.
8. **Apply the pub numbers already decided** and add the weekly board.

Points 1, 4, 5 and 8 are corrections to things already decided or already broken. Points 2, 3, 6 and 7 are the ones that change how the game feels.

## Not checked

- Whether a knockout by punches triggers the same loss of belongings as starvation (a comment in the code says "when a player passes out").
- `/api/orchard/sell` still exists next to `/zone/sell`. If both are reachable they would count quotas separately. Worth a look before touching quotas.
- What is behind the pub basement door, whether shop stock is ever finite, and whether a jetty or shore exists.
