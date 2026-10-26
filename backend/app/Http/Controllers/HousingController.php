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

    public function giveKeys(Request $request): JsonResponse
    {
        $validated = $request->validate(['account_id' => ['required', 'integer', 'min:1']]);
        /** @var Account $account */
        $account = $request->user();
        $unit = $this->housing->giveKeys($account, (int) $validated['account_id']);

        return response()->json(['unit' => $this->housing->serializeUnit($unit)]);
    }

    public function takeKeys(Request $request, int $accountId): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();
        $unit = $this->housing->takeKeys($account, $accountId);

        return response()->json(['unit' => $this->housing->serializeUnit($unit)]);
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
