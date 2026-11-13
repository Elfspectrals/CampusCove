<?php

namespace App\Services;

use App\Exceptions\PickpocketRejectedException;
use App\Models\Account;
use App\Models\ItemDef;
use App\Support\AssetUrl;
use Illuminate\Support\Facades\DB;

final class PickpocketService
{
    public const COOLDOWN_MINUTES = 10;

    public const SAME_VICTIM_HOURS = 24;

    public const OUTCOMES = ['failed', 'succeeded'];

    public const NEVER_STOLEN_KINDS = ['furniture', 'apartment_asset', 'tool'];

    public function __construct(
        private readonly AccountInventoryService $inventory,
        private readonly TradeService $trades,
    ) {}

    public static function isStealable(object $def): bool
    {
        return TradeService::isTradable($def) && ! in_array($def->kind, self::NEVER_STOLEN_KINDS, true);
    }

    public function open(int $thiefId, int $victimId): int
    {
        if ($thiefId === $victimId) {
            throw new PickpocketRejectedException('pickpocket_self', 'You cannot rob yourself.');
        }

        return DB::transaction(function () use ($thiefId, $victimId): int {
            Account::query()->whereKey($thiefId)->lockForUpdate()->first();
            if ($this->isTooNew($thiefId)) {
                throw new PickpocketRejectedException('pickpocket_account_too_new', 'Accounts can pick pockets '.TradeService::MIN_GIVER_AGE_HOURS.' hours after sign-up.');
            }
            if ($this->isTooNew($victimId)) {
                throw new PickpocketRejectedException('pickpocket_victim_too_new', 'This player is too new to be robbed.');
            }
            $attempts = DB::table('pickpocket_attempts')->where('thief_account_id', $thiefId);
            if ((clone $attempts)->where('created_at', '>', now()->subMinutes(self::COOLDOWN_MINUTES))->exists()) {
                throw new PickpocketRejectedException('pickpocket_cooldown', 'Lie low for a while before trying again.', 409);
            }
            $robbedRecently = (clone $attempts)
                ->where('victim_account_id', $victimId)
                ->whereIn('outcome', ['pending', 'succeeded'])
                ->where('created_at', '>', now()->subHours(self::SAME_VICTIM_HOURS))
                ->exists();
            if ($robbedRecently) {
                throw new PickpocketRejectedException('pickpocket_victim_recent', 'You already robbed this player today.', 409);
            }

            return (int) DB::table('pickpocket_attempts')->insertGetId([
                'thief_account_id' => $thiefId,
                'victim_account_id' => $victimId,
            ], 'id');
        });
    }

    /** @return list<array{code: string, name: string, kind: string, quantity: int, preview_image: string|null}> */
    public function settle(int $thiefId, int $attemptId, string $outcome): array
    {
        return DB::transaction(function () use ($thiefId, $attemptId, $outcome): array {
            $attempt = $this->lockAttempt($thiefId, $attemptId);
            if ($attempt->outcome === 'pending') {
                DB::table('pickpocket_attempts')->where('id', $attemptId)->update(['outcome' => $outcome]);
            } elseif ($attempt->outcome !== $outcome) {
                throw new PickpocketRejectedException('pickpocket_settled', 'This attempt is already over.', 409);
            }

            return $outcome === 'succeeded' ? $this->loot((int) $attempt->victim_account_id) : [];
        });
    }

    /** @return list<array{code: string, name: string, kind: string, quantity: int, preview_image: string|null}> */
    public function loot(int $victimId): array
    {
        $worn = $this->trades->wornItemDefIds($victimId);

        return $this->inventory->aggregatedItemsForAccount($victimId, null, null)
            ->filter(fn (object $row): bool => $row->quantity > 0 && self::isStealable($row) && ! in_array($row->item_def_id, $worn, true))
            ->map(fn (object $row): array => [
                'code' => $row->code,
                'name' => $row->name,
                'kind' => $row->kind,
                'quantity' => $row->quantity,
                'preview_image' => AssetUrl::normalize($row->preview_image),
            ])
            ->values()
            ->all();
    }

    /** @return array{code: string, name: string, quantity: int} */
    public function take(int $thiefId, int $attemptId, string $code): array
    {
        return DB::transaction(function () use ($thiefId, $attemptId, $code): array {
            $attempt = $this->lockAttempt($thiefId, $attemptId);
            if ($attempt->taken_at !== null) {
                $def = ItemDef::query()->findOrFail($attempt->item_def_id);

                return ['code' => $def->code, 'name' => $def->name, 'quantity' => (int) $attempt->quantity];
            }
            if ($attempt->outcome !== 'succeeded') {
                throw new PickpocketRejectedException('pickpocket_not_succeeded', 'Nothing to take from this attempt.', 409);
            }
            $victimId = (int) $attempt->victim_account_id;
            $def = ItemDef::query()->where('code', $code)->first();
            if ($def === null || ! self::isStealable($def) || in_array((int) $def->item_def_id, $this->trades->wornItemDefIds($victimId), true)) {
                throw new PickpocketRejectedException('pickpocket_not_stealable', 'That cannot be stolen.');
            }
            $ids = [$thiefId, $victimId];
            sort($ids);
            foreach ($ids as $id) {
                $this->inventory->getOrCreateGiftInboxContainerId($id);
            }
            $quantity = $this->trades->ownedQuantity($victimId, $def);
            if ($quantity < 1) {
                throw new PickpocketRejectedException('pickpocket_item_gone', "{$def->name} is no longer there.", 409);
            }
            if ($this->trades->ownedQuantity($thiefId, $def) + $quantity > $def->max_stack) {
                throw new PickpocketRejectedException('pickpocket_inventory_full', "You cannot carry that many {$def->name}.");
            }
            $this->inventory->revokeItem($victimId, $def, $quantity);
            $this->inventory->grantItem($thiefId, $def, $quantity);
            DB::table('pickpocket_attempts')->where('id', $attemptId)->update([
                'item_def_id' => $def->item_def_id,
                'quantity' => $quantity,
                'taken_at' => now(),
            ]);

            return ['code' => $def->code, 'name' => $def->name, 'quantity' => $quantity];
        });
    }

    private function isTooNew(int $accountId): bool
    {
        return Account::query()->whereKey($accountId)
            ->where('created_at', '>', now()->subHours(TradeService::MIN_GIVER_AGE_HOURS))
            ->exists();
    }

    private function lockAttempt(int $thiefId, int $attemptId): object
    {
        $attempt = DB::table('pickpocket_attempts')->where('id', $attemptId)->where('thief_account_id', $thiefId)->lockForUpdate()->first();
        if ($attempt === null) {
            throw new PickpocketRejectedException('pickpocket_unknown', 'Unknown pickpocket attempt.', 404);
        }

        return $attempt;
    }
}
