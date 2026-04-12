<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ItemDef extends Model
{
    protected $table = 'item_defs';

    protected $primaryKey = 'item_def_id';

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    protected $fillable = [
        'code',
        'name',
        'kind',
        'rarity',
        'tradable',
        'premium_only',
        'bind',
        'max_stack',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'tradable' => 'boolean',
            'premium_only' => 'boolean',
            'rarity' => 'integer',
            'max_stack' => 'integer',
        ];
    }

    public function shopCatalogItems(): HasMany
    {
        return $this->hasMany(ShopCatalogItem::class, 'item_def_id', 'item_def_id');
    }
}
