<?php

namespace App\Models;

use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Laravel\Sanctum\HasApiTokens;

class Account extends Model implements AuthenticatableContract
{
    use HasApiTokens;

    protected $table = 'accounts';

    protected $primaryKey = 'account_id';

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    protected $fillable = ['status'];

    protected $hidden = [];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'last_login_at' => 'datetime',
        ];
    }

    public function handle(): HasOne
    {
        return $this->hasOne(AccountHandle::class, 'account_id', 'account_id');
    }

    public function localAuth(): HasOne
    {
        return $this->hasOne(AccountAuthLocal::class, 'account_id', 'account_id');
    }

    // AuthenticatableContract

    public function getAuthIdentifierName(): string
    {
        return 'account_id';
    }

    public function getAuthIdentifier(): int
    {
        return $this->account_id;
    }

    public function getAuthPassword(): string
    {
        $auth = $this->relationLoaded('localAuth') ? $this->localAuth : $this->localAuth()->first();
        return $auth ? $auth->password_hash : '';
    }

    public function getAuthPasswordName(): string
    {
        return 'password_hash';
    }

    public function getRememberToken(): ?string
    {
        return null;
    }

    public function setRememberToken($value): void
    {
    }

    public function getRememberTokenName(): ?string
    {
        return null;
    }
}
