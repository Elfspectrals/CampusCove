<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class IpBan extends Model
{
    public const REASON_AUTO = 'auto';

    public const REASON_MANUAL = 'manual';

    const UPDATED_AT = null;

    protected $table = 'ip_bans';

    protected $fillable = [
        'ip',
        'reason',
        'score',
        'banned_by_account_id',
        'expires_at',
        'lifted_at',
        'lifted_by_account_id',
    ];

    protected function casts(): array
    {
        return [
            'score' => 'integer',
            'banned_by_account_id' => 'integer',
            'lifted_by_account_id' => 'integer',
            'expires_at' => 'datetime',
            'lifted_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereNull('lifted_at')
            ->where(fn (Builder $q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()));
    }
}
