<?php

namespace App\Services;

use App\Exceptions\SurvivalRejectedException;
use App\Models\EconomyTransaction;
use App\Models\GiftInbox;
use App\Models\InventoryStack;
use App\Models\ItemDef;
use App\Models\ItemInstance;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use App\Support\FoodCatalog;
use Illuminate\Support\Facades\DB;

/**
 * Hunger, thirst and health. The realtime server owns the live values (decay, damage, regeneration) and saves
 * them here; this service only stores them, eats one portion of a food item, bills the hospital and takes away what
 * a player loses when they pass out.
 */
final class SurvivalService
{
    public const MAX = 100;

    /** Coins charged when a player passes out (capped at their balance, so it never fails). */
    public const HOSPITAL_FEE = 40;

    public const CLINIC_HEAL_FEE = 30;

    public const HANGOVER_FEE = 40;

    /** Inventory kinds dropped when a player passes out (keys, titles and apartments stay). */
    private const LOST_KINDS = ['consumable', 'furniture'];

    public function __construct(private readonly AccountInventoryService $inventory)
    {
    }

    /** @return array{health: float, hunger: float, thirst: float} */
    public function stats(int $accountId): array
    {
        $row = DB::table('account_survival_stats')->where('account_id', $accountId)->first();

        return [
            'health' => $row !== null ? (float) $row->health : self::MAX,
            'hunger' => $row !== null ? (float) $row->hunger : self::MAX,
            'thirst' => $row !== null ? (float) $row->thirst : self::MAX,
        ];
    }

    /** @return array{health: float, hunger: float, thirst: float} */
    public function save(int $accountId, float $health, float $hunger, float $thirst): array
    {
        $stats = [
            'health' => self::clamp($health),
            'hunger' => self::clamp($hunger),
            'thirst' => self::clamp($thirst),
        ];
        DB::table('account_survival_stats')->updateOrInsert(
            ['account_id' => $accountId],
            [...$stats, 'updated_at' => now()]
        );

        return $stats;
    }

    /**
     * Eats one portion of the top item of the player's stack: the stack loses one item once every portion is gone.
     *
     * @return array{code: string, hunger: int, thirst: int, health: int, alcohol: int, effect: string|null, quantity: int, portions: int, portions_left: int}
     */
    public function consume(int $accountId, string $code): array
    {
        $def = ItemDef::query()->where('code', $code)->where('kind', 'consumable')->whereNotNull('portions')->first();
        if ($def === null) {
            throw new SurvivalRejectedException('not_consumable', 'You cannot eat or drink this.');
        }

        return DB::transaction(function () use ($accountId, $def): array {
            $stack = $this->lockStack($accountId, $def);
            $quantity = $stack !== null ? (int) $stack->quantity : 0;
            if ($quantity <= 0) {
                throw new SurvivalRejectedException('no_item', 'You do not have this item anymore.');
            }

            $portions = max(1, (int) $def->portions);
            $used = (int) $stack->portions_used + 1;
            if ($used >= $portions) {
                $quantity--;
                $used = 0;
            }
            if ($quantity > 0) {
                $stack->update(['quantity' => $quantity, 'portions_used' => $used]);
            } else {
                $stack->delete();
            }

            return [
                'code' => (string) $def->code,
                'hunger' => (int) $def->hunger_per_portion,
                'thirst' => (int) $def->thirst_per_portion,
                'health' => (int) $def->health_per_portion,
                'alcohol' => (int) $def->alcohol_per_portion,
                'effect' => $def->consume_effect,
                'quantity' => $quantity,
                'portions' => $portions,
                'portions_left' => $quantity > 0 ? $portions - $used : 0,
            ];
        });
    }

    /**
     * Turns one raw item into its cooked version (stove / barbecue); a half-eaten raw item cannot be cooked.
     *
     * @return array{code: string}
     */
    public function cook(int $accountId, string $code): array
    {
        $cookedCode = FoodCatalog::COOKING[$code] ?? null;
        if ($cookedCode === null) {
            throw new SurvivalRejectedException('not_cookable', 'This cannot be cooked.');
        }
        $raw = ItemDef::query()->where('code', $code)->firstOrFail();
        $cooked = ItemDef::query()->where('code', $cookedCode)->firstOrFail();

        DB::transaction(function () use ($accountId, $raw, $cooked): void {
            $stack = $this->lockStack($accountId, $raw);
            $whole = $stack !== null ? (int) $stack->quantity - ((int) $stack->portions_used > 0 ? 1 : 0) : 0;
            if ($whole <= 0) {
                throw new SurvivalRejectedException('no_item', 'You have nothing to cook.');
            }
            $this->inventory->revokeItem($accountId, $raw, 1);
            $this->inventory->grantItem($accountId, $cooked, 1);
        });

        return ['code' => $cookedCode];
    }

    /**
     * Charges the hospital fee, or whatever the player has left.
     *
     * @return array{billed: int, balance_after: int}
     */
    public function billHospital(int $accountId): array
    {
        return DB::transaction(function () use ($accountId): array {
            $wallet = Wallet::lockForAccount($accountId, 'coins');
            $balance = $wallet->balance();
            $amount = min(self::HOSPITAL_FEE, max(0, $balance));
            if ($amount === 0) {
                return ['billed' => 0, 'balance_after' => $balance];
            }
            $tx = EconomyTransaction::query()->create([
                'server_id' => null,
                'type' => 'hospital_bill',
                'status' => 'committed',
                'created_by_account_id' => $accountId,
                'committed_at' => now(),
                'meta_json' => ['amount' => $amount],
            ]);
            WalletLedgerEntry::query()->create([
                'wallet_id' => $wallet->wallet_id,
                'tx_id' => $tx->tx_id,
                'delta' => -$amount,
                'reason' => 'hospital_bill',
            ]);

            return ['billed' => $amount, 'balance_after' => $balance - $amount];
        });
    }

    /**
     * Passing out costs the player their inventory: food, unplaced furniture and every Cove Threads piece of clothing,
     * worn or not. Placed furniture, house keys, coins and skins stay.
     *
     * @return array{items: int, clothes: int}
     */
    public function loseBelongings(int $accountId): array
    {
        return DB::transaction(function () use ($accountId): array {
            $items = 0;
            $gift = GiftInbox::query()->where('account_id', $accountId)->first();
            if ($gift !== null) {
                $lostDefs = ItemDef::query()->whereIn('kind', self::LOST_KINDS)->pluck('item_def_id');
                $items += InventoryStack::query()
                    ->where('container_id', $gift->container_id)
                    ->whereIn('item_def_id', $lostDefs)
                    ->delete();
                $items += ItemInstance::query()
                    ->where('container_id', $gift->container_id)
                    ->whereIn('item_def_id', $lostDefs)
                    ->delete();
            }

            // Cove Threads clothes are lost too; body skins (incl. premium ones) and the free defaults are not
            $clothes = ItemDef::query()
                ->where('kind', 'cosmetic')
                ->whereIn('cosmetic_slot', AccountCosmeticService::CLOTHING_SLOTS)
                ->whereNotIn('code', StarterCosmeticGrantService::STARTER_CODES)
                ->pluck('item_def_id');
            DB::table('account_cosmetic_equipment')
                ->where('account_id', $accountId)
                ->whereIn('item_def_id', $clothes)
                ->delete();
            $lostClothes = DB::table('account_locker_cosmetics')
                ->where('account_id', $accountId)
                ->whereIn('item_def_id', $clothes)
                ->delete();

            return ['items' => $items, 'clothes' => $lostClothes];
        });
    }

    /** @return array{billed: int, balance_after: int} */
    public function billHangover(int $accountId): array
    {
        return DB::transaction(function () use ($accountId): array {
            $wallet = Wallet::lockForAccount($accountId, 'coins');
            $balance = $wallet->balance();
            $amount = min(self::HANGOVER_FEE, max(0, $balance));
            if ($amount === 0) {
                return ['billed' => 0, 'balance_after' => $balance];
            }
            $tx = EconomyTransaction::query()->create([
                'server_id' => null,
                'type' => 'hangover',
                'status' => 'committed',
                'created_by_account_id' => $accountId,
                'committed_at' => now(),
                'meta_json' => ['amount' => $amount],
            ]);
            WalletLedgerEntry::query()->create([
                'wallet_id' => $wallet->wallet_id,
                'tx_id' => $tx->tx_id,
                'delta' => -$amount,
                'reason' => 'hangover',
            ]);

            return ['billed' => $amount, 'balance_after' => $balance - $amount];
        });
    }

    /** @return array{billed: int, balance_after: int} */
    public function payClinicHeal(int $accountId): array
    {
        return DB::transaction(function () use ($accountId): array {
            $wallet = Wallet::lockForAccount($accountId, 'coins');
            $balance = $wallet->balance();
            if ($balance < self::CLINIC_HEAL_FEE) {
                throw new SurvivalRejectedException('insufficient_funds', 'Insufficient wallet balance.');
            }
            $tx = EconomyTransaction::query()->create([
                'server_id' => null,
                'type' => 'clinic_heal',
                'status' => 'committed',
                'created_by_account_id' => $accountId,
                'committed_at' => now(),
                'meta_json' => ['amount' => self::CLINIC_HEAL_FEE],
            ]);
            WalletLedgerEntry::query()->create([
                'wallet_id' => $wallet->wallet_id,
                'tx_id' => $tx->tx_id,
                'delta' => -self::CLINIC_HEAL_FEE,
                'reason' => 'clinic_heal',
            ]);

            return ['billed' => self::CLINIC_HEAL_FEE, 'balance_after' => $balance - self::CLINIC_HEAL_FEE];
        });
    }

    private function lockStack(int $accountId, ItemDef $def): ?InventoryStack
    {
        $containerId = $this->inventory->getOrCreateGiftInboxContainerId($accountId);

        return InventoryStack::query()
            ->where('container_id', $containerId)
            ->where('item_def_id', $def->item_def_id)
            ->lockForUpdate()
            ->first();
    }

    private static function clamp(float $value): float
    {
        return round(max(0.0, min((float) self::MAX, $value)), 2);
    }
}
