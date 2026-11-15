<?php

namespace App\Services;

use App\Exceptions\SportsRejectedException;
use App\Models\EconomyTransaction;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class SportsGearRentalService
{
    public const PRICES = [
        'gear_swimsuit' => 15,
        'gear_boxing_gloves' => 25,
        'gear_boules' => 25,
        'gear_tennis_racket' => 30,
        'gear_running_spikes' => 40,
        'gear_ice_skates' => 40,
    ];

    public function __construct(private readonly SportsGearService $gear) {}

    /** @return array{code: string, price: int, cash: int} */
    public function rent(int $accountId, string $code, string $ref): array
    {
        return DB::transaction(function () use ($accountId, $code, $ref): array {
            $cash = Wallet::lockForAccount($accountId, Wallet::CASH);
            $done = DB::table('sports_gear_rentals')->where('account_id', $accountId)->where('ref', $ref)->first();
            if ($done !== null) {
                return ['code' => (string) $done->code, 'price' => (int) $done->price, 'cash' => (int) $done->cash_after];
            }
            if (! array_key_exists($code, self::PRICES)) {
                throw new SportsRejectedException('sports_rent_invalid_gear', 'This gear is not lent.');
            }
            if (in_array($code, $this->gear->owned($accountId), true)) {
                throw new SportsRejectedException('sports_rent_owned', 'You already own this gear.', 409);
            }
            $price = self::PRICES[$code];
            $balance = $cash->balance();
            if ($balance < $price) {
                throw new SportsRejectedException('sports_rent_insufficient_cash', 'Lending this gear costs '.$price.' coins in cash.');
            }
            $tx = EconomyTransaction::query()->create([
                'server_id' => null,
                'type' => 'sports_gear_rental',
                'status' => 'committed',
                'created_by_account_id' => $accountId,
                'committed_at' => CarbonImmutable::now(),
                'meta_json' => ['code' => $code, 'amount' => $price, 'ref' => $ref],
            ]);
            WalletLedgerEntry::query()->create([
                'wallet_id' => $cash->wallet_id,
                'tx_id' => $tx->tx_id,
                'delta' => -$price,
                'reason' => 'sports_gear_rental',
            ]);
            DB::table('sports_gear_rentals')->insert([
                'account_id' => $accountId,
                'ref' => $ref,
                'code' => $code,
                'tx_id' => $tx->tx_id,
                'price' => $price,
                'cash_after' => $balance - $price,
            ]);

            return ['code' => $code, 'price' => $price, 'cash' => $balance - $price];
        });
    }
}
