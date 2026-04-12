<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ItemInstance extends Model
{
    protected $table = 'item_instances';

    protected $primaryKey = 'item_instance_id';

    public $timestamps = true;

    const CREATED_AT = 'created_at';

    const UPDATED_AT = 'updated_at';

    protected $fillable = [
        'item_def_id',
        'owner_account_id',
        'owner_character_id',
        'container_id',
        'locked_tx_id',
        'lock_expires_at',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
            'item_def_id' => 'integer',
            'owner_account_id' => 'integer',
            'owner_character_id' => 'integer',
            'container_id' => 'integer',
            'locked_tx_id' => 'integer',
            'lock_expires_at' => 'datetime',
        ];
    }

    public function itemDef(): BelongsTo
    {
        return $this->belongsTo(ItemDef::class, 'item_def_id', 'item_def_id');
    }
}
