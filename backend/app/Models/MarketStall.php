<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MarketStall extends Model
{
    protected $table = 'market_stalls';

    public $timestamps = false;

    protected $fillable = [
        'market_date',
        'stall_no',
        'account_id',
        'canopy',
        'fee_tx_id',
    ];

    protected function casts(): array
    {
        return [
            'stall_no' => 'integer',
            'account_id' => 'integer',
            'fee_tx_id' => 'integer',
        ];
    }

    public function lots(): HasMany
    {
        return $this->hasMany(MarketLot::class, 'stall_id');
    }
}
