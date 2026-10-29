<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Services\AdminHousingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminHousingController extends Controller
{
    public function __construct(
        private readonly AdminHousingService $housing,
    ) {}

    public function index(): JsonResponse
    {
        return response()->json($this->housing->overview());
    }

    public function update(Request $request, string $publicId): JsonResponse
    {
        $validated = $request->validate([
            'price_coins' => ['sometimes', 'integer', 'min:1', 'max:10000000'],
            'tax_coins' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:10000000'],
        ]);
        /** @var Account $admin */
        $admin = $request->user();
        $this->housing->updatePricing($admin, $publicId, $validated);

        return response()->json($this->housing->overview());
    }

    public function kickOwner(Request $request, string $publicId): JsonResponse
    {
        /** @var Account $admin */
        $admin = $request->user();
        $this->housing->kickOwner($admin, $publicId);

        return response()->json($this->housing->overview());
    }

    public function kickKeyHolder(Request $request, string $publicId, int $accountId): JsonResponse
    {
        /** @var Account $admin */
        $admin = $request->user();
        $this->housing->kickKeyHolder($admin, $publicId, $accountId);

        return response()->json($this->housing->overview());
    }
}
