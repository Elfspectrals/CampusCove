<?php

namespace App\Services;

use App\Models\Wallet;
use Illuminate\Support\Facades\DB;

final class WalletSummaryService
{
    /**
     * Ledger sums for the account's wallets, keyed by currency (coins is the bank, cash is carried, premium).
     *
     * @return array{coins: int, cash: int, premium: int}
     */
    public function forAccountId(int $accountId): array
    {
        $summary = ['coins' => 0, 'cash' => 0, 'premium' => 0];

        $rows = DB::table('wallets')
            ->leftJoin('wallet_ledger', 'wallet_ledger.wallet_id', '=', 'wallets.wallet_id')
            ->where('wallets.owner_type', Wallet::OWNER_TYPE_ACCOUNT)
            ->where('wallets.owner_id', $accountId)
            ->groupBy('wallets.currency')
            ->select('wallets.currency', DB::raw('COALESCE(SUM(wallet_ledger.delta), 0) as balance'))
            ->get();

        foreach ($rows as $row) {
            if ($row->currency === 'coins') {
                $summary['coins'] = (int) $row->balance;
            } elseif ($row->currency === Wallet::CASH) {
                $summary['cash'] = (int) $row->balance;
            } elseif ($row->currency === 'premium') {
                $summary['premium'] = (int) $row->balance;
            }
        }

        return $summary;
    }
}
