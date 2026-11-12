<?php

namespace App\Http\Controllers;

use App\Http\Requests\ShopCheckoutRequest;
use App\Http\Resources\ShopPurchaseResource;
use App\Models\Account;
use App\Services\ReferralService;
use App\Services\ShopPurchaseResult;
use App\Services\ShopPurchaseService;
use App\Services\ZoneBuyerService;
use App\Services\ZonePriceBook;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ZoneShopController extends Controller
{
    public function checkout(ShopCheckoutRequest $request, ShopPurchaseService $shop, ZonePriceBook $prices, ReferralService $referrals): JsonResponse
    {
        $zone = $request->validate(['zone' => ['required', 'string', 'regex:/^[a-z0-9_]+$/']])['zone'];

        /** @var Account $account */
        $account = $request->user();

        $results = $shop->checkoutWithCoins($account, $request->quantities(), $request->checkoutKey(), $prices->prices($zone));

        $referrals->checkQualification((int) $account->getAuthIdentifier());

        return response()->json([
            'purchases' => array_map(fn (ShopPurchaseResult $result): array => array_merge(
                (new ShopPurchaseResource($result->purchase))->toArray($request),
                ['balance_after' => $result->balanceAfter]
            ), $results),
            'balance_after' => $results[array_key_last($results)]->balanceAfter,
        ]);
    }

    public function sell(Request $request, ZoneBuyerService $buyers): JsonResponse
    {
        $validated = $request->validate([
            'zone' => ['required', 'string', 'regex:/^[a-z0-9_]+$/'],
            'area' => ['required', 'string', 'regex:/^[a-z0-9_]+$/'],
            'code' => ['required', 'string', 'max:64'],
            'quantity' => 'required|integer|min:1|max:999',
        ]);

        return response()->json($buyers->sell(
            (int) $request->user()->getAuthIdentifier(),
            $validated['zone'],
            $validated['area'],
            $validated['code'],
            (int) $validated['quantity'],
        ));
    }
}
