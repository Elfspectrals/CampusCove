<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ShopCatalogItem extends Model
{
    protected $table = 'shop_catalog_items';

    protected $primaryKey = 'shop_catalog_item_id';

    public $timestamps = true;

    const CREATED_AT = 'created_at';

    const UPDATED_AT = 'updated_at';

    protected $fillable = [
        'public_id',
        'item_def_id',
        'currency',
        'price',
        'is_active',
        'is_unique_per_account',
        'stock_remaining',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
            'price' => 'integer',
            'is_active' => 'boolean',
            'is_unique_per_account' => 'boolean',
            'stock_remaining' => 'integer',
            'sort_order' => 'integer',
            'item_def_id' => 'integer',
        ];
    }

    public function itemDef(): BelongsTo
    {
        return $this->belongsTo(ItemDef::class, 'item_def_id', 'item_def_id');
    }

    public function purchases(): HasMany
    {
        return $this->hasMany(AccountShopPurchase::class, 'shop_catalog_item_id', 'shop_catalog_item_id');
    }

    public function getRouteKeyName(): string
    {
        return 'shop_catalog_item_id';
    }
}
