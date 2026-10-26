<?php

namespace App\Services;

use App\Exceptions\HousingRejectedException;
use App\Models\Account;
use App\Models\AccountHandle;
use App\Models\Container;
use App\Models\EconomyTransaction;
use App\Models\HousingUnit;
use App\Models\ItemDef;
use App\Models\ItemInstance;
use App\Models\Room;
use App\Models\RoomFurniture;
use App\Models\RoomFurnitureContainer;
use App\Models\RoomMembership;
use App\Models\Server;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use Illuminate\Support\Facades\DB;

final class HousingService
{
    private const CURRENCY = 'coins';

    private const TAX_RATE = 0.05;

    private const TAX_PERIOD_HOURS = 24;

    private const HOUSE_KEY_CODE = 'house_key';

    public function __construct(private readonly AccountInventoryService $inventoryService) {}

    public function collectDueTaxes(): int
    {
        $seized = 0;
        $dueIds = HousingUnit::query()
            ->where('status', 'occupied')
            ->where(fn ($query) => $query->whereNull('tax_due_at')->orWhere('tax_due_at', '<=', now()))
            ->pluck('unit_id');

        foreach ($dueIds as $unitId) {
            DB::transaction(function () use ($unitId, &$seized): void {
                /** @var HousingUnit|null $unit */
                $unit = HousingUnit::query()
                    ->where('unit_id', $unitId)
                    ->lockForUpdate()
                    ->first();
                if ($unit === null || $unit->status !== 'occupied' || $unit->occupant_account_id === null) {
                    return;
                }
                if ($unit->tax_due_at === null) {
                    $unit->update(['tax_due_at' => now()->addHours(self::TAX_PERIOD_HOURS), 'updated_at' => now()]);

                    return;
                }
                $ownerId = (int) $unit->occupant_account_id;
                $tax = $this->taxFor($unit);
                $dueAt = $unit->tax_due_at->copy();
                while ($dueAt->lte(now())) {
                    if (Wallet::lockForAccount($ownerId, self::CURRENCY)->balance() < $tax) {
                        $this->resetExpiredUnit($unit);
                        $seized++;

                        return;
                    }
                    $this->debitCoins($ownerId, $tax, 'housing_tax', [
                        'housing_unit_id' => $unit->unit_id,
                        'housing_unit_public_id' => $unit->public_id,
                        'due_at' => $dueAt->toIso8601String(),
                    ]);
                    $dueAt->addHours(self::TAX_PERIOD_HOURS);
                }
                $unit->update(['tax_due_at' => $dueAt, 'updated_at' => now()]);
            });
        }

        return $seized;
    }

    public function taxFor(HousingUnit $unit): int
    {
        return (int) ceil($unit->price_coins * self::TAX_RATE);
    }

    public function resetExpiredUnit(HousingUnit $unit): void
    {
        $roomId = $unit->room_id !== null ? (int) $unit->room_id : null;
        if ($unit->occupant_account_id !== null) {
            $this->inventoryService->revokeItem((int) $unit->occupant_account_id, $this->houseKey(), 1);
        }
        if ($roomId !== null) {
            foreach ($this->keyHolderIds($unit) as $keyHolderId) {
                $this->inventoryService->revokeItem($keyHolderId, $this->houseKey(), 1);
            }
            $containerId = RoomFurnitureContainer::query()->where('room_id', $roomId)->value('container_id');
            RoomFurniture::query()->where('room_id', $roomId)->delete();
            if ($containerId !== null) {
                ItemInstance::query()->where('container_id', (int) $containerId)->delete();
            }
            RoomMembership::query()->where('room_id', $roomId)->delete();
            Room::query()->where('room_id', $roomId)->delete();
        }

        $unit->update([
            'status' => 'vacant',
            'occupant_account_id' => null,
            'lease_expires_at' => null,
            'tax_due_at' => null,
            'room_id' => null,
            'updated_at' => now(),
        ]);
    }

    /**
     * @return array{units: list<array<string, mixed>>, my_unit: array<string, mixed>|null}
     */
    public function listUnitsForAccount(?int $accountId): array
    {
        $this->collectDueTaxes();

        $units = HousingUnit::query()
            ->with('room')
            ->orderBy('unit_id')
            ->get()
            ->map(fn (HousingUnit $unit): array => $this->serializeUnit($unit))
            ->all();

        $myUnit = null;
        if ($accountId !== null) {
            $owned = $this->findOccupiedUnitForAccount($accountId);
            if ($owned !== null) {
                $owned->load('room');
                $myUnit = $this->serializeUnit($owned);
            }
        }

        return [
            'units' => $units,
            'my_unit' => $myUnit,
        ];
    }

    public function claimBuy(Account $account, string $unitPublicId): HousingUnit
    {
        return $this->claimUnit($account, $unitPublicId, 'buy', 'housing_buy');
    }

    public function giveKeys(Account $owner, int $targetAccountId): HousingUnit
    {
        $unit = $this->ownedUnitForKeys($owner, $targetAccountId);
        if (! Account::query()->whereKey($targetAccountId)->exists()) {
            throw new HousingRejectedException('account_not_found', 'This player does not exist.', 404);
        }
        if (in_array($targetAccountId, $this->keyHolderIds($unit), true)) {
            return $unit->fresh(['room']);
        }
        DB::transaction(function () use ($unit, $targetAccountId): void {
            DB::statement(
                '
                INSERT INTO room_memberships (room_id, account_id, role, created_at)
                VALUES (?, ?, ?, NOW())
                ON CONFLICT (room_id, account_id)
                DO UPDATE SET role = EXCLUDED.role
                ',
                [(int) $unit->room_id, $targetAccountId, 'co_owner']
            );
            $this->inventoryService->grantItem($targetAccountId, $this->houseKey(), 1);
        });

        return $unit->fresh(['room']);
    }

    public function takeKeys(Account $owner, int $targetAccountId): HousingUnit
    {
        $unit = $this->ownedUnitForKeys($owner, $targetAccountId);
        DB::transaction(function () use ($unit, $targetAccountId): void {
            $removed = RoomMembership::query()
                ->where('room_id', (int) $unit->room_id)
                ->where('account_id', $targetAccountId)
                ->where('role', 'co_owner')
                ->delete();
            if ($removed > 0) {
                $this->inventoryService->revokeItem($targetAccountId, $this->houseKey(), 1);
            }
        });

        return $unit->fresh(['room']);
    }

    /**
     * @return list<int>
     */
    public function keyHolderIds(HousingUnit $unit): array
    {
        if ($unit->room_id === null) {
            return [];
        }

        return RoomMembership::query()
            ->where('room_id', (int) $unit->room_id)
            ->where('role', 'co_owner')
            ->orderBy('account_id')
            ->pluck('account_id')
            ->map(fn ($id): int => (int) $id)
            ->all();
    }

    private function ownedUnitForKeys(Account $owner, int $targetAccountId): HousingUnit
    {
        $ownerId = (int) $owner->getAuthIdentifier();
        $unit = $this->findOccupiedUnitForAccount($ownerId);
        if ($unit === null || $unit->room_id === null) {
            throw new HousingRejectedException('no_house', 'You do not own a house.', 404);
        }
        if ($targetAccountId === $ownerId) {
            throw new HousingRejectedException('cannot_key_self', 'You already own this house.', 422);
        }

        return $unit;
    }

    public function findOccupiedUnitForAccount(int $accountId): ?HousingUnit
    {
        return HousingUnit::query()
            ->where('occupant_account_id', $accountId)
            ->where('status', 'occupied')
            ->first();
    }

    public function canVisitOwnerApartment(int $ownerAccountId): bool
    {
        $unit = HousingUnit::query()
            ->where('occupant_account_id', $ownerAccountId)
            ->where('status', 'occupied')
            ->first();

        if ($unit === null) {
            return false;
        }

        if ($unit->offer_type === 'buy') {
            return true;
        }

        return $unit->lease_expires_at !== null && $unit->lease_expires_at->isFuture();
    }

    public function officialTemplateKeyForAccount(int $accountId): string
    {
        $unit = $this->findOccupiedUnitForAccount($accountId);

        return $unit !== null ? $unit->templateKey() : 'starter_loft';
    }

    private function claimUnit(
        Account $account,
        string $unitPublicId,
        string $expectedOffer,
        string $txType
    ): HousingUnit {
        $accountId = (int) $account->getAuthIdentifier();

        return DB::transaction(function () use ($accountId, $unitPublicId, $expectedOffer, $txType): HousingUnit {
            $this->collectDueTaxes();

            /** @var HousingUnit|null $unit */
            $unit = HousingUnit::query()
                ->where('public_id', $unitPublicId)
                ->lockForUpdate()
                ->first();

            if ($unit === null) {
                throw new HousingRejectedException('unit_not_found', 'Housing unit not found.', 404);
            }

            if ($unit->offer_type !== $expectedOffer) {
                throw new HousingRejectedException('wrong_offer_type', 'This action is not available for this unit.', 422);
            }

            if ($unit->status !== 'vacant') {
                throw new HousingRejectedException('unit_not_vacant', 'This unit is not available.', 422);
            }

            if ($this->findOccupiedUnitForAccount($accountId) !== null) {
                throw new HousingRejectedException('already_owns_unit', 'You already occupy a housing unit.', 422);
            }

            $this->debitCoins($accountId, (int) $unit->price_coins, $txType, [
                'housing_unit_id' => $unit->unit_id,
                'housing_unit_public_id' => $unit->public_id,
            ]);

            $room = $this->createApartmentRoom($accountId, $unit->templateKey());

            $unit->update([
                'status' => 'occupied',
                'occupant_account_id' => $accountId,
                'lease_expires_at' => null,
                'tax_due_at' => now()->addHours(self::TAX_PERIOD_HOURS),
                'room_id' => (int) $room->room_id,
                'updated_at' => now(),
            ]);
            $this->inventoryService->grantItem($accountId, $this->houseKey(), 1);

            return $unit->fresh(['room']);
        });
    }

    private function houseKey(): ItemDef
    {
        return ItemDef::query()->where('code', self::HOUSE_KEY_CODE)->firstOrFail();
    }

    private function debitCoins(int $accountId, int $amount, string $reason, array $meta): void
    {
        $wallet = Wallet::lockForAccount($accountId, self::CURRENCY);
        $balance = $wallet->balance();
        if ($balance < $amount) {
            throw new HousingRejectedException('insufficient_funds', 'Insufficient wallet balance.', 422);
        }

        $tx = EconomyTransaction::query()->create([
            'server_id' => null,
            'type' => $reason,
            'status' => 'committed',
            'created_by_account_id' => $accountId,
            'committed_at' => now(),
            'meta_json' => $meta,
        ]);

        WalletLedgerEntry::query()->create([
            'wallet_id' => $wallet->wallet_id,
            'tx_id' => $tx->tx_id,
            'delta' => -$amount,
            'reason' => $reason,
        ]);
    }

    private function createApartmentRoom(int $ownerAccountId, string $templateKey): Room
    {
        $serverId = $this->resolveDefaultServerId();
        $roomName = 'apartment:'.$ownerAccountId.':'.$templateKey;
        $room = Room::query()
            ->where('server_id', $serverId)
            ->where('type', 'apartment')
            ->where('name', $roomName)
            ->lockForUpdate()
            ->first();

        if ($room === null) {
            $room = Room::query()->create([
                'server_id' => $serverId,
                'type' => 'apartment',
                'name' => $roomName,
                'owner_character_id' => null,
                'building_id' => null,
            ]);
        }

        DB::statement(
            '
            INSERT INTO room_memberships (room_id, account_id, role, created_at)
            VALUES (?, ?, ?, NOW())
            ON CONFLICT (room_id, account_id)
            DO UPDATE SET role = EXCLUDED.role
            ',
            [(int) $room->room_id, $ownerAccountId, 'owner']
        );

        $containerRow = RoomFurnitureContainer::query()
            ->where('room_id', (int) $room->room_id)
            ->lockForUpdate()
            ->first();

        if ($containerRow === null) {
            $container = Container::query()->create([
                'type' => 'room_furniture',
            ]);
            RoomFurnitureContainer::query()->create([
                'room_id' => (int) $room->room_id,
                'container_id' => (int) $container->container_id,
            ]);
        }

        return $room;
    }

    private function resolveDefaultServerId(): int
    {
        $existing = Server::query()->where('name', 'main')->value('server_id');
        if ($existing !== null) {
            return (int) $existing;
        }

        return (int) Server::query()->create([
            'name' => 'main',
            'is_enabled' => true,
        ])->server_id;
    }

    /**
     * @return array<string, mixed>
     */
    public function serializeUnit(HousingUnit $unit): array
    {
        return [
            'unit_id' => (int) $unit->unit_id,
            'public_id' => (string) $unit->public_id,
            'offer_type' => (string) $unit->offer_type,
            'price_coins' => (int) $unit->price_coins,
            'tax_coins' => $this->taxFor($unit),
            'pos_x' => (float) $unit->pos_x,
            'pos_y' => (float) $unit->pos_y,
            'pos_z' => (float) $unit->pos_z,
            'size' => (float) $unit->size,
            'base_color_hex' => (string) $unit->base_color_hex,
            'model_key' => $unit->model_key !== null ? (string) $unit->model_key : null,
            'status' => (string) $unit->status,
            'occupant_account_id' => $unit->occupant_account_id !== null ? (int) $unit->occupant_account_id : null,
            'occupant_name' => $unit->occupant_account_id !== null
                ? AccountHandle::query()->where('account_id', (int) $unit->occupant_account_id)->value('username')
                : null,
            'tax_due_at' => $unit->tax_due_at?->toIso8601String(),
            'room_public_id' => $unit->room !== null ? (string) $unit->room->public_id : null,
            'template_key' => $unit->templateKey(),
            'key_holder_account_ids' => $this->keyHolderIds($unit),
        ];
    }
}
