<?php

namespace App\Services;

use App\Exceptions\JailRejectedException;
use App\Models\EconomyTransaction;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use Illuminate\Support\Facades\DB;

final class JailService
{
    public const FINE_PER_STAR = 100;

    public const MAX_FINE = 500;

    public const TAX_PER_STAR = 50;

    public const MAX_TAX = 250;

    public const MAX_SENTENCE_MS = 600_000;

    public const OFFICER_HOLD_MS = 900_000;

    public const KIND_NPC = 'npc';

    public const KIND_OFFICER = 'officer';

    public function __construct(private readonly SurvivalService $survival) {}

    public static function fine(int $stars): int
    {
        return min(self::MAX_FINE, $stars * self::FINE_PER_STAR);
    }

    public static function tax(int $stars): int
    {
        return min(self::MAX_TAX, $stars * self::TAX_PER_STAR);
    }

    /** @return array{kind: ?string, stars: int, ms_left: int} */
    public function sentence(int $accountId): array
    {
        $row = DB::table('account_wanted_levels')->where('account_id', $accountId)->first();

        return [
            'kind' => $row?->jail_kind,
            'stars' => $row !== null ? (int) $row->jail_stars : 0,
            'ms_left' => $row !== null ? (int) $row->jail_ms : 0,
        ];
    }

    /** @return array{kind: ?string, stars: int, ms_left: int} */
    public function save(int $accountId, ?string $kind, int $stars, int $msLeft): array
    {
        $updated = ['jail_stars', 'jail_ms', 'jail_kind', 'updated_at'];
        DB::table('account_wanted_levels')->upsert(
            [[
                'account_id' => $accountId,
                'stars' => 0,
                'decay_ms' => WantedService::DECAY_MS,
                'jail_stars' => $stars,
                'jail_ms' => $msLeft,
                'jail_kind' => $kind,
                'jail_billed' => false,
                'updated_at' => now(),
            ]],
            ['account_id'],
            $kind === self::KIND_NPC ? $updated : [...$updated, 'jail_billed'],
        );

        return ['kind' => $kind, 'stars' => $stars, 'ms_left' => $msLeft];
    }

    /** @return array{fine: int, bank: int, cash: int} */
    public function payFine(int $accountId, int $stars): array
    {
        return DB::transaction(function () use ($accountId, $stars): array {
            $row = DB::table('account_wanted_levels')->where('account_id', $accountId)->lockForUpdate()->first();
            if ($row?->jail_kind === self::KIND_OFFICER) {
                throw new JailRejectedException('jail_held_by_officer', 'An officer holds you here: there is no fine to pay.', 409);
            }
            $jailStars = $row !== null ? (int) $row->jail_stars : 0;
            if ($jailStars === 0) {
                throw new JailRejectedException('not_in_jail', 'You are not in a cell.', 409);
            }
            if ($jailStars !== $stars) {
                throw new JailRejectedException('jail_mismatch', 'Your sentence changed. Try again.', 409);
            }
            $fine = self::fine($jailStars);
            $cash = Wallet::lockForAccount($accountId, Wallet::CASH);
            $bank = Wallet::lockForAccount($accountId, Wallet::BANK);
            $bankBalance = max(0, $bank->balance());
            $cashBalance = max(0, $cash->balance());
            if ($bankBalance + $cashBalance < $fine) {
                throw new JailRejectedException('jail_insufficient_funds', "The fine is {$fine} coins and you do not have enough in the bank and on you.");
            }
            $fromBank = min($bankBalance, $fine);
            $fromCash = $fine - $fromBank;
            $tx = EconomyTransaction::query()->create([
                'server_id' => null,
                'type' => 'jail_fine',
                'status' => 'committed',
                'created_by_account_id' => $accountId,
                'committed_at' => now(),
                'meta_json' => ['amount' => $fine, 'stars' => $jailStars, 'bank' => $fromBank, 'cash' => $fromCash],
            ]);
            foreach ([[$bank, $fromBank], [$cash, $fromCash]] as [$wallet, $amount]) {
                if ($amount > 0) {
                    WalletLedgerEntry::query()->create([
                        'wallet_id' => $wallet->wallet_id,
                        'tx_id' => $tx->tx_id,
                        'delta' => -$amount,
                        'reason' => 'jail_fine',
                    ]);
                }
            }
            DB::table('account_wanted_levels')->where('account_id', $accountId)->update(['jail_stars' => 0, 'jail_ms' => 0, 'jail_kind' => null, 'jail_billed' => false, 'updated_at' => now()]);

            return ['fine' => $fine, 'bank' => $bank->balance(), 'cash' => $cash->balance()];
        });
    }

    /** @return array{billed: int, jail_tax: int, balance_after: ?int} */
    public function billDeathInCell(int $accountId, int $stars): array
    {
        return DB::transaction(function () use ($accountId, $stars): array {
            $row = DB::table('account_wanted_levels')->where('account_id', $accountId)->lockForUpdate()->first();
            if ($row?->jail_kind === null || (int) $row->jail_stars !== $stars) {
                throw new JailRejectedException('jail_mismatch', 'Your sentence changed. Try again.', 409);
            }
            if ($row->jail_kind === self::KIND_OFFICER || $row->jail_billed) {
                return ['billed' => 0, 'jail_tax' => 0, 'balance_after' => null];
            }
            $hospital = $this->survival->billHospital($accountId);
            $tax = $this->takeTax($accountId, $stars);
            DB::table('account_wanted_levels')->where('account_id', $accountId)->update(['jail_billed' => true, 'updated_at' => now()]);

            return ['billed' => $hospital['billed'], 'jail_tax' => $tax, 'balance_after' => Wallet::lockForAccount($accountId, Wallet::BANK)->balance()];
        });
    }

    private function takeTax(int $accountId, int $stars): int
    {
        $bank = Wallet::lockForAccount($accountId, Wallet::BANK);
        $cash = Wallet::lockForAccount($accountId, Wallet::CASH);
        $fromBank = min(max(0, $bank->balance()), self::tax($stars));
        $fromCash = min(max(0, $cash->balance()), self::tax($stars) - $fromBank);
        $tax = $fromBank + $fromCash;
        if ($tax === 0) {
            return 0;
        }
        $tx = EconomyTransaction::query()->create([
            'server_id' => null,
            'type' => 'jail_tax',
            'status' => 'committed',
            'created_by_account_id' => $accountId,
            'committed_at' => now(),
            'meta_json' => ['amount' => $tax, 'stars' => $stars, 'bank' => $fromBank, 'cash' => $fromCash],
        ]);
        foreach ([[$bank, $fromBank], [$cash, $fromCash]] as [$wallet, $amount]) {
            if ($amount > 0) {
                WalletLedgerEntry::query()->create([
                    'wallet_id' => $wallet->wallet_id,
                    'tx_id' => $tx->tx_id,
                    'delta' => -$amount,
                    'reason' => 'jail_tax',
                ]);
            }
        }

        return $tax;
    }
}
