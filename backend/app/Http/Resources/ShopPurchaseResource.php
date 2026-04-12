<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin \App\Models\AccountShopPurchase
 */
class ShopPurchaseResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'purchase_id' => $this->purchase_id,
            'quantity' => $this->quantity,
            'unit_price' => $this->unit_price,
            'total_debit' => $this->total_debit,
            'currency' => $this->currency,
            'tx_id' => $this->tx_id,
            'shop_item' => ShopCatalogItemResource::make($this->whenLoaded('shopCatalogItem')),
        ];
    }
}
