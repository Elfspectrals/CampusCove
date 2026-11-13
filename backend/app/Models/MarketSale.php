<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketSale extends Model
{
    protected $table = 'market_sales';

    public $timestamps = false;

    protected $fillable = [
        'lot_id',
        'buyer_account_id',
        'quantity',
        'unit_price',
        'total',
        'tax',
        'purchase_ref',
        'tx_id',
    ];

    protected function casts(): array
    {
        return [
            'lot_id' => 'integer',
            'buyer_account_id' => 'integer',
            'quantity' => 'integer',
            'unit_price' => 'integer',
            'total' => 'integer',
            'tax' => 'integer',
            'tx_id' => 'integer',
        ];
    }
}
