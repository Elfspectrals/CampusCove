<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin \App\Models\ShopCatalogItem
 */
class ShopCatalogItemResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'shop_catalog_item_id' => $this->shop_catalog_item_id,
            'public_id' => $this->public_id,
            'currency' => $this->currency,
            'price' => $this->price,
            'allow_coins' => $this->allow_coins,
            'coins_price' => $this->coins_price,
            'allow_premium' => $this->allow_premium,
            'premium_price' => $this->premium_price,
            'is_active' => $this->is_active,
            'is_published' => $this->is_published,
            'is_unique_per_account' => $this->is_unique_per_account,
            'stock_remaining' => $this->stock_remaining,
            'sort_order' => $this->sort_order,
            'item' => ItemDefResource::make($this->whenLoaded('itemDef')),
        ];
    }
}
