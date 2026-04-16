<?php

use App\Models\Account;
use App\Models\AccountAuthLocal;
use App\Models\EconomyTransaction;
use App\Models\Role;
use App\Models\ItemDef;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use App\Services\AccountCosmeticService;
use App\Services\StarterCosmeticGrantService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('setAdmin {email}', function () {
    $email = (string) $this->argument('email');
    $normalizedEmail = trim($email);
    if ($normalizedEmail === '') {
        $this->error('Email is required.');

        return 1;
    }

    $auth = AccountAuthLocal::query()
        ->where('email', $normalizedEmail)
        ->first();

    if (! $auth) {
        $this->error("Account with email '{$normalizedEmail}' was not found.");

        return 1;
    }

    $role = Role::query()->firstOrCreate(['name' => Role::NAME_ADMIN]);
    DB::table('account_roles')->insertOrIgnore([
        'account_id' => $auth->account_id,
        'role_id' => $role->role_id,
        'created_at' => now(),
    ]);
    Account::query()
        ->where('account_id', $auth->account_id)
        ->update(['is_admin' => true]);

    $this->info("Admin access ensured for account_id={$auth->account_id} ({$normalizedEmail}): role + is_admin=true.");

    return 0;
})->purpose('Grant admin access to account by email (role + is_admin)');

Artisan::command('setMoney {account} {currency} {sum}', function () {
    $account = (string) $this->argument('account');
    $currency = (string) $this->argument('currency');
    $sum = (string) $this->argument('sum');
    $identifier = trim($account);
    if ($identifier === '') {
        $this->error('Account identifier is required.');

        return 1;
    }

    $normalizedCurrency = mb_strtolower(trim($currency));
    if (! in_array($normalizedCurrency, ['coins', 'premium'], true)) {
        $this->error("Invalid currency '{$currency}'. Use 'coins' or 'premium'.");

        return 1;
    }

    if (! preg_match('/^\d+$/', trim($sum))) {
        $this->error('Sum must be a non-negative integer.');

        return 1;
    }
    $targetBalance = (int) $sum;

    $accountModel = null;
    if (preg_match('/^\d+$/', $identifier)) {
        $accountModel = Account::query()->where('account_id', (int) $identifier)->first();
    } else {
        $auth = AccountAuthLocal::query()
            ->where('email', $identifier)
            ->first();
        if ($auth) {
            $accountModel = Account::query()->where('account_id', $auth->account_id)->first();
        }
    }

    if (! $accountModel) {
        $this->error("Account '{$identifier}' was not found. Use account_id or email.");

        return 1;
    }

    DB::transaction(function () use ($accountModel, $normalizedCurrency, $targetBalance): void {
        $wallet = Wallet::query()
            ->where('owner_type', Wallet::OWNER_TYPE_ACCOUNT)
            ->where('owner_id', $accountModel->account_id)
            ->where('currency', $normalizedCurrency)
            ->lockForUpdate()
            ->first();

        if (! $wallet) {
            Wallet::query()->create([
                'owner_type' => Wallet::OWNER_TYPE_ACCOUNT,
                'owner_id' => $accountModel->account_id,
                'currency' => $normalizedCurrency,
            ]);
            $wallet = Wallet::query()
                ->where('owner_type', Wallet::OWNER_TYPE_ACCOUNT)
                ->where('owner_id', $accountModel->account_id)
                ->where('currency', $normalizedCurrency)
                ->lockForUpdate()
                ->firstOrFail();
        }

        $currentBalance = (int) WalletLedgerEntry::query()
            ->where('wallet_id', $wallet->wallet_id)
            ->sum('delta');

        $delta = $targetBalance - $currentBalance;
        if ($delta === 0) {
            return;
        }

        $tx = EconomyTransaction::query()->create([
            'server_id' => null,
            'type' => 'admin_adjust',
            'status' => 'committed',
            'created_by_account_id' => null,
            'committed_at' => now(),
            'meta_json' => [
                'operation' => 'set_money',
                'account_id' => $accountModel->account_id,
                'currency' => $normalizedCurrency,
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
    });

    $finalBalance = (int) WalletLedgerEntry::query()
        ->whereIn('wallet_id', function ($query) use ($accountModel, $normalizedCurrency): void {
            $query->select('wallet_id')
                ->from('wallets')
                ->where('owner_type', Wallet::OWNER_TYPE_ACCOUNT)
                ->where('owner_id', $accountModel->account_id)
                ->where('currency', $normalizedCurrency)
                ->limit(1);
        })
        ->sum('delta');

    $this->info("Balance set: account_id={$accountModel->account_id}, currency={$normalizedCurrency}, balance={$finalBalance}.");

    return 0;
})->purpose('Set account balance to an absolute value (account_id or email)');

Artisan::command('fillOutfit {account}', function () {
    $raw = (string) $this->argument('account');
    $identifier = trim($raw);
    if ($identifier === '') {
        $this->error('Account identifier is required (account_id or email).');

        return 1;
    }

    $accountModel = null;
    if (preg_match('/^\d+$/', $identifier)) {
        $accountModel = Account::query()->where('account_id', (int) $identifier)->first();
    } else {
        $auth = AccountAuthLocal::query()
            ->where('email', $identifier)
            ->first();
        if ($auth) {
            $accountModel = Account::query()->where('account_id', $auth->account_id)->first();
        }
    }

    if (! $accountModel) {
        $this->error("Account '{$identifier}' was not found. Use account_id or email.");

        return 1;
    }

    $accountId = (int) $accountModel->account_id;

    $missingCodes = [];
    foreach (StarterCosmeticGrantService::STARTER_CODES as $code) {
        if (! ItemDef::query()->where('code', $code)->exists()) {
            $missingCodes[] = $code;
        }
    }
    if ($missingCodes !== []) {
        $this->error('Wearable item definitions are missing. Seed the shop first, e.g.:');
        $this->line('  docker compose exec -T backend php artisan db:seed --class=ShopSeeder');

        return 1;
    }

    $grant = app(StarterCosmeticGrantService::class);
    $cosmetic = app(AccountCosmeticService::class);

    try {
        DB::transaction(function () use ($grant, $cosmetic, $accountId): void {
            $grant->ensureStarterCosmeticsForAccount($accountId);
            $cosmetic->equipDefaultStarterLook($accountId);
        });
    } catch (\InvalidArgumentException $e) {
        $this->error('Could not equip outfit: '.$e->getMessage());

        return 1;
    }

    $this->info("Locker filled for account_id={$accountId}: starter wearables in inventory + default outfit equipped.");

    return 0;
})->purpose('Grant starter wearable stacks and equip the default Campus outfit (account_id or email)');
