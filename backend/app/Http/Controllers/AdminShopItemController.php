<?php

namespace App\Http\Controllers;

use App\Http\Resources\ShopCatalogItemResource;
use App\Models\ItemDef;
use App\Models\ShopCatalogItem;
use App\Support\AssetUrl;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
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
            'is_published' => ['nullable', 'boolean'],
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
            if ($validated['currency'] === 'coins') {
                $query->where('allow_coins', true);
            } else {
                $query->where('allow_premium', true);
            }
        }

        if (array_key_exists('is_active', $validated)) {
            $query->where('is_active', $validated['is_active']);
        }
        if (array_key_exists('is_published', $validated)) {
            $query->where('is_published', $validated['is_published']);
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
            'preview_image_file' => ['nullable', 'file', 'image', 'max:5120'],
            'model_glb_file' => ['nullable', 'file', 'extensions:glb', 'mimetypes:model/gltf-binary,application/octet-stream', 'max:51200'],
            'prices' => ['required', 'array'],
            'prices.coins' => ['nullable', 'integer', 'min:1'],
            'prices.premium' => ['nullable', 'integer', 'min:1'],
            'is_active' => ['nullable', 'boolean'],
            'is_published' => ['nullable', 'boolean'],
            'is_unique_per_account' => ['nullable', 'boolean'],
            'stock_remaining' => ['nullable', 'integer', 'min:0'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $pricing = $this->normalizedPricing($validated['prices']);

        $created = null;
        DB::transaction(function () use ($request, $validated, $pricing, &$created) {
            $normalizedItemDef = $this->normalizeItemDefPayload($validated);

            $def = ItemDef::query()->create([
                'code' => $normalizedItemDef['code'],
                'name' => $normalizedItemDef['name'],
                'kind' => $normalizedItemDef['kind'],
                'rarity' => $normalizedItemDef['rarity'],
                'tradable' => $normalizedItemDef['tradable'],
                'premium_only' => $normalizedItemDef['premium_only'],
                'bind' => $normalizedItemDef['bind'],
                'max_stack' => $normalizedItemDef['max_stack'],
                'cosmetic_slot' => $normalizedItemDef['cosmetic_slot'],
                'preview_image' => $this->resolvePreviewImagePath($request, $validated['preview_image'] ?? null),
                'model_glb' => $this->resolveModelGlbPath($request, $validated['model_glb'] ?? null),
            ]);

            $catalog = ShopCatalogItem::query()->create([
                'item_def_id' => $def->item_def_id,
                'currency' => $pricing['currency'],
                'price' => $pricing['price'],
                'allow_coins' => $pricing['allow_coins'],
                'coins_price' => $pricing['coins_price'],
                'allow_premium' => $pricing['allow_premium'],
                'premium_price' => $pricing['premium_price'],
                'is_active' => $validated['is_active'] ?? true,
                'is_published' => $validated['is_published'] ?? false,
                'is_unique_per_account' => $validated['is_unique_per_account'] ?? false,
                'stock_remaining' => $validated['stock_remaining'] ?? null,
                'sort_order' => $validated['sort_order'] ?? 0,
            ]);

            $created = $catalog;
        });

        $created?->refresh()->load('itemDef');

        $payload = ShopCatalogItemResource::make($created)->resolve();

        return response()->json([
            'item' => $payload,
            'items' => [$payload],
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
            'preview_image_file' => ['sometimes', 'file', 'image', 'max:5120'],
            'model_glb_file' => ['sometimes', 'file', 'extensions:glb', 'mimetypes:model/gltf-binary,application/octet-stream', 'max:51200'],
            'currency' => [
                'sometimes',
                'string',
                'in:coins,premium',
                Rule::unique('shop_catalog_items', 'currency')
                    ->where('item_def_id', $shopCatalogItem->item_def_id)
                    ->ignore($shopCatalogItem->shop_catalog_item_id, 'shop_catalog_item_id'),
            ],
            'price' => ['sometimes', 'integer', 'min:1'],
            'prices' => ['sometimes', 'array'],
            'prices.coins' => ['nullable', 'integer', 'min:1'],
            'prices.premium' => ['nullable', 'integer', 'min:1'],
            'is_active' => ['sometimes', 'boolean'],
            'is_published' => ['sometimes', 'boolean'],
            'is_unique_per_account' => ['sometimes', 'boolean'],
            'stock_remaining' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ]);

        DB::transaction(function () use ($request, $validated, $shopCatalogItem) {
            $existingItemDef = ItemDef::query()
                ->where('item_def_id', $shopCatalogItem->item_def_id)
                ->firstOrFail();

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
            if ($request->hasFile('preview_image_file')) {
                $itemFields['preview_image'] = $this->resolvePreviewImagePath($request, $itemFields['preview_image'] ?? null);
            }
            if ($request->hasFile('model_glb_file')) {
                $itemFields['model_glb'] = $this->resolveModelGlbPath($request, $itemFields['model_glb'] ?? null);
            }
            if ($itemFields !== []) {
                $itemFields = $this->normalizeItemDefPatch($itemFields, $existingItemDef);
            }
            if ($itemFields !== []) {
                ItemDef::query()
                    ->where('item_def_id', $shopCatalogItem->item_def_id)
                    ->update($itemFields);
            }

            $catalogFields = array_intersect_key(
                $validated,
                array_flip(['currency', 'price', 'is_active', 'is_published', 'is_unique_per_account', 'stock_remaining', 'sort_order'])
            );
            $pricePatch = $this->patchPricingFromUpdate($validated);
            if ($pricePatch !== []) {
                $catalogFields = array_merge($catalogFields, $pricePatch);
            }
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

    /**
     * @param array{coins?: int|null, premium?: int|null} $prices
     * @return array{allow_coins: bool, coins_price: int|null, allow_premium: bool, premium_price: int|null, currency: string, price: int}
     */
    private function normalizedPricing(array $prices): array
    {
        $allowCoins = ! empty($prices['coins']);
        $allowPremium = ! empty($prices['premium']);

        if (! $allowCoins && ! $allowPremium) {
            throw ValidationException::withMessages([
                'prices' => ['At least one of prices.coins or prices.premium must be set.'],
            ]);
        }

        $coinsPrice = $allowCoins ? (int) $prices['coins'] : null;
        $premiumPrice = $allowPremium ? (int) $prices['premium'] : null;

        $legacyCurrency = $allowCoins ? 'coins' : 'premium';
        $legacyPrice = $allowCoins ? $coinsPrice : $premiumPrice;

        return [
            'allow_coins' => $allowCoins,
            'coins_price' => $coinsPrice,
            'allow_premium' => $allowPremium,
            'premium_price' => $premiumPrice,
            'currency' => $legacyCurrency,
            'price' => (int) $legacyPrice,
        ];
    }

    /**
     * @return array<string, int|string|bool|null>
     */
    private function patchPricingFromUpdate(array $validated): array
    {
        if (! array_key_exists('prices', $validated)) {
            return [];
        }

        $prices = $validated['prices'];
        $allowCoins = ! empty($prices['coins']);
        $allowPremium = ! empty($prices['premium']);

        if (! $allowCoins && ! $allowPremium) {
            throw ValidationException::withMessages([
                'prices' => ['At least one of prices.coins or prices.premium must be set.'],
            ]);
        }

        $coinsPrice = $allowCoins ? (int) $prices['coins'] : null;
        $premiumPrice = $allowPremium ? (int) $prices['premium'] : null;
        $legacyCurrency = $allowCoins ? 'coins' : 'premium';
        $legacyPrice = $allowCoins ? $coinsPrice : $premiumPrice;

        return [
            'allow_coins' => $allowCoins,
            'coins_price' => $coinsPrice,
            'allow_premium' => $allowPremium,
            'premium_price' => $premiumPrice,
            'currency' => $legacyCurrency,
            'price' => (int) $legacyPrice,
        ];
    }

    private function resolvePreviewImagePath(Request $request, ?string $fallback): ?string
    {
        /** @var UploadedFile|null $image */
        $image = $request->file('preview_image_file');
        if ($image === null) {
            return AssetUrl::normalize($fallback);
        }

        $storedPath = $image->store('skins/previews', 'public');

        return AssetUrl::normalize(Storage::url($storedPath));
    }

    private function resolveModelGlbPath(Request $request, ?string $fallback): ?string
    {
        /** @var UploadedFile|null $file */
        $file = $request->file('model_glb_file');
        if ($file === null) {
            return AssetUrl::normalize($fallback);
        }

        $storedPath = $file->store('skins/models', 'public');

        return AssetUrl::normalize(Storage::url($storedPath));
    }

    /**
     * @param array<string, mixed> $validated
     * @return array{
     *   code: string,
     *   name: string,
     *   kind: string,
     *   rarity: int,
     *   tradable: bool,
     *   premium_only: bool,
     *   bind: string,
     *   max_stack: int,
     *   cosmetic_slot: string|null
     * }
     */
    private function normalizeItemDefPayload(array $validated): array
    {
        $kind = (string) $validated['kind'];
        $slot = array_key_exists('cosmetic_slot', $validated) ? $validated['cosmetic_slot'] : null;
        $slot = is_string($slot) ? $slot : null;

        if ($slot !== null && $kind !== 'cosmetic') {
            $kind = 'cosmetic';
        }
        if ($kind === 'cosmetic' && $slot === null) {
            $slot = 'body';
        }
        if ($kind !== 'cosmetic') {
            $slot = null;
        }

        return [
            'code' => (string) $validated['code'],
            'name' => (string) $validated['name'],
            'kind' => $kind,
            'rarity' => (int) ($validated['rarity'] ?? 0),
            'tradable' => (bool) ($validated['tradable'] ?? true),
            'premium_only' => (bool) ($validated['premium_only'] ?? false),
            'bind' => (string) ($validated['bind'] ?? 'none'),
            'max_stack' => (int) ($validated['max_stack'] ?? 1),
            'cosmetic_slot' => $slot,
        ];
    }

    /**
     * @param array<string, mixed> $patch
     * @return array<string, mixed>
     */
    private function normalizeItemDefPatch(array $patch, ItemDef $current): array
    {
        $kind = array_key_exists('kind', $patch) ? (string) $patch['kind'] : (string) $current->kind;
        $slot = array_key_exists('cosmetic_slot', $patch) ? $patch['cosmetic_slot'] : $current->cosmetic_slot;
        $slot = is_string($slot) ? $slot : null;

        if ($slot !== null && $kind !== 'cosmetic') {
            $kind = 'cosmetic';
            $patch['kind'] = 'cosmetic';
        }
        if ($kind === 'cosmetic' && $slot === null) {
            $patch['cosmetic_slot'] = 'body';
        }
        if ($kind !== 'cosmetic') {
            $patch['cosmetic_slot'] = null;
        }

        return $patch;
    }
}
