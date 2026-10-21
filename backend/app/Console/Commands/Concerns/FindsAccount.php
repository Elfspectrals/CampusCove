<?php

namespace App\Console\Commands\Concerns;

use App\Models\Account;
use App\Models\AccountAuthLocal;

trait FindsAccount
{
    /** Account by numeric account_id or by login email; prints an error and returns null when not found. */
    protected function findAccount(string $identifier): ?Account
    {
        $identifier = trim($identifier);
        if ($identifier === '') {
            $this->error('Account identifier is required (account_id or email).');

            return null;
        }

        $accountId = preg_match('/^\d+$/', $identifier)
            ? (int) $identifier
            : AccountAuthLocal::query()->where('email', $identifier)->value('account_id');

        $account = $accountId !== null ? Account::query()->find($accountId) : null;
        if (! $account) {
            $this->error("Account '{$identifier}' was not found. Use account_id or email.");
        }

        return $account;
    }
}
