<?php

namespace App\Services;

use App\Enums\ActionCounter;
use App\Exceptions\BankRejectedException;
use App\Models\Account;
use App\Models\AccountHandle;
use App\Models\EconomyTransaction;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use Illuminate\Support\Facades\DB;

final class BankService
{
    public const HISTORY_SIZE = 20;

    public function __construct(
        private readonly WalletSummaryService $wallets,
        private readonly ActionCounterService $counters,
    ) {}

    /** @return array{cash: int, bank: int} */
    public function deposit(int $accountId, int $amount, string $ref): array
    {
        return DB::transaction(function () use ($accountId, $amount, $ref): array {
            $balances = $this->move($accountId, $amount, $ref, Wallet::CASH, Wallet::BANK, 'bank_deposit', 'Not enough cash on you.');
            $this->counters->bump($accountId, ActionCounter::AtmDeposits);

            return $balances;
        });
    }

    /** @return array{cash: int, bank: int} */
    public function withdraw(int $accountId, int $amount, string $ref): array
    {
        return $this->move($accountId, $amount, $ref, Wallet::BANK, Wallet::CASH, 'bank_withdraw', 'Not enough money in the bank.');
    }

    /** @return array{bank: int} */
    public function transfer(int $fromAccountId, string $username, int $tag, int $amount, string $ref): array
    {
        $to = AccountHandle::query()->where('normalized', mb_strtolower($username))->where('tag', $tag)->first();
        if ($to === null) {
            throw new BankRejectedException('bank_unknown_recipient', 'No player with that name.', 404);
        }
        $toAccountId = (int) $to->account_id;
        if ($toAccountId === $fromAccountId) {
            throw new BankRejectedException('bank_self_transfer', 'You cannot send money to yourself.');
        }
        $tooYoung = Account::query()->whereKey($fromAccountId)
            ->where('created_at', '>', now()->subHours(TradeService::MIN_GIVER_AGE_HOURS))
            ->exists();
        if ($tooYoung) {
            throw new BankRejectedException(
                'bank_account_too_new',
                'Accounts can send money '.TradeService::MIN_GIVER_AGE_HOURS.' hours after sign-up. They can already receive.',
            );
        }
        $from = AccountHandle::query()->where('account_id', $fromAccountId)->firstOrFail();

        return DB::transaction(function () use ($fromAccountId, $toAccountId, $amount, $ref, $from, $to): array {
            $ids = [$fromAccountId, $toAccountId];
            sort($ids);
            $wallets = [];
            foreach ($ids as $id) {
                $wallets[$id] = Wallet::lockForAccount($id, Wallet::BANK);
            }
            $this->refuseReplay('bank_transfer', $ref);
            $balance = $wallets[$fromAccountId]->balance();
            if ($balance < $amount) {
                throw new BankRejectedException('bank_insufficient_funds', 'Not enough money in the bank.');
            }
            $txId = $this->transaction($fromAccountId, 'bank_transfer', [
                'amount' => $amount,
                'ref' => $ref,
                'from' => $from->display_name,
                'to' => $to->display_name,
            ]);
            $this->entry($wallets[$fromAccountId], $txId, -$amount, 'bank_transfer_out');
            $this->entry($wallets[$toAccountId], $txId, $amount, 'bank_transfer_in');

            return ['bank' => $balance - $amount];
        });
    }

    /** @return array{cash: int, bank: int} */
    public function adminGrant(int $adminAccountId, int $toAccountId, string $currency, int $amount, string $ref): array
    {
        return DB::transaction(function () use ($adminAccountId, $toAccountId, $currency, $amount, $ref): array {
            $cash = Wallet::lockForAccount($toAccountId, Wallet::CASH);
            $bank = Wallet::lockForAccount($toAccountId, Wallet::BANK);
            $this->refuseReplay('admin_grant', $ref);
            $txId = $this->transaction($adminAccountId, 'admin_grant', [
                'amount' => $amount,
                'ref' => $ref,
                'currency' => $currency,
                'to_account_id' => $toAccountId,
            ]);
            $this->entry($currency === Wallet::CASH ? $cash : $bank, $txId, $amount, 'admin_grant');

            return ['cash' => $cash->balance(), 'bank' => $bank->balance()];
        });
    }

    /** @return array{cash: int, bank: int, history: list<array{reason: string, delta: int, at: string, from: ?string, to: ?string}>} */
    public function summary(int $accountId): array
    {
        $bank = Wallet::query()
            ->where('owner_type', Wallet::OWNER_TYPE_ACCOUNT)
            ->where('owner_id', $accountId)
            ->where('currency', Wallet::BANK)
            ->first();
        $history = $bank === null ? [] : WalletLedgerEntry::query()
            ->leftJoin('transactions', 'transactions.tx_id', '=', 'wallet_ledger.tx_id')
            ->where('wallet_ledger.wallet_id', $bank->wallet_id)
            ->orderByDesc('wallet_ledger.entry_id')
            ->limit(self::HISTORY_SIZE)
            ->get(['wallet_ledger.reason', 'wallet_ledger.delta', 'wallet_ledger.created_at', 'transactions.meta_json'])
            ->map(function (WalletLedgerEntry $row): array {
                $meta = is_string($row->meta_json) ? json_decode($row->meta_json, true) : $row->meta_json;

                return [
                    'reason' => (string) $row->reason,
                    'delta' => (int) $row->delta,
                    'at' => $row->created_at->toIso8601String(),
                    'from' => $meta['from'] ?? null,
                    'to' => $meta['to'] ?? null,
                ];
            })
            ->all();
        $balances = $this->wallets->forAccountId($accountId);

        return ['cash' => $balances['cash'], 'bank' => $balances['coins'], 'history' => $history];
    }

    /** @return array{cash: int, bank: int} */
    private function move(int $accountId, int $amount, string $ref, string $fromCurrency, string $toCurrency, string $type, string $shortMessage): array
    {
        return DB::transaction(function () use ($accountId, $amount, $ref, $fromCurrency, $toCurrency, $type, $shortMessage): array {
            $cash = Wallet::lockForAccount($accountId, Wallet::CASH);
            $bank = Wallet::lockForAccount($accountId, Wallet::BANK);
            $this->refuseReplay($type, $ref);
            $from = $fromCurrency === Wallet::CASH ? $cash : $bank;
            $to = $toCurrency === Wallet::CASH ? $cash : $bank;
            if ($from->balance() < $amount) {
                throw new BankRejectedException('bank_insufficient_funds', $shortMessage);
            }
            $txId = $this->transaction($accountId, $type, ['amount' => $amount, 'ref' => $ref]);
            $this->entry($from, $txId, -$amount, $type);
            $this->entry($to, $txId, $amount, $type);

            return ['cash' => $cash->balance(), 'bank' => $bank->balance()];
        });
    }

    private function refuseReplay(string $type, string $ref): void
    {
        $alreadyDone = EconomyTransaction::query()
            ->where('type', $type)
            ->whereRaw("meta_json->>'ref' = ?", [$ref])
            ->exists();
        if ($alreadyDone) {
            throw new BankRejectedException('bank_already_done', 'This operation was already done.', 409);
        }
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
