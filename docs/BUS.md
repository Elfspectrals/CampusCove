# Town bus

Decision (2026-11-14): two buses drive one loop over the whole map, in opposite directions, on the drawn roads. They stop at the town, the orchard, the farm, the pub, the police station, the mall, Cove Heights and the sports complex. Players wait at a stop, get on and ride. The ride is free and needs no ticket. The socket owns where the buses are, so every player sees the same bus.

## 1. Route

The source of the route is `map-src/CampusCove/bus_route.json`. It holds both polylines, the 8 stops and the new road links. `front/scripts/apply-bus.mjs` copies it into `world.manifest.json` under `bus`. The socket and the front both read it from there.

The roads that are actually drawn are:
- the town ring;
- the mall avenue;
- Cove Road, its north leg and its west leg;
- the sports spur.

Orchard, farm, pub and police have no road. They are reached on foot through the pond park, or through the town hedge gates. The loop is therefore a figure 8 that goes through the town twice. Coordinates are in metres, with -Z pointing north.

**West lobe**
1. Leave the town ring through the west hedge gate (-44.6, -12).
2. Drive the avenue west.
3. Take a new 6 m link north along x -143, between the mall forecourt and its car park, up to Cove Road.
4. Drive Cove Road and the spur west, out to the turning bulb at (-474, -156), R 13.
5. Come back east, then drive the north leg of Cove Road south (this is where the orchard and farm stops are).
6. Return along the avenue to the ring.

**East lobe**
1. Leave the ring through the market hedge opening (42.6, -17.6).
2. Follow a new 6 m road loop laid on open lawn:
   - x 51 north;
   - z -50 east;
   - x 87.4 north, past the pub;
   - z -102.5 east, south of the beer garden;
   - x 118 south, outside the pub zone;
   - z 6.3 west, between the market and the police path.
3. Come back in through the same opening.

**Directions and lanes**
- Bus A drives the ring counter-clockwise on the map, in the outer lane.
- Bus B drives the same loop reversed, in the other lane.
- Both buses keep to the right of the road centreline:
  - 1.05 m on the ring;
  - 1.75 m on the avenue;
  - 1.5 m on Cove Road and on the new roads.
- Both buses drive the bulb the same way: in on the north lane (z -147.5), clockwise around R 8.5, out on the south lane (z -144.5).

| | Bus A | Bus B |
|---|---|---|
| Length | 1,703.7 m | 1,721.5 m |
| Points | 171 | 170 |

### Stops

The bus stands with its centre on its own polyline. The boarding point is on the kerb side, next to the front door. One full loop takes 380 s, and the times in the table are within that loop.

| Id | Name | A arrives | B arrives | Side and notes |
|---|---|---|---|---|
| `pub` | The Salty Shamrock | 0 s | 337 s | A: x 87.4 road, east kerb. B: z -102.5 road, south kerb. |
| `police` | Cove Police | 54 s | 295 s | z 6.3 road. A on the south kerb, B on the north kerb. |
| `mall` | Cove Parkview Mall | 102 s | 244 s | A: avenue, south kerb. The old mall shelter is replaced by a new one at (-127.5, -16.9). B: mall link, west kerb. |
| `cove_heights` | Cove Heights | 151 s | 119 s | Westbound only, the same stand for both buses at x -240 → -228, z -147.5, on the estate side. |
| `sports_complex` | Cove Sports Park | 198 s | 166 s | Westbound only. This is the existing stop: the pole at (-457, -149.65), the boarding point at (-452, -150.6), the stand x -457 → -445. |
| `farm` | Cove Farm | 274 s | 76 s | North leg, about 24 m from the orchard stop. A on the west kerb, B on the east kerb. |
| `orchard` | Cove Orchard | 298 s | 52 s | North leg. |
| `town` | Town Hall | 338 s | 0 s | Town ring. A in the outer lane by the north sidewalk, B in the inner lane. |

Each bus stays at every stop for the dwell time of 15 s. The first stop of each list also holds the layover, which equalises the two periods: 12 s for A at the pub and 10 s for B at the town.

Cove Heights and the sports complex sit on the out-and-back spur. Both buses pass them twice per loop and stop only on the way west, on the stand by the kerb. On the way back east, a rider stays on.

### Speed, timetable, spacing

All of these numbers live in `socket/src/busConstants.ts`.

- **Speed.** The bus cruises at 9 m/s and accelerates and brakes at 1.2 m/s². A short leg that never reaches cruise speed gets a triangular speed profile instead.
- **Timetable.** The clock is the server time in ms since the epoch. Both buses share one period: the longer loop, rounded up to 10 s, which gives 380 s. The bus whose loop is shorter waits the difference at its first stop.
- **Spacing.** Bus B is offset so that it reaches `sports_complex` half a period (190 s) after bus A. The two buses share the spur lane and the westbound stands, and they never meet there.

## 2. Boarding and riding

1. **Board.** Someone waiting within 3.5 m of a stop's boarding point (the server allows 4 m) sees a "Board the bus" prompt on the bus door. It only appears while the bus is docked. The prompt says where the bus goes next and how many seconds are left before it leaves. The interact key sends `bus_board`.
2. **Ride.** The server gives the rider one of 20 standing spots in the aisle. It then moves the rider with the bus every 200 ms. The front places the rider's camera at that spot on the interpolated bus, so the view moves smoothly. The rider can still look around, but cannot walk.
3. **Get off.**
   - At a docked stop, the interact key gets the rider off at once.
   - While the bus is driving, the same key books the next stop.
   - The HUD also lists every stop, so the rider can click the one to get off at (the mouse has to be free).
   - When getting off, the server places the rider on the stop's boarding point.
4. **Feedback.** The door sound plays on the bus when a rider gets on and off. The HUD at the top centre shows the next stop, or the stop the bus is at with its countdown, and the stop the rider is getting off at.

## 3. Messages (contract)

**Client to server**

| Message | Fields | Checks |
|---|---|---|
| `bus_board` | `bus: 'A' \| 'B'` | 500 ms cooldown per player. The player must not already be riding, knocked out, cuffed, jailed or seated. The bus must be docked, with at least 1 s left. The player must be within 4 m of that stop's boarding point for this bus. There must be a free spot (20). |
| `bus_alight` | `stop?: string` (a stop id on the line) | 500 ms cooldown. The player must be riding. If the bus is docked and `stop` is missing or names the stop the bus is at, the rider gets off now. Otherwise the stop is booked (`stop`, or the next stop). |

**Server to client**

| Message | To | Fields |
|---|---|---|
| `bus_sync` | everyone, every 200 ms | `buses: [{ id, x, z, yaw, stop: string \| null, departsInMs: int ≥ 0, next: string, riders: int }]`. `yaw` turns the model's front (-Z) along the direction of travel. |
| `bus_boarded` | the rider | `{ bus, slot: [lx, lz], floorY }`: the standing spot in the bus frame. |
| `bus_alight_planned` | the rider | `{ stop }` |
| `bus_alighted` | the rider | `{ x, y, z, stop }`: the boarding point, at eye height. |
| `bus_left` | the rider | `{ reason: 'unavailable' }`: knocked out, cuffed or jailed while riding. |
| `bus_error` | the player | `{ reason: 'unknown_bus' \| 'riding' \| 'not_riding' \| 'unavailable' \| 'not_docked' \| 'too_far' \| 'full' \| 'unknown_stop' }` |

Riders also reach other players through the usual `user_moved` broadcasts.

## 4. Anti-cheat and edge cases

- **The socket moves riders.** `onMove` ignores every `move` from a rider, and `moveRejection` never sees a bus move. Each ride tick sets `lastMoveAt`, so the first step after getting off starts with a fresh speed budget, from the boarding point.
- **Pass areas.** No point of either route, and no boarding point, lies inside a sports pass area. The sports stop is outside the fence, and `bus.test.ts` checks this against the real manifest every metre. No route point is inside a house either, so the locked-house check is not bypassed.
- **Knocked out, cuffed or jailed.** A rider in any of these states leaves the bus (`bus_left`) where the bus is. The clinic, jail or cuff code then moves them as usual.
- **Disconnect.** A rider who disconnects (or a stale tab) is taken off the bus at once and their spot is freed. Positions are not saved across sessions, so the next join spawns in town as usual. There is no rider left on board to drop at the next stop.
- **Admin teleport.** An admin teleport or summon of a rider is overwritten by the next ride tick. The admin has to get the rider off first.

## 5. Zone visibility while riding

- **Front.** The rider's `myPosition` follows the bus every frame. Interiors, zone decor, music, the minimap and the GPS therefore switch the same way as when walking.
- **Socket.** The rider's `x` and `z` are updated every 200 ms, so voice range, house checks and zone queries follow the bus. Explorer zone counting needs a `move`, so a ride does not count as visiting a zone.

## 6. Assets

`map-src/CampusCove/build_bus_line.py` builds every piece. It writes `park/bus_line/` (`city_bus.glb`, `bus_line.glb`, `bus_line.layout.json`). Run it, then `npm run assets:optimize -- park bus_line`, then `node scripts/apply-bus.mjs`.

| Piece | Source | Reason |
|---|---|---|
| City bus (12 × 2.55 × 3 m, 1,404 triangles, front at -Z) | builder (boxes, glass panes, wheels) | Riders stand inside it, so it needs a hollow shell with real glass. A `make model` mesh is a closed shell with painted windows. |
| Road links (6 m asphalt, a disc at each corner) | builder (`lib_site.strip` / `disc`) | Flat slabs. |
| Pole and shelter at each new stop (12 sides; the Cove Heights stand is shared) | `lib_site.bus_shelter` plus the pole from the sports site, on a paved pad | Shared builders. |

Shelter and pole colliders (`COL_BusLine_*`) are merged into `town.collision.json`. `apply-bus.mjs` is idempotent and also makes the cuts the route needs:
- **Town:** removes the gate-mouth trees `Tree_6_0`, `Tree_2_0` and `Tree_2_1`, and the ring lamps `Lamp_Out_08` and `Lamp_Out_01`.
- **Mall:** removes the old shelter at (-142, -19.1) and the avenue bin `Avenue_Bin1_0`.
- **Pub:** removes the pub tree `Tree28`.

In each case it drops the triangles in the cut area and removes the colliders.

## 7. Known limits

- The bus is a rigid body that follows the polyline, with no axles.
- Under 0.15 m of clearance:
  - Market_Tree0, Market_Sign, Market_Tree3, Police_Lamp1;
  - Hedge_00, where B's rear swings at the south-west corner of the lobe;
  - Mailbox_house_07;
  - the house_04 and house_07 corners at the ring mouths;
  - LampSpur09 at the bulb exit.
- The town ring carriageway is 4.7 m wide, so two buses that meet there overlap by about 0.3 m.
- B turns at the market stem on a radius of about 4 m.
- The ground is not flat on the pond heightmap rim:
  - 0.2-0.6 m at the west gate (x -45.5 to -47);
  - 0.2-1.3 m along B's lane at the market gate (x 46 to 48).
- The bus model sits on `terrainHeightAt`. The new road slabs are flat at 0.035 m and may sink into that rim.
- The new road slabs, shelters and bus have no lightmap.
