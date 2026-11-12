<?php

namespace App\Http\Requests;

use App\Services\ShopPurchaseService;
use Illuminate\Foundation\Http\FormRequest;

/**
 * A basket paid to a cashier (`POST /shop/checkout`, `POST /zone/checkout`): one line per item with its quantity,
 * and a checkout key the client keeps for retries of the same payment. Contract in docs/SHOP_CART.md.
 */
class ShopCheckoutRequest extends FormRequest
{
    public const MAX_LINES = 50;

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'checkout_key' => 'required|uuid',
            'items' => 'required|array|min:1|max:'.self::MAX_LINES,
            'items.*.shop_catalog_item_id' => 'required|integer|min:1|distinct',
            'items.*.quantity' => 'required|integer|min:1|max:'.ShopPurchaseService::MAX_LINE_QUANTITY,
        ];
    }

    /** @return array<int, int> shop_catalog_item_id => quantity */
    public function quantities(): array
    {
        $quantities = [];
        foreach ($this->validated('items') as $line) {
            $quantities[(int) $line['shop_catalog_item_id']] = (int) $line['quantity'];
        }

        return $quantities;
    }

    public function checkoutKey(): string
    {
        return strtolower((string) $this->validated('checkout_key'));
    }
}
