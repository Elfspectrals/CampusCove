<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccountShopPurchase extends Model
{
    protected $table = 'account_shop_purchases';

    protected $primaryKey = 'purchase_id';

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    protected $fillable = [
        'account_id',
        'shop_catalog_item_id',
        'tx_id',
        'quantity',
        'unit_price',
        'total_debit',
        'currency',
        'is_unique_at_purchase',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'account_id' => 'integer',
            'shop_catalog_item_id' => 'integer',
            'tx_id' => 'integer',
            'quantity' => 'integer',
            'unit_price' => 'integer',
            'total_debit' => 'integer',
            'is_unique_at_purchase' => 'boolean',
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'account_id', 'account_id');
    }

    public function shopCatalogItem(): BelongsTo
    {
        return $this->belongsTo(ShopCatalogItem::class, 'shop_catalog_item_id', 'shop_catalog_item_id');
    }

    public function economyTransaction(): BelongsTo
    {
        return $this->belongsTo(EconomyTransaction::class, 'tx_id', 'tx_id');
    }
}
