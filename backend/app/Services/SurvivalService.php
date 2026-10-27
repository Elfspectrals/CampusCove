<?php

namespace App\Services;

use App\Exceptions\SurvivalRejectedException;
use App\Models\EconomyTransaction;
use App\Models\InventoryStack;
use App\Models\ItemDef;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use App\Support\FoodCatalog;
use Illuminate\Support\Facades\DB;

/**
 * Hunger, thirst and health. The realtime server owns the live values (decay, damage, regeneration) and saves
 * them here; this service only stores them, eats one portion of a food item and bills the hospital.
 */
final class SurvivalService
{
    public const MAX = 100;

    /** Coins charged when a player passes out (capped at their balance, so it never fails). */
    public const HOSPITAL_FEE = 40;

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
     * @return array{code: string, hunger: int, thirst: int, health: int, effect: string|null, quantity: int, portions: int, portions_left: int}
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

    /** Charges the hospital fee, or whatever the player has left. Returns the amount billed. */
    public function billHospital(int $accountId): int
    {
        return DB::transaction(function () use ($accountId): int {
            $wallet = Wallet::lockForAccount($accountId, 'coins');
            $amount = min(self::HOSPITAL_FEE, max(0, $wallet->balance()));
            if ($amount === 0) {
                return 0;
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

            return $amount;
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
