<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Models\ItemDef;
use App\Services\AccountCosmeticService;
use App\Services\AccountInventoryService;
use App\Services\StarterCosmeticGrantService;
use App\Support\AssetUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

class AdminInventoryController extends Controller
{
    public function __construct(
        private readonly AccountInventoryService $inventoryService,
        private readonly AccountCosmeticService $cosmeticService,
        private readonly StarterCosmeticGrantService $starterCosmeticGrantService,
    ) {
    }

    public function players(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:200'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $limit = (int) ($validated['limit'] ?? 30);
        $query = Account::query()->withTrashed()->with(['handle', 'localAuth'])->orderByDesc('account_id');

        if (! empty($validated['q'])) {
            $term = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $validated['q']).'%';
            $query->where(function ($q) use ($term): void {
                $q->whereHas('handle', fn ($subQ) => $subQ->where('username', 'ilike', $term))
                    ->orWhereHas('localAuth', fn ($subQ) => $subQ->where('email', 'ilike', $term));
            });
        }

        $players = $query->limit($limit)->get()->map(fn (Account $account): array => [
            'account_id' => (int) $account->account_id,
            'username' => (string) ($account->handle?->username ?? ''),
            'email' => (string) ($account->localAuth?->email ?? ''),
            'deleted_at' => $account->deleted_at?->toIso8601String(),
        ])->values()->all();

        return response()->json(['players' => $players]);
    }

    public function show(Request $request, int $accountId): JsonResponse
    {
        Account::withTrashed()->findOrFail($accountId);

        $validated = $request->validate([
            'kind' => ['nullable', 'string', 'in:furniture,cosmetic,consumable,misc'],
            'q' => ['nullable', 'string', 'max:200'],
        ]);

        $rows = $this->inventoryService->aggregatedItemsForAccount(
            $accountId,
            $validated['kind'] ?? null,
            $validated['q'] ?? null
        );

        return response()->json([
            'account_id' => $accountId,
            'items' => $rows->map(fn (object $row): array => [
                'item_def_id' => $row->item_def_id,
                'code' => $row->code,
                'name' => $row->name,
                'kind' => $row->kind,
                'rarity' => $row->rarity,
                'quantity' => $row->quantity,
                'cosmetic_slot' => $row->cosmetic_slot ?? null,
                'preview_image' => AssetUrl::normalize($row->preview_image ?? null),
                'model_glb' => AssetUrl::normalize($row->model_glb ?? null),
            ])->values()->all(),
            'equipped' => $this->cosmeticService->getLoadout($accountId),
        ]);
    }

    public function grant(Request $request, int $accountId): JsonResponse
    {
        Account::withTrashed()->findOrFail($accountId);
        $validated = $request->validate([
            'item_def_id' => ['required', 'integer', 'exists:item_defs,item_def_id'],
            'quantity' => ['required', 'integer', 'min:1', 'max:9999'],
        ]);

        $itemDef = ItemDef::query()->findOrFail((int) $validated['item_def_id']);
        $this->inventoryService->grantItem($accountId, $itemDef, (int) $validated['quantity']);

        return response()->json([
            'message' => 'Item granted.',
            'code' => 'inventory_item_granted',
        ]);
    }

    public function revoke(Request $request, int $accountId): JsonResponse
    {
        Account::withTrashed()->findOrFail($accountId);
        $validated = $request->validate([
            'item_def_id' => ['required', 'integer', 'exists:item_defs,item_def_id'],
            'quantity' => ['required', 'integer', 'min:1', 'max:9999'],
        ]);

        $itemDef = ItemDef::query()->findOrFail((int) $validated['item_def_id']);
        $this->inventoryService->revokeItem($accountId, $itemDef, (int) $validated['quantity']);

        return response()->json([
            'message' => 'Item revoked.',
            'code' => 'inventory_item_revoked',
        ]);
    }

    public function setQuantity(Request $request, int $accountId): JsonResponse
    {
        Account::withTrashed()->findOrFail($accountId);
        $validated = $request->validate([
            'item_def_id' => ['required', 'integer', 'exists:item_defs,item_def_id'],
            'quantity' => ['required', 'integer', 'min:0', 'max:9999'],
        ]);

        $itemDef = ItemDef::query()->findOrFail((int) $validated['item_def_id']);
        $this->inventoryService->setItemQuantity($accountId, $itemDef, (int) $validated['quantity']);

        return response()->json([
            'message' => 'Item quantity updated.',
            'code' => 'inventory_item_quantity_set',
        ]);
    }

    public function equip(Request $request, int $accountId): JsonResponse
    {
        Account::withTrashed()->findOrFail($accountId);
        $validated = $request->validate([
            'item_def_id' => ['required', 'integer', 'exists:item_defs,item_def_id'],
        ]);

        $itemDef = ItemDef::query()->findOrFail((int) $validated['item_def_id']);
        if ($itemDef->kind !== 'cosmetic' || $itemDef->cosmetic_slot === null) {
            return response()->json([
                'message' => 'Only cosmetic items with a valid slot can be equipped.',
                'code' => 'invalid_cosmetic_item',
            ], 422);
        }

        try {
            $loadout = $this->cosmeticService->setLoadout($accountId, [
                (string) $itemDef->cosmetic_slot => (int) $itemDef->item_def_id,
            ]);
        } catch (InvalidArgumentException $e) {
            return response()->json([
                'message' => 'Cannot equip this item for the account.',
                'code' => (string) $e->getMessage(),
            ], 422);
        }

        return response()->json([
            'message' => 'Skin equipped.',
            'code' => 'inventory_skin_equipped',
            'equipped' => $loadout,
        ]);
    }

    public function reset(int $accountId): JsonResponse
    {
        Account::withTrashed()->findOrFail($accountId);
        $this->inventoryService->resetInventory($accountId);
        $this->starterCosmeticGrantService->ensureStarterCosmeticsForAccount($accountId);

        return response()->json([
            'message' => 'Inventory reset to starter body skins.',
            'code' => 'inventory_reset',
        ]);
    }
}
