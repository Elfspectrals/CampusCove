<?php

namespace App\Http\Controllers;

use App\Exceptions\ShopPurchaseRejectedException;
use App\Http\Resources\ShopCatalogItemResource;
use App\Http\Resources\ShopPurchaseResource;
use App\Models\Account;
use App\Models\ShopCatalogItem;
use App\Services\ShopPurchaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShopController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'currency' => 'nullable|string|in:coins,premium',
        ]);

        $query = ShopCatalogItem::query()
            ->with('itemDef')
            ->where('is_active', true)
            ->where('is_published', true)
            ->orderBy('sort_order')
            ->orderBy('shop_catalog_item_id');

        if (isset($validated['currency'])) {
            if ($validated['currency'] === 'coins') {
                $query->where('allow_coins', true);
            } else {
                $query->where('allow_premium', true);
            }
        }

        $items = $query->get();

        return response()->json([
            'items' => ShopCatalogItemResource::collection($items)->resolve(),
        ]);
    }

    public function purchase(Request $request, ShopPurchaseService $shopPurchaseService): JsonResponse
    {
        $validated = $request->validate([
            'shop_item_public_id' => 'required_without:shop_catalog_item_id|uuid',
            'shop_catalog_item_id' => 'required_without:shop_item_public_id|integer|min:1',
            'quantity' => 'integer|min:1|max:999',
            'currency' => 'nullable|string|in:coins,premium',
        ]);

        /** @var Account $account */
        $account = $request->user();

        $quantity = $validated['quantity'] ?? 1;

        $catalogRow = null;
        if (isset($validated['shop_item_public_id'])) {
            $catalogRow = ShopCatalogItem::query()
                ->where('public_id', $validated['shop_item_public_id'])
                ->first();
        } elseif (isset($validated['shop_catalog_item_id'])) {
            $catalogRow = ShopCatalogItem::query()
                ->where('shop_catalog_item_id', $validated['shop_catalog_item_id'])
                ->first();
        }

        if ($catalogRow === null) {
            throw new ShopPurchaseRejectedException('invalid_shop_item', 'Shop item not found.', 404);
        }

        $result = $shopPurchaseService->purchaseByCatalogPublicId(
            $account,
            (string) $catalogRow->public_id,
            $quantity,
            $validated['currency'] ?? null
        );

        $purchase = $result->purchase;
        $purchase->load(['shopCatalogItem.itemDef']);

        return response()->json([
            'purchase' => array_merge(
                (new ShopPurchaseResource($purchase))->toArray($request),
                ['balance_after' => $result->balanceAfter]
            ),
        ]);
    }
}
