<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccountHandle extends Model
{
    protected $table = 'account_handles';

    protected $primaryKey = 'account_id';

    public $incrementing = false;

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    protected $fillable = ['account_id', 'username', 'tag', 'normalized'];

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'account_id', 'account_id');
    }

    /** Display name: username#tag (e.g. John#0420) */
    public function getDisplayNameAttribute(): string
    {
        return $this->username . '#' . str_pad((string) $this->tag, 4, '0', STR_PAD_LEFT);
    }
}
