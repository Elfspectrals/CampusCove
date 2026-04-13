<?php

namespace App\Http\Controllers;

use App\Http\Resources\ShopCatalogItemResource;
use App\Models\ItemDef;
use App\Models\ShopCatalogItem;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminShopItemController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:200'],
            'currency' => ['nullable', 'string', 'in:coins,premium'],
            'is_active' => ['nullable', 'boolean'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = ShopCatalogItem::query()
            ->with('itemDef')
            ->orderBy('sort_order')
            ->orderBy('shop_catalog_item_id');

        if (! empty($validated['q'])) {
            $term = $validated['q'];
            $pattern = '%'.$this->escapeLikePattern($term).'%';
            $query->whereHas('itemDef', function ($q) use ($pattern) {
                $q->where('name', 'ilike', $pattern)
                    ->orWhere('code', 'ilike', $pattern);
            });
        }

        if (isset($validated['currency'])) {
            $query->where('currency', $validated['currency']);
        }

        if (array_key_exists('is_active', $validated)) {
            $query->where('is_active', $validated['is_active']);
        }

        $perPage = $validated['per_page'] ?? 20;

        return ShopCatalogItemResource::collection(
            $query->paginate($perPage)->withQueryString()
        )->response();
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:128', 'regex:/^[a-z0-9_]+$/', 'unique:item_defs,code'],
            'name' => ['required', 'string', 'max:200'],
            'kind' => ['required', 'string', 'in:furniture,cosmetic,consumable,misc'],
            'rarity' => ['nullable', 'integer', 'min:0', 'max:32767'],
            'tradable' => ['nullable', 'boolean'],
            'premium_only' => ['nullable', 'boolean'],
            'bind' => ['nullable', 'string', 'in:none,bind_on_equip,bind_on_place,bound'],
            'max_stack' => ['nullable', 'integer', 'min:1'],
            'cosmetic_slot' => ['nullable', 'string', 'in:body,hair,top,bottom,shoes,head_accessory'],
            'preview_image' => ['nullable', 'string', 'max:2048'],
            'model_glb' => ['nullable', 'string', 'max:2048'],
            'prices' => ['required', 'array'],
            'prices.coins' => ['nullable', 'integer', 'min:1'],
            'prices.premium' => ['nullable', 'integer', 'min:1'],
            'is_active' => ['nullable', 'boolean'],
            'is_unique_per_account' => ['nullable', 'boolean'],
            'stock_remaining' => ['nullable', 'integer', 'min:0'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $prices = $validated['prices'];
        if (empty($prices['coins']) && empty($prices['premium'])) {
            throw ValidationException::withMessages([
                'prices' => ['At least one of prices.coins or prices.premium must be set.'],
            ]);
        }

        $rows = [];
        DB::transaction(function () use ($validated, $prices, &$rows) {
            $def = ItemDef::query()->create([
                'code' => $validated['code'],
                'name' => $validated['name'],
                'kind' => $validated['kind'],
                'rarity' => $validated['rarity'] ?? 0,
                'tradable' => $validated['tradable'] ?? true,
                'premium_only' => $validated['premium_only'] ?? false,
                'bind' => $validated['bind'] ?? 'none',
                'max_stack' => $validated['max_stack'] ?? 1,
                'cosmetic_slot' => $validated['cosmetic_slot'] ?? null,
                'preview_image' => $validated['preview_image'] ?? null,
                'model_glb' => $validated['model_glb'] ?? null,
            ]);

            $base = [
                'item_def_id' => $def->item_def_id,
                'is_active' => $validated['is_active'] ?? true,
                'is_unique_per_account' => $validated['is_unique_per_account'] ?? false,
                'stock_remaining' => $validated['stock_remaining'] ?? null,
                'sort_order' => $validated['sort_order'] ?? 0,
            ];

            if (! empty($prices['coins'])) {
                $rows[] = ShopCatalogItem::query()->create(array_merge($base, [
                    'currency' => 'coins',
                    'price' => $prices['coins'],
                ]));
            }
            if (! empty($prices['premium'])) {
                $rows[] = ShopCatalogItem::query()->create(array_merge($base, [
                    'currency' => 'premium',
                    'price' => $prices['premium'],
                ]));
            }
        });

        $ids = array_map(fn (ShopCatalogItem $r) => $r->shop_catalog_item_id, $rows);
        $created = ShopCatalogItem::query()
            ->whereIn('shop_catalog_item_id', $ids)
            ->with('itemDef')
            ->orderBy('shop_catalog_item_id')
            ->get();

        return response()->json([
            'items' => ShopCatalogItemResource::collection($created)->resolve(),
        ], 201);
    }

    public function update(Request $request, ShopCatalogItem $shopCatalogItem): JsonResponse
    {
        $validated = $request->validate([
            'code' => [
                'sometimes',
                'string',
                'max:128',
                'regex:/^[a-z0-9_]+$/',
                Rule::unique('item_defs', 'code')->ignore($shopCatalogItem->item_def_id, 'item_def_id'),
            ],
            'name' => ['sometimes', 'string', 'max:200'],
            'kind' => ['sometimes', 'string', 'in:furniture,cosmetic,consumable,misc'],
            'rarity' => ['sometimes', 'integer', 'min:0', 'max:32767'],
            'tradable' => ['sometimes', 'boolean'],
            'premium_only' => ['sometimes', 'boolean'],
            'bind' => ['sometimes', 'string', 'in:none,bind_on_equip,bind_on_place,bound'],
            'max_stack' => ['sometimes', 'integer', 'min:1'],
            'cosmetic_slot' => ['sometimes', 'nullable', 'string', 'in:body,hair,top,bottom,shoes,head_accessory'],
            'preview_image' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'model_glb' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'currency' => [
                'sometimes',
                'string',
                'in:coins,premium',
                Rule::unique('shop_catalog_items', 'currency')
                    ->where('item_def_id', $shopCatalogItem->item_def_id)
                    ->ignore($shopCatalogItem->shop_catalog_item_id, 'shop_catalog_item_id'),
            ],
            'price' => ['sometimes', 'integer', 'min:1'],
            'is_active' => ['sometimes', 'boolean'],
            'is_unique_per_account' => ['sometimes', 'boolean'],
            'stock_remaining' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ]);

        DB::transaction(function () use ($validated, $shopCatalogItem) {
            $itemFields = array_intersect_key(
                $validated,
                array_flip([
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
                ])
            );
            if ($itemFields !== []) {
                ItemDef::query()
                    ->where('item_def_id', $shopCatalogItem->item_def_id)
                    ->update($itemFields);
            }

            $catalogFields = array_intersect_key(
                $validated,
                array_flip(['currency', 'price', 'is_active', 'is_unique_per_account', 'stock_remaining', 'sort_order'])
            );
            if ($catalogFields !== []) {
                $shopCatalogItem->update($catalogFields);
            }
        });

        $shopCatalogItem->refresh()->load('itemDef');

        return response()->json([
            'item' => (new ShopCatalogItemResource($shopCatalogItem))->resolve(),
        ]);
    }

    public function destroy(ShopCatalogItem $shopCatalogItem): JsonResponse
    {
        try {
            $shopCatalogItem->delete();
        } catch (QueryException $e) {
            if (($e->errorInfo[0] ?? '') === '23503') {
                return response()->json([
                    'message' => 'Cannot delete this catalog entry because related records exist (for example purchases). Remove dependencies first or deactivate the listing instead.',
                ], 409);
            }

            throw $e;
        }

        return response()->json(null, 204);
    }

    private function escapeLikePattern(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $value);
    }
}
