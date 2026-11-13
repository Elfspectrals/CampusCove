<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StorageLot extends Model
{
    protected $table = 'storage_lots';

    public $timestamps = false;

    protected $fillable = [
        'source',
        'container_id',
        'former_owner_account_id',
        'housing_unit_id',
        'shop_value',
        'opening_bid',
        'nights_listed',
        'status',
        'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'container_id' => 'integer',
            'former_owner_account_id' => 'integer',
            'housing_unit_id' => 'integer',
            'shop_value' => 'integer',
            'opening_bid' => 'integer',
            'nights_listed' => 'integer',
            'created_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }
}
