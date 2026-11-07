<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\AccountAuthLocal;
use App\Services\AccountRegistrationService;
use App\Services\SurvivalService;
use App\Services\TradeService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Artisan;
use RuntimeException;

/**
 * Two fixed local accounts for playtests (`make playtest-accounts`), instead of a new account per session.
 * Running it again resets them: admin, full outfit, 5,000 coins, full health / hunger / thirst, and old
 * enough to give in a trade. Never part of DatabaseSeeder and refused in production.
 */
class PlaytestAccountSeeder extends Seeder
{
    /** Local test password, valid only on a dev database. */
    public const PASSWORD = '4OwtTqSAvLDdGpIa';

    public const COINS = 5000;

    /** @var array<string, string> e-mail => username */
    public const ACCOUNTS = [
        'playtester1@campuscove.test' => 'playtester1',
        'playtester2@campuscove.test' => 'playtester2',
    ];

    public function __construct(
        private readonly AccountRegistrationService $registration,
        private readonly SurvivalService $survival,
    ) {
    }

    public function run(): void
    {
        if (app()->environment('production')) {
            throw new RuntimeException('Playtest accounts are for local databases only.');
        }

        foreach (self::ACCOUNTS as $email => $username) {
            $accountId = AccountAuthLocal::query()->where('email', $email)->value('account_id')
                ?? $this->registration->register($email, $username, self::PASSWORD)->account_id;

            Account::query()->whereKey($accountId)->update(['created_at' => now()->subHours(TradeService::MIN_GIVER_AGE_HOURS + 1)]);
            Artisan::call('setAdmin', ['email' => $email]);
            Artisan::call('fillOutfit', ['account' => (string) $accountId]);
            Artisan::call('setMoney', ['account' => (string) $accountId, 'currency' => 'coins', 'sum' => (string) self::COINS]);
            $this->survival->save((int) $accountId, SurvivalService::MAX, SurvivalService::MAX, SurvivalService::MAX);
        }
    }
}
