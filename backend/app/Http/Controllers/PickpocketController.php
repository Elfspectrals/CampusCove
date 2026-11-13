<?php

namespace App\Http\Controllers;

use App\Services\PickpocketService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PickpocketController extends Controller
{
    public function __construct(private readonly PickpocketService $pickpockets) {}

    public function open(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'victim_account_id' => 'required|integer|exists:accounts,account_id',
        ]);

        return response()->json(['attempt' => [
            'id' => $this->pickpockets->open($this->accountId($request), (int) $validated['victim_account_id']),
        ]], 201);
    }

    public function settle(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'outcome' => ['required', 'string', Rule::in(PickpocketService::OUTCOMES)],
        ]);

        return response()->json(['loot' => $this->pickpockets->settle($this->accountId($request), $id, $validated['outcome'])]);
    }

    public function take(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'item_code' => 'required|string|max:64',
        ]);

        return response()->json(['taken' => $this->pickpockets->take($this->accountId($request), $id, $validated['item_code'])]);
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
