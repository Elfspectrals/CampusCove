<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AccountInventoryLayout extends Model
{
    protected $table = 'account_inventory_layout';

    protected $primaryKey = 'account_id';

    public $incrementing = false;

    protected $keyType = 'int';

    protected $fillable = [
        'account_id',
        'slots',
        'selected_hotbar_index',
    ];

    protected function casts(): array
    {
        return [
            'slots' => 'array',
            'selected_hotbar_index' => 'integer',
        ];
    }
}
