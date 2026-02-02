<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccountAuthLocal extends Model
{
    protected $table = 'account_auth_local';

    protected $primaryKey = 'account_id';

    public $incrementing = false;

    public $timestamps = false;

    const CREATED_AT = 'created_at';
    const UPDATED_AT = 'updated_at';

    protected $fillable = ['account_id', 'email', 'password_hash', 'email_verified'];

    protected $hidden = ['password_hash'];

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'account_id', 'account_id');
    }
}
