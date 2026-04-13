<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Services\AccountCosmeticService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

class CharacterCosmeticController extends Controller
{
    public function show(Request $request, AccountCosmeticService $accountCosmeticService): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();
        $accountId = (int) $account->getAuthIdentifier();

        return response()->json([
            'slots' => $accountCosmeticService->getLoadout($accountId),
            'colors' => $accountCosmeticService->getColors($accountId),
        ]);
    }

    public function update(Request $request, AccountCosmeticService $accountCosmeticService): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();
        $accountId = (int) $account->getAuthIdentifier();

        $slotRules = [];
        foreach (AccountCosmeticService::SLOTS as $slot) {
            $slotRules['slots.'.$slot] = 'nullable|integer';
            $slotRules['colors.'.$slot] = 'nullable|string|regex:/^#[0-9A-Fa-f]{6}$/';
        }

        $validated = $request->validate(array_merge([
            'slots' => 'sometimes|array',
            'colors' => 'sometimes|array',
        ], $slotRules));

        if (! array_key_exists('slots', $validated) && ! array_key_exists('colors', $validated)) {
            return response()->json([
                'message' => 'Provide slots and/or colors.',
            ], 422);
        }

        try {
            $slotsOut = array_key_exists('slots', $validated)
                ? $accountCosmeticService->setLoadout($accountId, $validated['slots'])
                : $accountCosmeticService->getLoadout($accountId);

            $colorsOut = array_key_exists('colors', $validated)
                ? $accountCosmeticService->setColors($accountId, $validated['colors'])
                : $accountCosmeticService->getColors($accountId);
        } catch (InvalidArgumentException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        }

        return response()->json([
            'slots' => $slotsOut,
            'colors' => $colorsOut,
        ]);
    }
}
