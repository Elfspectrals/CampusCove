# Waking up in your own bed

A player chooses the bed they wake up in by using it (interact on a placed bed): a single bed, a double bed or a bunk bed, in a house they own or hold the keys to. After any knockout (blows, fall, hunger, thirst, alcohol) they wake up beside that bed instead of the clinic, with the same 5 s recovery looking at it. The hospital bill does not change. If the bed was picked up, the house was lost or the keys were taken back, they wake up at the clinic.

Laravel owns the choice (`RespawnBedService`, table `account_respawn_beds`: `account_id` PK, `room_furniture_id` FK ON DELETE CASCADE). The socket owns where the player stands: 1 m beside the bed, on the first side (bed's local +x, -x, +z, -z) that stays 0.4 m inside the house (`houseObjects.ts`).

## Realtime routes (socket → Laravel)

| Route | Body | Answer |
|---|---|---|
| `POST /api/respawn-bed` | `owner_account_id`, `object_id` (64 max) | `{ bed: { owner_account_id, object_id } }`; `bed_not_found` (404), `bed_not_yours` (403) |
| `GET /api/respawn-bed` | none | `{ bed: { owner_account_id, object_id } \| null }`, null when the keys or the house are gone |

## Socket messages

| Message | Direction | Fields |
|---|---|---|
| `bed_set` | client → socket | `objectId`; the player must stand inside the house within 2.5 m of it |
| `bed_set_done` | socket → client | `objectId` |
| `bed_error` | socket → client | `message`, `code` (`bed_too_far` or a Laravel code) |

The socket asks Laravel for the chosen bed when the player is knocked out; if the answer has not come back when they wake up (6 s), they wake up at the clinic.
