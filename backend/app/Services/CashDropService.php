<?php

namespace App\Services;

use App\Exceptions\CashDropRejectedException;
use App\Models\Account;
use App\Models\CashDrop;
use App\Models\EconomyTransaction;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use Illuminate\Support\Facades\DB;

final class CashDropService
{
    public const LIFETIME_MINUTES = 5;

    /** @return array{id: int, amount: int, expires_at: string}|null */
    public function dropAtDeath(int $accountId, ?int $killerAccountId): ?array
    {
        return DB::transaction(function () use ($accountId, $killerAccountId): ?array {
            $wallet = Wallet::lockForAccount($accountId, Wallet::CASH);
            $amount = $wallet->balance();
            if ($amount <= 0) {
                return null;
            }
            $txId = $this->transaction($accountId, 'cash_drop', ['amount' => $amount, 'killer_account_id' => $killerAccountId]);
            $this->entry($wallet, $txId, -$amount, 'cash_drop');
            if ($this->isTooYoungToDrop($accountId)) {
                return null;
            }
            $drop = CashDrop::query()->create([
                'owner_account_id' => $accountId,
                'killer_account_id' => $killerAccountId === $accountId ? null : $killerAccountId,
                'amount' => $amount,
                'drop_tx_id' => $txId,
                'expires_at' => now()->addMinutes(self::LIFETIME_MINUTES),
            ]);

            return ['id' => (int) $drop->id, 'amount' => $amount, 'expires_at' => $drop->expires_at->toIso8601String()];
        });
    }

    /** @return array{amount: int, cash: int} */
    public function pick(int $dropId, int $pickerAccountId): array
    {
        return DB::transaction(function () use ($dropId, $pickerAccountId): array {
            $drop = CashDrop::query()->whereKey($dropId)->lockForUpdate()->first();
            if ($drop === null || $drop->picked_at !== null || $drop->expires_at->isPast()) {
                throw new CashDropRejectedException('cash_drop_gone', 'This cash is gone.', 409);
            }
            if ($drop->killer_account_id === $pickerAccountId) {
                throw new CashDropRejectedException('cash_drop_killer', 'You cannot take the cash of the player you knocked out.', 403);
            }
            $wallet = Wallet::lockForAccount($pickerAccountId, Wallet::CASH);
            $txId = $this->transaction($pickerAccountId, 'cash_pickup', ['amount' => $drop->amount, 'cash_drop_id' => $drop->id]);
            $this->entry($wallet, $txId, $drop->amount, 'cash_pickup');
            $drop->update(['picked_by_account_id' => $pickerAccountId, 'pickup_tx_id' => $txId, 'picked_at' => now()]);

            return ['amount' => $drop->amount, 'cash' => $wallet->balance()];
        });
    }

    private function isTooYoungToDrop(int $accountId): bool
    {
        return Account::query()->whereKey($accountId)
            ->where('created_at', '>', now()->subHours(TradeService::MIN_GIVER_AGE_HOURS))
            ->exists();
    }

    /** @param array<string, mixed> $meta */
    private function transaction(int $accountId, string $type, array $meta): int
    {
        return (int) EconomyTransaction::query()->create([
            'server_id' => null,
            'type' => $type,
            'status' => 'committed',
            'created_by_account_id' => $accountId,
            'committed_at' => now(),
            'meta_json' => $meta,
        ])->tx_id;
    }

    private function entry(Wallet $wallet, int $txId, int $delta, string $reason): void
    {
        WalletLedgerEntry::query()->create([
            'wallet_id' => $wallet->wallet_id,
            'tx_id' => $txId,
            'delta' => $delta,
            'reason' => $reason,
        ]);
    }
}
