<?php

namespace App\Services;

use App\Exceptions\LockpickRejectedException;
use App\Models\Account;
use App\Models\HousingUnit;
use App\Models\ItemDef;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Lottery;

final class LockpickService
{
    public const ITEM_CODE = 'tool_lockpick';

    public const USES_PER_PICK = 5;

    public const BREAK_PERCENT_PER_MISS = 40;

    public const HOUSE_PROTECTION_HOURS = 24;

    public const BURGLAR_COOLDOWN_MINUTES = 30;

    public function __construct(
        private readonly AccountInventoryService $inventory,
        private readonly HousingService $housing,
    ) {}

    /** @return array{attempt_id: int} */
    public function start(int $burglarId, string $unitPublicId): array
    {
        return DB::transaction(function () use ($burglarId, $unitPublicId): array {
            $unit = HousingUnit::query()->where('public_id', $unitPublicId)->lockForUpdate()->first();
            if ($unit === null || $unit->status !== 'occupied' || $unit->occupant_account_id === null) {
                throw new LockpickRejectedException('unit_not_found', 'Nobody lives here.', 404);
            }
            if (! $unit->door_locked) {
                throw new LockpickRejectedException('door_not_locked', 'This door is not locked.', 409);
            }
            $ownerId = (int) $unit->occupant_account_id;
            if ($ownerId === $burglarId || in_array($burglarId, $this->housing->keyHolderIds($unit), true)) {
                throw new LockpickRejectedException('has_house_key', 'You have the keys to this house.', 403);
            }
            if ($this->isTooYoung($burglarId)) {
                throw new LockpickRejectedException('burglar_too_new', 'You can pick locks '.TradeService::MIN_GIVER_AGE_HOURS.' hours after sign-up.', 403);
            }
            if ($this->isTooYoung($ownerId)) {
                throw new LockpickRejectedException('owner_too_new', 'This house belongs to a newcomer.', 403);
            }
            if ($this->successes()->where('unit_id', $unit->unit_id)->where('ended_at', '>', now()->subHours(self::HOUSE_PROTECTION_HOURS))->exists()) {
                throw new LockpickRejectedException('house_recently_burgled', 'This house was broken into recently.', 409);
            }
            if ($this->successes()->where('burglar_account_id', $burglarId)->where('ended_at', '>', now()->subMinutes(self::BURGLAR_COOLDOWN_MINUTES))->exists()) {
                throw new LockpickRejectedException('burglar_cooldown', 'Lie low for a while before the next job.', 429);
            }
            if (! $this->inventory->accountHasPositiveQuantity($burglarId, (int) $this->lockpick()->item_def_id)) {
                throw new LockpickRejectedException('no_lockpick', 'You need a lockpick.', 422);
            }

            $open = DB::table('lockpick_attempts')->where('burglar_account_id', $burglarId)->whereNull('outcome')->lockForUpdate()->value('id');
            if ($open !== null) {
                $this->close((int) $open, $burglarId, 'abandoned');
            }
            $this->spendUse($burglarId);
            $attemptId = DB::table('lockpick_attempts')->insertGetId([
                'burglar_account_id' => $burglarId,
                'unit_id' => $unit->unit_id,
            ]);

            return ['attempt_id' => (int) $attemptId];
        });
    }

    /** @return array{broke: bool} */
    public function miss(int $burglarId, int $attemptId, int $missNumber): array
    {
        return DB::transaction(function () use ($burglarId, $attemptId, $missNumber): array {
            $attempt = $this->lockAttempt($burglarId, $attemptId);
            if ($attempt->outcome === 'broke') {
                return ['broke' => true];
            }
            if ($attempt->outcome !== null || $missNumber !== $attempt->misses + 1) {
                return ['broke' => false];
            }
            DB::table('lockpick_attempts')->where('id', $attemptId)->update(['misses' => $missNumber]);
            $broke = Lottery::odds(self::BREAK_PERCENT_PER_MISS, 100)->choose();
            if ($broke) {
                $this->inventory->revokeItem($burglarId, $this->lockpick(), 1);
                DB::table('lockpick_wear')->where('account_id', $burglarId)->delete();
                $this->end($attemptId, 'broke');
            }

            return ['broke' => $broke];
        });
    }

    public function succeed(int $burglarId, int $attemptId): void
    {
        DB::transaction(function () use ($burglarId, $attemptId): void {
            $attempt = $this->lockAttempt($burglarId, $attemptId);
            if ($attempt->outcome === 'success') {
                return;
            }
            if ($attempt->outcome !== null) {
                throw new LockpickRejectedException('attempt_over', 'This attempt is over.', 409);
            }
            HousingUnit::query()->whereKey($attempt->unit_id)->update(['door_locked' => false, 'updated_at' => now()]);
            $this->close($attemptId, $burglarId, 'success');
        });
    }

    public function abandon(int $burglarId, int $attemptId): void
    {
        DB::transaction(function () use ($burglarId, $attemptId): void {
            if ($this->lockAttempt($burglarId, $attemptId)->outcome === null) {
                $this->close($attemptId, $burglarId, 'abandoned');
            }
        });
    }

    private function spendUse(int $accountId): void
    {
        $spent = DB::table('lockpick_wear')->where('account_id', $accountId)->lockForUpdate()->value('uses_spent');
        DB::table('lockpick_wear')->upsert(
            ['account_id' => $accountId, 'uses_spent' => ($spent ?? 0) + 1],
            ['account_id'],
            ['uses_spent'],
        );
    }

    private function close(int $attemptId, int $accountId, string $outcome): void
    {
        $this->end($attemptId, $outcome);
        $spent = DB::table('lockpick_wear')->where('account_id', $accountId)->lockForUpdate()->value('uses_spent');
        if ($spent !== null && (int) $spent >= self::USES_PER_PICK) {
            $this->inventory->revokeItem($accountId, $this->lockpick(), 1);
            DB::table('lockpick_wear')->where('account_id', $accountId)->delete();
        }
    }

    private function end(int $attemptId, string $outcome): void
    {
        DB::table('lockpick_attempts')->where('id', $attemptId)->update(['outcome' => $outcome, 'ended_at' => now()]);
    }

    private function lockAttempt(int $burglarId, int $attemptId): object
    {
        $attempt = DB::table('lockpick_attempts')->where('id', $attemptId)->where('burglar_account_id', $burglarId)->lockForUpdate()->first();
        if ($attempt === null) {
            throw new LockpickRejectedException('attempt_not_found', 'No lockpicking attempt.', 404);
        }

        return $attempt;
    }

    private function successes(): Builder
    {
        return DB::table('lockpick_attempts')->where('outcome', 'success');
    }

    private function isTooYoung(int $accountId): bool
    {
        return Account::query()->whereKey($accountId)
            ->where('created_at', '>', now()->subHours(TradeService::MIN_GIVER_AGE_HOURS))
            ->exists();
    }

    private function lockpick(): ItemDef
    {
        return ItemDef::query()->where('code', self::ITEM_CODE)->firstOrFail();
    }
}
