<?php

namespace App\Services;

use App\Exceptions\PoliceRejectedException;
use App\Models\Account;
use App\Models\EconomyTransaction;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use Illuminate\Support\Facades\DB;

final class PoliceLicenceService
{
    public const PRICE = 300;

    /** @return array{held: bool, price: int} */
    public function state(int $accountId): array
    {
        return ['held' => $this->holds($accountId), 'price' => self::PRICE];
    }

    /** @return array{held: bool, price: int, bank: int} */
    public function buy(int $accountId): array
    {
        return DB::transaction(function () use ($accountId): array {
            $bank = Wallet::lockForAccount($accountId, Wallet::BANK);
            if ($this->holds($accountId)) {
                throw new PoliceRejectedException('police_licence_held', 'You already hold a police licence.', 409);
            }
            $jailed = DB::table('account_wanted_levels')->where('account_id', $accountId)->where('jail_ms', '>', 0)->exists();
            if ($jailed) {
                throw new PoliceRejectedException('police_jailed', 'You cannot buy a police licence from a cell.', 409);
            }
            $tooYoung = Account::query()->whereKey($accountId)
                ->where('created_at', '>', now()->subHours(TradeService::MIN_GIVER_AGE_HOURS))
                ->exists();
            if ($tooYoung) {
                throw new PoliceRejectedException(
                    'police_account_too_new',
                    'Accounts can buy a police licence '.TradeService::MIN_GIVER_AGE_HOURS.' hours after sign-up.',
                );
            }
            $balance = $bank->balance();
            if ($balance < self::PRICE) {
                throw new PoliceRejectedException('police_insufficient_funds', 'The licence costs '.self::PRICE.' coins and you do not have enough in the bank.');
            }
            $tx = EconomyTransaction::query()->create([
                'server_id' => null,
                'type' => 'police_licence',
                'status' => 'committed',
                'created_by_account_id' => $accountId,
                'committed_at' => now(),
                'meta_json' => ['amount' => self::PRICE],
            ]);
            WalletLedgerEntry::query()->create([
                'wallet_id' => $bank->wallet_id,
                'tx_id' => $tx->tx_id,
                'delta' => -self::PRICE,
                'reason' => 'police_licence',
            ]);
            DB::table('police_licences')->insert(['account_id' => $accountId, 'tx_id' => $tx->tx_id, 'bought_at' => now()]);

            return ['held' => true, 'price' => self::PRICE, 'bank' => $balance - self::PRICE];
        });
    }

    public function loseAtDeath(int $accountId): bool
    {
        return DB::table('police_licences')->where('account_id', $accountId)->delete() > 0;
    }

    public function holds(int $accountId): bool
    {
        return DB::table('police_licences')->where('account_id', $accountId)->exists();
    }
}
