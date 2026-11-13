# Storage in placed furniture

Some furniture placed in a house holds items. Laravel owns what is stored (`FurnitureStorageService`); the socket checks that the player stands next to the piece inside the house.

| Furniture code | Slots | Accepts |
|---|---|---|
| `decor_dresser` | 8 | any storable item |
| `decor_toy_chest` | 6 | any storable item |
| `decor_fridge_retro` | 10 | consumables only (food, drinks, crops, sweets, medicine) |

A slot is one stack of one item, up to the item's `max_stack`. A storable item is one a trade accepts (`TradeService::isTradable`: tradable, not premium-only, not bound), not furniture, and not worn. A started meal stays in the bag: only whole items are put away.

- Anyone standing next to the piece can take; only the owner and key holders put away.
- Taking is limited by the bag: the taker cannot hold more than `max_stack` of an item.
- A piece that holds something cannot be picked up (`storage_not_empty`).
- When a house is lost, what its furniture held is destroyed with it.

Storage rows: `furniture_storages` (`room_furniture_id` PK, `container_id` of type `room_furniture`); the items are `inventory_stacks` of that container. The foreign key to `room_furnitures` is `RESTRICT`, so a piece cannot be deleted before its storage is handled (`FurnitureStorageService::destroy`).

## Realtime routes (socket → Laravel)

Under the `realtime` middleware, with the player's bearer token.

| Route | Body | Answer |
|---|---|---|
| `POST /api/furniture-storage/open` | `owner_account_id` (house owner), `object_id` (64 max) | the screen |
| `POST /api/furniture-storage/deposit` | same + `code` (64 max), `quantity` (1 to 999) | the screen |
| `POST /api/furniture-storage/take` | same + `code`, `quantity` | the screen |

The screen: `{ object_id, code, slots, food_only, can_deposit, items: [{ code, name, kind, quantity, preview_image }] }`.

Refusals: `storage_not_found` (404), `storage_not_yours` (403), `storage_item_refused`, `storage_food_only`, `storage_item_worn`, `storage_item_missing`, `storage_full`, `storage_stack_full`, `storage_bag_full` (422), `storage_item_gone` (409).

## Socket messages (`socket/src/storage.ts`)

The socket finds the house the player stands in (inside its interior bounds), the placed object `objectId` of that house within 2.5 m and 1.5 m in height, and calls Laravel with that house's owner, never one sent by the client. One action every 300 ms per player.

| Message | Direction | Fields |
|---|---|---|
| `storage_open` | client → socket | `objectId` |
| `storage_deposit` | client → socket | `objectId`, `code` (`A-Z a-z 0-9 _`, 64 max), `quantity` (1 to 999) |
| `storage_take` | client → socket | same |
| `storage_screen` | socket → client | the screen above |
| `storage_error` | socket → client | `message`, `code`: `storage_busy`, `storage_bad_request`, `storage_too_far`, or a Laravel code |
