<?php

namespace App\Http\Controllers;

use App\Services\MarketService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MarketController extends Controller
{
    public function __construct(private readonly MarketService $market)
    {
    }

    public function show(): JsonResponse
    {
        return response()->json($this->market->current());
    }

    public function claimStall(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'stall_no' => 'required|integer|min:1|max:'.MarketService::STALL_COUNT,
            'canopy' => 'required|string|max:10',
        ]);

        return response()->json($this->market->claimStall(
            $this->accountId($request),
            (int) $validated['stall_no'],
            $validated['canopy'],
        ));
    }

    public function listLot(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'slot' => 'required|integer|min:1|max:'.MarketService::LOTS_PER_STALL,
            'code' => 'required|string|max:64',
            'quantity' => 'required|integer|min:1|max:'.MarketService::MAX_QUANTITY,
            'unit_price' => 'required|integer|min:1|max:'.MarketService::MAX_UNIT_PRICE,
        ]);

        return response()->json($this->market->listLot(
            $this->accountId($request),
            (int) $validated['slot'],
            $validated['code'],
            (int) $validated['quantity'],
            (int) $validated['unit_price'],
        ));
    }

    public function withdrawLot(Request $request, int $id): JsonResponse
    {
        return response()->json($this->market->withdrawLot($this->accountId($request), $id));
    }

    public function buy(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'quantity' => 'required|integer|min:1|max:'.MarketService::MAX_QUANTITY,
            'purchase_ref' => 'required|string|max:64',
        ]);

        return response()->json($this->market->buy(
            $this->accountId($request),
            $id,
            (int) $validated['quantity'],
            $validated['purchase_ref'],
        ));
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
