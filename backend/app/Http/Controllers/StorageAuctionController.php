<?php

namespace App\Http\Controllers;

use App\Services\StorageAuctionService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StorageAuctionController extends Controller
{
    public function __construct(private readonly StorageAuctionService $auction) {}

    public function openSale(Request $request): JsonResponse
    {
        $validated = $request->validate(['night' => ['required', 'date_format:Y-m-d']]);

        return response()->json(['lots' => $this->auction->openSale(CarbonImmutable::parse($validated['night']))]);
    }

    public function bid(Request $request, string $publicId): JsonResponse
    {
        $validated = $request->validate(['amount' => ['required', 'integer', 'min:1', 'max:10000000']]);

        return response()->json($this->auction->bid($publicId, (int) $request->user()->getAuthIdentifier(), (int) $validated['amount']));
    }

    public function hammer(string $publicId): JsonResponse
    {
        return response()->json($this->auction->hammer($publicId));
    }

    public function open(Request $request, string $publicId): JsonResponse
    {
        return response()->json($this->auction->open($publicId, (int) $request->user()->getAuthIdentifier()));
    }

    public function openAllWon(Request $request): JsonResponse
    {
        return response()->json(['lots' => $this->auction->openAllWon((int) $request->user()->getAuthIdentifier())]);
    }
}
