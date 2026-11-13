<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketLot extends Model
{
    public const ACTIVE = 'active';

    public const SOLD_OUT = 'sold_out';

    public const WITHDRAWN = 'withdrawn';

    public const RETURNED = 'returned';

    protected $table = 'market_lots';

    public $timestamps = false;

    protected $fillable = [
        'stall_id',
        'slot',
        'item_def_id',
        'quantity_listed',
        'quantity_left',
        'unit_price',
        'status',
        'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'stall_id' => 'integer',
            'slot' => 'integer',
            'item_def_id' => 'integer',
            'quantity_listed' => 'integer',
            'quantity_left' => 'integer',
            'unit_price' => 'integer',
            'closed_at' => 'datetime',
        ];
    }

    public function stall(): BelongsTo
    {
        return $this->belongsTo(MarketStall::class, 'stall_id');
    }

    public function itemDef(): BelongsTo
    {
        return $this->belongsTo(ItemDef::class, 'item_def_id', 'item_def_id');
    }
}
