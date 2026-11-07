<?php

namespace App\Services;

use App\Http\Controllers\AuthController;
use App\Models\Account;
use App\Models\AccountAuthLocal;
use App\Models\AccountHandle;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Creates a local account the way sign-up does: account, handle with a random tag, e-mail login, starter
 * cosmetics and the welcome bonus. Input is already validated (username cleaned and free).
 */
class AccountRegistrationService
{
    public function __construct(
        private readonly StarterCosmeticGrantService $starterCosmetics,
        private readonly WelcomeBonusService $welcomeBonus,
    ) {
    }

    public function register(string $email, string $username, string $password): Account
    {
        $accountId = DB::transaction(function () use ($email, $username, $password): int {
            Account::create([
                'status' => 'active',
                'terms_version' => AuthController::TERMS_VERSION,
                'terms_accepted_at' => now(),
                'age_confirmed_at' => now(),
            ]);
            // PostgreSQL IDENTITY: Eloquent may not set account_id on the model, so fetch it
            $accountId = (int) Account::orderByDesc('account_id')->value('account_id');
            AccountHandle::create([
                'account_id' => $accountId,
                'username' => $username,
                'tag' => random_int(0, 9999),
                'normalized' => mb_strtolower($username),
            ]);
            AccountAuthLocal::create([
                'account_id' => $accountId,
                'email' => $email,
                'password_hash' => Hash::make($password),
                'email_verified' => false,
            ]);

            return $accountId;
        });

        $this->starterCosmetics->ensureStarterCosmeticsForAccount($accountId);
        $this->welcomeBonus->grantOnce($accountId);

        return Account::with('handle', 'localAuth')->findOrFail($accountId);
    }
}
