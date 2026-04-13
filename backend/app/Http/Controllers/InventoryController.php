<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Services\AccountInventoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InventoryController extends Controller
{
    public function index(Request $request, AccountInventoryService $accountInventoryService): JsonResponse
    {
        $validated = $request->validate([
            'kind' => 'nullable|string|in:furniture,cosmetic,consumable,misc',
            'q' => 'nullable|string|max:200',
        ]);

        /** @var Account $account */
        $account = $request->user();
        $accountId = (int) $account->getAuthIdentifier();

        $kind = $validated['kind'] ?? null;
        $q = $validated['q'] ?? null;
        if ($q === '') {
            $q = null;
        }

        $rows = $accountInventoryService->aggregatedItemsForAccount($accountId, $kind, $q);

        return response()->json([
            'items' => $rows->map(fn (object $row): array => [
                'item_def_id' => $row->item_def_id,
                'code' => $row->code,
                'name' => $row->name,
                'kind' => $row->kind,
                'rarity' => $row->rarity,
                'tradable' => $row->tradable,
                'premium_only' => $row->premium_only,
                'bind' => $row->bind,
                'max_stack' => $row->max_stack,
                'cosmetic_slot' => $row->cosmetic_slot ?? null,
                'quantity' => $row->quantity,
            ])->values()->all(),
        ]);
    }
}
