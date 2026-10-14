<?php

namespace App\Services;

use App\Models\EconomyTransaction;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use Illuminate\Support\Facades\DB;

/**
 * Credits coins granted by the game (tx_type 'reward'). The ledger reason names the source.
 * Callers own idempotency (once-per-account checks, row locks).
 */
final class CoinRewardService
{
    /**
     * @param array<string, mixed> $meta
     */
    public function credit(int $accountId, string $reason, int $amount, array $meta = []): void
    {
        DB::transaction(function () use ($accountId, $reason, $amount, $meta): void {
            $wallet = $this->lockCoinsWallet($accountId);

            $tx = EconomyTransaction::query()->create([
                'server_id' => null,
                'type' => 'reward',
                'status' => 'committed',
                'created_by_account_id' => $accountId,
                'committed_at' => now(),
                'meta_json' => array_merge(['source' => $reason, 'amount' => $amount], $meta),
            ]);

            WalletLedgerEntry::query()->create([
                'wallet_id' => $wallet->wallet_id,
                'tx_id' => $tx->tx_id,
                'delta' => $amount,
                'reason' => $reason,
            ]);
        });
    }

    public function hasReceived(int $accountId, string $reason): bool
    {
        return WalletLedgerEntry::query()
            ->where('wallet_id', $this->lockCoinsWallet($accountId)->wallet_id)
            ->where('reason', $reason)
            ->exists();
    }

    public function lockCoinsWallet(int $accountId): Wallet
    {
        $wallet = Wallet::query()->firstOrCreate([
            'owner_type' => Wallet::OWNER_TYPE_ACCOUNT,
            'owner_id' => $accountId,
            'currency' => 'coins',
        ]);

        return Wallet::query()->whereKey($wallet->wallet_id)->lockForUpdate()->firstOrFail();
    }
}
