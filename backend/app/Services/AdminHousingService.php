<?php

namespace App\Services;

use App\Exceptions\HousingRejectedException;
use App\Models\Account;
use App\Models\AccountHandle;
use App\Models\HousingUnit;
use App\Models\RoomMembership;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Admin control over housing: prices, daily tax ("rent"), owners and key holders. Every change is written to
 * staff_audit_logs and pushed to the realtime server so doors and locks follow at once.
 */
final class AdminHousingService
{
    private const AUDIT_PREFIX = 'housing.';

    public function __construct(
        private readonly HousingService $housing,
        private readonly RealtimeNotifier $realtime,
    ) {}

    /**
     * @return array{units: list<array<string, mixed>>, recent_actions: list<array<string, mixed>>}
     */
    public function overview(): array
    {
        $this->housing->collectDueTaxes();

        $units = HousingUnit::query()->orderBy('unit_id')->get();
        $roomIds = $units->pluck('room_id')->filter()->map(fn ($id): int => (int) $id)->all();
        $memberships = RoomMembership::query()
            ->whereIn('room_id', $roomIds)
            ->where('role', 'co_owner')
            ->orderBy('created_at')
            ->get()
            ->groupBy('room_id');

        $accountIds = $units->pluck('occupant_account_id')->filter()
            ->merge($memberships->flatten()->pluck('account_id'));
        $actions = DB::table('staff_audit_logs')
            ->where('action', 'like', self::AUDIT_PREFIX.'%')
            ->orderByDesc('audit_id')
            ->limit(20)
            ->get();
        $accountIds = $accountIds->merge($actions->pluck('staff_account_id')->filter());
        $names = AccountHandle::query()
            ->whereIn('account_id', $accountIds->map(fn ($id): int => (int) $id)->unique()->values())
            ->pluck('username', 'account_id');
        $person = fn (?int $id): ?array => $id === null ? null : [
            'account_id' => $id,
            'username' => $names[$id] ?? null,
        ];

        return [
            'units' => $units->map(function (HousingUnit $unit) use ($memberships, $person): array {
                $ownerId = $unit->occupant_account_id !== null ? (int) $unit->occupant_account_id : null;
                // Only the owner can share keys (HousingService::giveKeys), so every key came from them.
                $keyHolders = ($memberships[$unit->room_id] ?? collect())->map(fn (RoomMembership $m): array => [
                    ...$person((int) $m->account_id),
                    'shared_by' => $person($ownerId),
                    'since' => $m->created_at?->toIso8601String(),
                ])->values()->all();

                return [
                    'unit_id' => (int) $unit->unit_id,
                    'public_id' => (string) $unit->public_id,
                    'model_key' => $unit->model_key,
                    'status' => (string) $unit->status,
                    'price_coins' => (int) $unit->price_coins,
                    'tax_coins' => $this->housing->taxFor($unit),
                    'tax_is_custom' => $unit->tax_coins !== null,
                    'tax_due_at' => $unit->tax_due_at?->toIso8601String(),
                    'door_locked' => (bool) $unit->door_locked,
                    'owner' => $person($ownerId),
                    'key_holders' => $keyHolders,
                ];
            })->all(),
            'recent_actions' => $actions->map(fn (object $row): array => [
                'action' => substr((string) $row->action, strlen(self::AUDIT_PREFIX)),
                'staff' => $person($row->staff_account_id !== null ? (int) $row->staff_account_id : null),
                'target' => json_decode((string) $row->target_json, true),
                'created_at' => (string) $row->created_at,
            ])->all(),
        ];
    }

    /**
     * Applies to the next purchase and the next tax charge; a null tax goes back to the default share of the price.
     *
     * @param  array{price_coins?: int, tax_coins?: int|null}  $changes
     */
    public function updatePricing(Account $admin, string $publicId, array $changes): void
    {
        DB::transaction(function () use ($admin, $publicId, $changes): void {
            $unit = $this->lockedUnit($publicId);
            $before = ['price_coins' => (int) $unit->price_coins, 'tax_coins' => $unit->tax_coins];
            $unit->update([...$changes, 'updated_at' => now()]);
            $this->audit($admin, 'pricing', $unit, [
                'before' => $before,
                'after' => ['price_coins' => (int) $unit->price_coins, 'tax_coins' => $unit->tax_coins],
            ]);
        });
        $this->realtime->housingChanged();
    }

    /** Evicts the owner: same as a seizure for unpaid tax (keys revoked, furniture deleted on purpose). */
    public function kickOwner(Account $admin, string $publicId): void
    {
        DB::transaction(function () use ($admin, $publicId): void {
            $unit = $this->lockedUnit($publicId);
            if ($unit->status !== 'occupied' || $unit->occupant_account_id === null) {
                throw new HousingRejectedException('unit_not_occupied', 'Nobody owns this house.', 422);
            }
            $ownerId = (int) $unit->occupant_account_id;
            $keyHolderIds = $this->housing->keyHolderIds($unit);
            $this->housing->resetExpiredUnit($unit);
            $this->audit($admin, 'kick_owner', $unit, ['account_id' => $ownerId, 'key_holder_account_ids' => $keyHolderIds]);
        });
        $this->realtime->housingChanged();
    }

    public function kickKeyHolder(Account $admin, string $publicId, int $accountId): void
    {
        DB::transaction(function () use ($admin, $publicId, $accountId): void {
            $unit = $this->lockedUnit($publicId);
            if (! $this->housing->revokeKeyHolder($unit, $accountId)) {
                throw new HousingRejectedException('not_key_holder', 'This player does not hold keys to this house.', 404);
            }
            $this->audit($admin, 'kick_key_holder', $unit, [
                'account_id' => $accountId,
                'shared_by_account_id' => $unit->occupant_account_id,
            ]);
        });
        $this->realtime->housingChanged();
    }

    private function lockedUnit(string $publicId): HousingUnit
    {
        $unit = Str::isUuid($publicId)
            ? HousingUnit::query()->where('public_id', $publicId)->lockForUpdate()->first()
            : null;
        if ($unit === null) {
            throw new HousingRejectedException('unit_not_found', 'Housing unit not found.', 404);
        }

        return $unit;
    }

    /** @param  array<string, mixed>  $details */
    private function audit(Account $admin, string $action, HousingUnit $unit, array $details): void
    {
        DB::table('staff_audit_logs')->insert([
            'staff_account_id' => (int) $admin->getAuthIdentifier(),
            'action' => self::AUDIT_PREFIX.$action,
            'target_json' => json_encode([
                'unit_id' => (int) $unit->unit_id,
                'public_id' => (string) $unit->public_id,
                'model_key' => $unit->model_key,
                ...$details,
            ]),
            'created_at' => now(),
        ]);
    }
}
