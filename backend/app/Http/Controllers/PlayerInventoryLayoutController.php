<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Models\AccountInventoryLayout;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlayerInventoryLayoutController extends Controller
{
    private const SLOT_COUNT = 36;

    public function show(Request $request): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();
        $accountId = (int) $account->getAuthIdentifier();

        $row = AccountInventoryLayout::query()->where('account_id', $accountId)->first();

        if ($row === null) {
            return response()->json([
                'layout' => [
                    'slots' => array_fill(0, self::SLOT_COUNT, ''),
                    'selected_hotbar_index' => 0,
                ],
            ]);
        }

        return response()->json([
            'layout' => [
                'slots' => $row->slots,
                'selected_hotbar_index' => $row->selected_hotbar_index,
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'slots' => ['required', 'array', 'size:'.self::SLOT_COUNT],
            'slots.*' => ['string', 'max:160'],
            'selected_hotbar_index' => ['required', 'integer', 'min:0', 'max:8'],
        ]);

        /** @var Account $account */
        $account = $request->user();
        $accountId = (int) $account->getAuthIdentifier();

        $sanitizedSlots = [];
        foreach ($validated['slots'] as $slot) {
            $trimmed = trim((string) $slot);
            $sanitizedSlots[] = strlen($trimmed) > 160 ? substr($trimmed, 0, 160) : $trimmed;
        }

        AccountInventoryLayout::updateOrCreate(
            ['account_id' => $accountId],
            [
                'slots' => $sanitizedSlots,
                'selected_hotbar_index' => $validated['selected_hotbar_index'],
            ],
        );

        return response()->json(['ok' => true]);
    }
}
