<?php

namespace App\Auth;

use App\Models\Account;
use Illuminate\Auth\EloquentUserProvider;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Contracts\Support\Arrayable;

class AccountUserProvider extends EloquentUserProvider
{
    /**
     * Retrieve a user by the given credentials (email + password).
     * Email is stored in account_auth_local, not on accounts.
     */
    public function retrieveByCredentials(array $credentials): ?Authenticatable
    {
        if (empty($credentials) ||
            (count($credentials) === 1 &&
             array_key_exists('password', $credentials))) {
            return null;
        }

        $query = Account::query()->whereHas('localAuth', function ($q) use ($credentials) {
            $email = $credentials['email'] ?? null;
            if ($email instanceof Arrayable) {
                $email = $email->toArray();
            }
            $q->where('email', $email);
        });

        return $query->with('localAuth', 'handle')->first();
    }
}
