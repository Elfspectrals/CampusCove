<?php

namespace App\Services;

use App\Models\AccountShopPurchase;

final readonly class ShopPurchaseResult
{
    public function __construct(
        public AccountShopPurchase $purchase,
        public int $balanceAfter,
    ) {}
}
