<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Credits new accounts with pocket money for food and a first outfit. It cannot be funnelled to another account:
 * TradeService refuses to let an account give anything before TradeService::MIN_GIVER_AGE_HOURS.
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
