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
        'cosmetic_slot',
        'preview_image',
        'model_glb',
        'portions',
        'hunger_per_portion',
        'thirst_per_portion',
        'health_per_portion',
        'alcohol_per_portion',
        'consume_effect',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'tradable' => 'boolean',
            'premium_only' => 'boolean',
            'rarity' => 'integer',
            'max_stack' => 'integer',
            'portions' => 'integer',
            'hunger_per_portion' => 'integer',
            'thirst_per_portion' => 'integer',
            'health_per_portion' => 'integer',
            'alcohol_per_portion' => 'integer',
        ];
    }

    public function shopCatalogItems(): HasMany
    {
        return $this->hasMany(ShopCatalogItem::class, 'item_def_id', 'item_def_id');
    }
}
