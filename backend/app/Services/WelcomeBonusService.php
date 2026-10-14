<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Credits new accounts with enough coins to rent a first house (cheapest rent is 90).
 */
final class WelcomeBonusService
{
    public const AMOUNT = 300;

    private const REASON = 'welcome_bonus';

    public function __construct(
        private readonly CoinRewardService $coinRewards,
    ) {}

    public function grantOnce(int $accountId): void
    {
        DB::transaction(function () use ($accountId): void {
            // hasReceived locks the wallet, so concurrent calls cannot both pass the check
            if ($this->coinRewards->hasReceived($accountId, self::REASON)) {
                return;
            }
            $this->coinRewards->credit($accountId, self::REASON, self::AMOUNT);
        });
    }
}
