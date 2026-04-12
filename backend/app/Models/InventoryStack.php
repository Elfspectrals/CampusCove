<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryStack extends Model
{
    protected $table = 'inventory_stacks';

    protected $primaryKey = 'stack_id';

    public $timestamps = true;

    const CREATED_AT = 'created_at';

    const UPDATED_AT = 'updated_at';

    protected $fillable = [
        'item_def_id',
        'container_id',
        'quantity',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
            'item_def_id' => 'integer',
            'container_id' => 'integer',
            'quantity' => 'integer',
        ];
    }

    public function itemDef(): BelongsTo
    {
        return $this->belongsTo(ItemDef::class, 'item_def_id', 'item_def_id');
    }
}
