<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\FindsAccount;
use App\Models\EconomyTransaction;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/** Dev / support tool: writes an admin_adjust ledger entry so the balance reaches the target. */
class SetMoney extends Command
{
    use FindsAccount;

    protected $signature = 'setMoney {account} {currency} {sum}';

    protected $description = 'Set account balance to an absolute value (account_id or email)';

    public function handle(): int
    {
        $currency = mb_strtolower(trim((string) $this->argument('currency')));
        if (! in_array($currency, ['coins', 'premium'], true)) {
            $this->error("Invalid currency '{$this->argument('currency')}'. Use 'coins' or 'premium'.");

            return self::FAILURE;
        }

        $sum = trim((string) $this->argument('sum'));
        if (! preg_match('/^\d+$/', $sum)) {
            $this->error('Sum must be a non-negative integer.');

            return self::FAILURE;
        }
        $targetBalance = (int) $sum;

        $account = $this->findAccount((string) $this->argument('account'));
        if (! $account) {
            return self::FAILURE;
        }
        $accountId = (int) $account->account_id;

        $finalBalance = DB::transaction(function () use ($accountId, $currency, $targetBalance): int {
            $wallet = Wallet::lockForAccount($accountId, $currency);
            $currentBalance = $wallet->balance();
            $delta = $targetBalance - $currentBalance;
            if ($delta === 0) {
                return $currentBalance;
            }

            $tx = EconomyTransaction::query()->create([
                'server_id' => null,
                'type' => 'admin_adjust',
                'status' => 'committed',
                'created_by_account_id' => null,
                'committed_at' => now(),
                'meta_json' => [
                    'operation' => 'set_money',
                    'account_id' => $accountId,
                    'currency' => $currency,
                    'target_balance' => $targetBalance,
                    'previous_balance' => $currentBalance,
                    'delta' => $delta,
                ],
            ]);
            WalletLedgerEntry::query()->create([
                'wallet_id' => $wallet->wallet_id,
                'tx_id' => $tx->tx_id,
                'delta' => $delta,
                'reason' => 'admin_set_money',
            ]);

            return $wallet->balance();
        });

        $this->info("Balance set: account_id={$accountId}, currency={$currency}, balance={$finalBalance}.");

        return self::SUCCESS;
    }
}
