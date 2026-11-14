<?php

namespace App\Services;

use App\Exceptions\SportsRejectedException;
use App\Models\EconomyTransaction;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class SportsPassService
{
    public const PRICES = ['day' => 40, 'week' => 200];

    public const DURATION_HOURS = ['day' => 24, 'week' => 168];

    public const CAP_DAYS = 14;

    /** @return array{validUntil: string|null, prices: array{day: int, week: int}} */
    public function state(int $accountId): array
    {
        return $this->pass($this->validUntil($accountId));
    }

    /** @return array{pass: array{validUntil: string|null, prices: array{day: int, week: int}}, cash: int} */
    public function buy(int $accountId, string $kind, string $ref): array
    {
        return DB::transaction(function () use ($accountId, $kind, $ref): array {
            $cash = Wallet::lockForAccount($accountId, Wallet::CASH);
            $done = DB::table('sports_pass_purchases')->where('account_id', $accountId)->where('ref', $ref)->first();
            if ($done !== null) {
                return ['pass' => $this->pass(CarbonImmutable::parse($done->valid_until)), 'cash' => (int) $done->cash_after];
            }
            if (! array_key_exists($kind, self::PRICES)) {
                throw new SportsRejectedException('sports_pass_invalid_kind', 'A sports pass is a day or a week pass.');
            }
            $now = CarbonImmutable::now();
            $current = $this->validUntil($accountId);
            $start = $current !== null && $current->greaterThan($now) ? $current : $now;
            $end = $start->addHours(self::DURATION_HOURS[$kind]);
            if ($end->greaterThan($now->addDays(self::CAP_DAYS))) {
                throw new SportsRejectedException('sports_pass_cap', 'A sports pass cannot run more than '.self::CAP_DAYS.' days ahead.', 409);
            }
            $price = self::PRICES[$kind];
            $balance = $cash->balance();
            if ($balance < $price) {
                throw new SportsRejectedException('sports_pass_insufficient_cash', 'The '.$kind.' pass costs '.$price.' coins in cash.');
            }
            $tx = EconomyTransaction::query()->create([
                'server_id' => null,
                'type' => 'sports_pass',
                'status' => 'committed',
                'created_by_account_id' => $accountId,
                'committed_at' => $now,
                'meta_json' => ['kind' => $kind, 'amount' => $price, 'ref' => $ref],
            ]);
            WalletLedgerEntry::query()->create([
                'wallet_id' => $cash->wallet_id,
                'tx_id' => $tx->tx_id,
                'delta' => -$price,
                'reason' => 'sports_pass',
            ]);
            DB::table('sports_pass_purchases')->insert([
                'account_id' => $accountId,
                'ref' => $ref,
                'kind' => $kind,
                'tx_id' => $tx->tx_id,
                'valid_until' => $end,
                'cash_after' => $balance - $price,
            ]);

            return ['pass' => $this->pass($end), 'cash' => $balance - $price];
        });
    }

    private function validUntil(int $accountId): ?CarbonImmutable
    {
        $end = DB::table('sports_pass_purchases')->where('account_id', $accountId)->max('valid_until');

        return $end === null ? null : CarbonImmutable::parse($end);
    }

    /** @return array{validUntil: string|null, prices: array{day: int, week: int}} */
    private function pass(?CarbonImmutable $end): array
    {
        $valid = $end !== null && $end->isFuture();

        return ['validUntil' => $valid ? $end->toRfc3339String(true) : null, 'prices' => self::PRICES];
    }
}
