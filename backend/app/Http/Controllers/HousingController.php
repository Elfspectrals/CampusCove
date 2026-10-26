<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Services\HousingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HousingController extends Controller
{
    public function __construct(
        private readonly HousingService $housing,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();
        $accountId = (int) $account->getAuthIdentifier();

        $payload = $this->housing->listUnitsForAccount($accountId);

        return response()->json($payload);
    }

    public function buy(Request $request, string $publicId): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();
        $unit = $this->housing->claimBuy($account, $publicId);

        return response()->json([
            'unit' => $this->housing->serializeUnit($unit),
        ]);
    }
}
