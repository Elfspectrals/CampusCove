<?php

namespace Tests\Concerns;

use Illuminate\Support\Facades\DB;

trait SetsWalletBalance
{
    /**
     * Sets an account wallet to an exact balance. Registration already creates the coins wallet
     * (welcome bonus), so the wallet is reused and the ledger is adjusted by the difference.
     */
    protected function setWalletBalance(int $accountId, string $currency, int $balance): int
    {
        $walletId = DB::table('wallets')
            ->where('owner_type', 'account')
            ->where('owner_id', $accountId)
            ->where('currency', $currency)
            ->value('wallet_id');

        if ($walletId === null) {
            $walletId = DB::table('wallets')->insertGetId([
                'owner_type' => 'account',
                'owner_id' => $accountId,
                'currency' => $currency,
                'created_at' => now(),
            ], 'wallet_id');
        }
        $walletId = (int) $walletId;

        $delta = $balance - (int) DB::table('wallet_ledger')->where('wallet_id', $walletId)->sum('delta');
        if ($delta !== 0) {
            DB::table('wallet_ledger')->insert([
                'wallet_id' => $walletId,
                'tx_id' => null,
                'delta' => $delta,
                'reason' => 'test_credit',
                'created_at' => now(),
            ]);
        }

        return $walletId;
    }
}
