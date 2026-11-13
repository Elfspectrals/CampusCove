<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CashDrop extends Model
{
    protected $table = 'cash_drops';

    public $timestamps = false;

    protected $fillable = [
        'owner_account_id',
        'killer_account_id',
        'amount',
        'drop_tx_id',
        'expires_at',
        'picked_by_account_id',
        'pickup_tx_id',
        'picked_at',
        'container_id',
    ];

    protected function casts(): array
    {
        return [
            'owner_account_id' => 'integer',
            'killer_account_id' => 'integer',
            'amount' => 'integer',
            'expires_at' => 'datetime',
            'picked_by_account_id' => 'integer',
            'picked_at' => 'datetime',
        ];
    }
}
