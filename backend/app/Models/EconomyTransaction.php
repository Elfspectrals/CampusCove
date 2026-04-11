<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EconomyTransaction extends Model
{
    protected $table = 'transactions';

    protected $primaryKey = 'tx_id';

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    protected $fillable = [
        'server_id',
        'type',
        'status',
        'created_by_account_id',
        'committed_at',
        'meta_json',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'committed_at' => 'datetime',
            'meta_json' => 'array',
            'server_id' => 'integer',
            'created_by_account_id' => 'integer',
        ];
    }

    public function createdByAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'created_by_account_id', 'account_id');
    }
}
