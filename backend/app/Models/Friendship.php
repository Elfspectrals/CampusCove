<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Friendship extends Model
{
    protected $table = 'friendships';

    public $incrementing = false;

    public $timestamps = false;

    const CREATED_AT = 'created_at';
    const UPDATED_AT = 'updated_at';

    protected $fillable = ['account_id_a', 'account_id_b', 'status', 'requested_by', 'created_at', 'updated_at'];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function accountA(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'account_id_a', 'account_id');
    }

    public function accountB(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'account_id_b', 'account_id');
    }

    public function requestedByAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'requested_by', 'account_id');
    }

    /** Get the other account_id in the pair (given current user id). */
    public function otherAccountId(int $myAccountId): int
    {
        return $this->account_id_a === $myAccountId ? $this->account_id_b : $this->account_id_a;
    }
}
