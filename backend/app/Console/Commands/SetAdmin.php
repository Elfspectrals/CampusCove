<?php

namespace App\Console\Commands;

use App\Models\Account;
use App\Models\AccountAuthLocal;
use App\Models\Role;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SetAdmin extends Command
{
    protected $signature = 'setAdmin {email}';

    protected $description = 'Grant admin access to account by email (role + is_admin)';

    public function handle(): int
    {
        $email = trim((string) $this->argument('email'));
        if ($email === '') {
            $this->error('Email is required.');

            return self::FAILURE;
        }

        $accountId = AccountAuthLocal::query()->where('email', $email)->value('account_id');
        if ($accountId === null) {
            $this->error("Account with email '{$email}' was not found.");

            return self::FAILURE;
        }

        $role = Role::query()->firstOrCreate(['name' => Role::NAME_ADMIN]);
        DB::table('account_roles')->insertOrIgnore([
            'account_id' => $accountId,
            'role_id' => $role->role_id,
            'created_at' => now(),
        ]);
        Account::query()->where('account_id', $accountId)->update(['is_admin' => true]);

        $this->info("Admin access ensured for account_id={$accountId} ({$email}): role + is_admin=true.");

        return self::SUCCESS;
    }
}
