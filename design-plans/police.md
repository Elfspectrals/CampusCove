# Police

Approved by the user on 2026-11-13, after a `game-designer` design and an `economist` review. V1 targets 15 to 20 players
per city instance; crime between players is allowed (roleplay).

## Station

A dedicated `police` zone east of the town (the free strip between the pub and the retail park), entered through a hedge
gate like the clinic. Rooms: a front desk with an NPC officer, an open office, a locker room, three cells. Each cell has
a tap (drink) and a hatch where a meal tray arrives on its own.

Look (decided 2026-11-13): a large, imposing neoclassical city police station in the spirit of survival-horror city
precincts (stone facade, columned portico, wide steps, a tall entrance hall), our own design and not a copy of any game's
building. A car park in front. Uniform: beige sheriff shirt, brown trousers, sheriff hat. Cells line the open office
with bars facing it.

### Pieces and sources

| Piece | Source | Why |
|---|---|---|
| Walls, floors, ceilings, portico columns, steps, pediment, cornice, doors, windows | builders (`lib_common`, `lib_kit`) | building pieces |
| Cell bars and cell doors | builder (rails) | thin repeated rails |
| Front desk | existing `decor/service_desk` | reuse |
| Office desks, chairs, computers, filing cabinets | existing `decor/desk_study`, `office_chair`, `computer_setup`, `filing_cabinet` | reuse |
| Cell bunk, toilet | existing `decor/bunk_bed` or `bed_single`, `toilet` | reuse |
| Cell tap (wall basin) | existing `decor/sink_vanity` if it fits a cell, else builder | reuse first |
| Meal hatch with tray | builder (box hatch and flat tray) | plain boxes; food on it is the existing food items |
| Lockers | builder (plain boxes) | flat boxes the AI does badly |
| Wanted board | builder (board and paper planes) | flat |
| Car park lines, bike racks, barrier | builders | flat or thin |
| Parked patrol cars (decor only) | `make model` | complex shape; decor, not a vehicle |
| Uniform: sheriff shirt, trousers, hat | `front/scripts/skins/wear.py` | clothes follow the skeleton |

## Wanted level

0 to 5 stars, owned by the socket.

| Offence | Stars |
|---|---|
| First punch on a player (at most once a minute per victim) | +1 |
| Murder | +3 |
| Picking up the cash bag of a murder you did not suffer | +2 |
| Pickpocket seen by a witness | +2 |
| Failed pickpocket | +1 |
| `reportCrime(player, kind)`: lockpicking, alarm (other features) | +1 / +2 |

One star is lost every 4 minutes without an offence, counted on connected time only. The record is persisted.

## Player police officer

- Licence: 300 coins from the bank, account 72 h or older. Kept for life, lost at death, bought again.
- Duty starts and ends at the locker room, the uniform is forced, duty ends at disconnect.
- On duty: may punch without stars, may not pickpocket.
- Handcuffs: any player who stood still for 3 s, E held 2 s within 2 m. The cuffed player follows the officer.
- Cell: the officer releases the prisoner when they choose; after 15 minutes the prisoner walks out. Never a fine.
- Bounty: 15 coins per star of a wanted player put in a cell, 150 coins a day at most. Nothing for a player with no star.
- Anti-collusion: no bounty when the officer and the suspect are friends or traded or transferred in the last 7 days;
  one bounty per suspect per officer per 24 h; accounts younger than 72 h excluded.

## NPC police (no officer on duty)

A wanted player who dies respawns in a cell instead of the hospital: 2 minutes per star, or a fine of 100 coins per star
(500 at most) to walk out at once. The fine is taken from the bank then cash in one go and is destroyed. A player who
cannot pay serves the time.

The prisoner pays for the jail (decided 2026-11-13): the death costs the usual hospital bill plus a jail tax of 50 coins
per star at death (250 at most), taken from the bank then cash down to 0, never as a debt, and destroyed. Once per
sentence. An officer hold pays neither.

## Pickpocket

- From behind, within 1.5 m. A 4 s mini-game: stay behind the moving victim and stop a gauge three times in a shrinking
  window, judged by the socket clock. Any player within 8 m looking at the scene is a witness.
- Loot: one whole stack of one item, no value cap. Never furniture, cash, worn clothes, gem items or keys.
- No safe zone. Accounts younger than 72 h neither steal nor get robbed. 10 minutes between attempts, the same victim
  once per 24 h.

## Steps

1. Station: building, zone, first dressing, uniform (wear pieces), front desk NPC.
2. Stars: socket, icon over the name, decay, persisted record, `reportCrime` entry.
3. NPC jail at death: time or fine.
4. Cell tap and meal tray.
5. Licence and duty at the locker room.
6. Handcuffs, escort, cell by an officer, capped bounty, anti-collusion.
7. Pickpocket.
8. Later: cosmetic ranks (1, 5, 20, 50 arrests) and a wanted board.
