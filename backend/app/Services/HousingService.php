<?php

namespace App\Services;

use App\Exceptions\HousingRejectedException;
use App\Models\Account;
use App\Models\Container;
use App\Models\EconomyTransaction;
use App\Models\HousingUnit;
use App\Models\ItemInstance;
use App\Models\Room;
use App\Models\RoomFurniture;
use App\Models\RoomFurnitureContainer;
use App\Models\RoomMembership;
use App\Models\Server;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class HousingService
{
    private const CURRENCY = 'coins';

    public function expireDueLeases(): int
    {
        $expired = 0;
        $dueIds = HousingUnit::query()
            ->where('status', 'occupied')
            ->where('offer_type', 'rent')
            ->whereNotNull('lease_expires_at')
            ->where('lease_expires_at', '<=', now())
            ->pluck('unit_id');

        foreach ($dueIds as $unitId) {
            DB::transaction(function () use ($unitId, &$expired): void {
                /** @var HousingUnit|null $unit */
                $unit = HousingUnit::query()
                    ->where('unit_id', $unitId)
                    ->lockForUpdate()
                    ->first();
                if ($unit === null || $unit->status !== 'occupied') {
                    return;
                }
                if ($unit->offer_type !== 'rent' || $unit->lease_expires_at === null) {
                    return;
                }
                if ($unit->lease_expires_at->isFuture()) {
                    return;
                }
                $this->resetExpiredUnit($unit);
                $expired++;
            });
        }

        return $expired;
    }

    public function resetExpiredUnit(HousingUnit $unit): void
    {
        $roomId = $unit->room_id !== null ? (int) $unit->room_id : null;
        if ($roomId !== null) {
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
            'room_id' => null,
            'updated_at' => now(),
        ]);
    }

    /**
     * @return array{units: list<array<string, mixed>>, my_unit: array<string, mixed>|null}
     */
    public function listUnitsForAccount(?int $accountId): array
    {
        $this->expireDueLeases();

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

    /**
     * @return list<array<string, mixed>>
     */
    public function listUnits(): array
    {
        return $this->listUnitsForAccount(null)['units'];
    }

    public function claimBuy(Account $account, string $unitPublicId): HousingUnit
    {
        return $this->claimUnit($account, $unitPublicId, 'buy', 'housing_buy', null);
    }

    public function claimRent(Account $account, string $unitPublicId): HousingUnit
    {
        return $this->claimUnit($account, $unitPublicId, 'rent', 'housing_rent', function (HousingUnit $unit): Carbon {
            return now()->addHours((int) $unit->rent_duration_hours);
        });
    }

    public function renewRent(Account $account, string $unitPublicId): HousingUnit
    {
        $accountId = (int) $account->getAuthIdentifier();

        return DB::transaction(function () use ($account, $accountId, $unitPublicId): HousingUnit {
            $this->expireDueLeases();

            /** @var HousingUnit|null $unit */
            $unit = HousingUnit::query()
                ->where('public_id', $unitPublicId)
                ->lockForUpdate()
                ->first();

            if ($unit === null) {
                throw new HousingRejectedException('unit_not_found', 'Housing unit not found.', 404);
            }

            if ($unit->offer_type !== 'rent') {
                throw new HousingRejectedException('not_rentable', 'This unit is not available for rent.', 422);
            }

            if ($unit->status !== 'occupied' || (int) $unit->occupant_account_id !== $accountId) {
                throw new HousingRejectedException('not_occupant', 'You are not the occupant of this unit.', 422);
            }

            if ($unit->lease_expires_at === null || $unit->lease_expires_at->lte(now())) {
                $this->resetExpiredUnit($unit->fresh());
                throw new HousingRejectedException('lease_expired', 'Your lease has expired. Claim the unit again.', 422);
            }

            $this->debitCoins($accountId, (int) $unit->price_coins, 'housing_renew', [
                'housing_unit_id' => $unit->unit_id,
                'housing_unit_public_id' => $unit->public_id,
            ]);

            $base = $unit->lease_expires_at;
            $unit->update([
                'lease_expires_at' => $base->copy()->addHours((int) $unit->rent_duration_hours),
                'updated_at' => now(),
            ]);

            $unit->load('room');

            return $unit->fresh(['room']);
        });
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

    public function isCurrentOccupant(int $accountId, int $ownerAccountId): bool
    {
        return $accountId === $ownerAccountId
            && $this->findOccupiedUnitForAccount($accountId) !== null;
    }

    public function officialTemplateKeyForAccount(int $accountId): string
    {
        $unit = $this->findOccupiedUnitForAccount($accountId);

        return $unit !== null ? $unit->templateKey() : 'starter_loft';
    }

    /**
     * @param callable(HousingUnit): Carbon|null $leaseResolver
     */
    private function claimUnit(
        Account $account,
        string $unitPublicId,
        string $expectedOffer,
        string $txType,
        ?callable $leaseResolver
    ): HousingUnit {
        $accountId = (int) $account->getAuthIdentifier();

        return DB::transaction(function () use ($accountId, $unitPublicId, $expectedOffer, $txType, $leaseResolver): HousingUnit {
            $this->expireDueLeases();

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

            $leaseExpiresAt = $leaseResolver !== null ? $leaseResolver($unit) : null;

            $unit->update([
                'status' => 'occupied',
                'occupant_account_id' => $accountId,
                'lease_expires_at' => $leaseExpiresAt,
                'room_id' => (int) $room->room_id,
                'updated_at' => now(),
            ]);

            return $unit->fresh(['room']);
        });
    }

    private function debitCoins(int $accountId, int $amount, string $reason, array $meta): void
    {
        $wallet = $this->lockAccountWallet($accountId, self::CURRENCY);
        $balance = $this->walletBalance((int) $wallet->wallet_id);
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

    private function lockAccountWallet(int $accountId, string $currency): Wallet
    {
        $wallet = Wallet::query()
            ->where('owner_type', Wallet::OWNER_TYPE_ACCOUNT)
            ->where('owner_id', $accountId)
            ->where('currency', $currency)
            ->lockForUpdate()
            ->first();

        if ($wallet !== null) {
            return $wallet;
        }

        try {
            return Wallet::query()->create([
                'owner_type' => Wallet::OWNER_TYPE_ACCOUNT,
                'owner_id' => $accountId,
                'currency' => $currency,
                'created_at' => now(),
            ]);
        } catch (UniqueConstraintViolationException) {
            // Concurrent wallet creation.
        }

        return Wallet::query()
            ->where('owner_type', Wallet::OWNER_TYPE_ACCOUNT)
            ->where('owner_id', $accountId)
            ->where('currency', $currency)
            ->lockForUpdate()
            ->firstOrFail();
    }

    private function walletBalance(int $walletId): int
    {
        return (int) WalletLedgerEntry::query()->where('wallet_id', $walletId)->sum('delta');
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
            'rent_duration_hours' => (int) $unit->rent_duration_hours,
            'pos_x' => (float) $unit->pos_x,
            'pos_y' => (float) $unit->pos_y,
            'pos_z' => (float) $unit->pos_z,
            'size' => (float) $unit->size,
            'base_color_hex' => (string) $unit->base_color_hex,
            'model_key' => $unit->model_key !== null ? (string) $unit->model_key : null,
            'status' => (string) $unit->status,
            'occupant_account_id' => $unit->occupant_account_id !== null ? (int) $unit->occupant_account_id : null,
            'lease_expires_at' => $unit->lease_expires_at?->toIso8601String(),
            'room_public_id' => $unit->room !== null ? (string) $unit->room->public_id : null,
            'template_key' => $unit->templateKey(),
        ];
    }
}
