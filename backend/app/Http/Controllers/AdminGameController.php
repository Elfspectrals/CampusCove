<?php

namespace App\Http\Controllers;

use App\Models\Wallet;
use App\Services\AdminItemGrantService;
use App\Services\BankService;
use App\Services\HousingService;
use App\Services\MarketService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

class AdminGameController extends Controller
{
    private const MAX_MONEY_GRANT = 100_000;

    private const MAX_ITEM_GRANT = 999;

    private const MAX_MARKET_MINUTES = 240;

    private const WALLETS = ['cash' => Wallet::CASH, 'bank' => Wallet::BANK];

    public function items(AdminItemGrantService $grants): JsonResponse
    {
        return response()->json(['items' => $grants->grantable()]);
    }

    public function wallets(Request $request, BankService $bank): JsonResponse
    {
        $validated = $request->validate([
            'account_id' => ['required', 'integer', $this->liveAccount()],
        ]);
        $summary = $bank->summary((int) $validated['account_id']);

        return response()->json(['cash' => $summary['cash'], 'bank' => $summary['bank']]);
    }

    public function grantMoney(Request $request, BankService $bank): JsonResponse
    {
        $validated = $request->validate([
            'account_id' => ['required', 'integer', $this->liveAccount()],
            'wallet' => ['required', 'string', Rule::in(array_keys(self::WALLETS))],
            'amount' => ['required', 'integer', 'min:1', 'max:'.self::MAX_MONEY_GRANT],
            'ref' => ['required', 'uuid'],
        ]);

        return response()->json($bank->adminGrant(
            (int) $request->user()->getAuthIdentifier(),
            (int) $validated['account_id'],
            self::WALLETS[$validated['wallet']],
            (int) $validated['amount'],
            (string) $validated['ref'],
        ));
    }

    public function grantItem(Request $request, AdminItemGrantService $grants): JsonResponse
    {
        $validated = $request->validate([
            'account_id' => ['required', 'integer', $this->liveAccount()],
            'code' => ['required', 'string', 'max:255', 'exists:item_defs,code'],
            'quantity' => ['required', 'integer', 'min:1', 'max:'.self::MAX_ITEM_GRANT],
            'ref' => ['required', 'uuid'],
        ]);

        $grants->grant(
            (int) $request->user()->getAuthIdentifier(),
            (int) $validated['account_id'],
            (string) $validated['code'],
            (int) $validated['quantity'],
            (string) $validated['ref'],
        );

        return response()->json([
            'account_id' => (int) $validated['account_id'],
            'code' => (string) $validated['code'],
            'quantity' => (int) $validated['quantity'],
        ]);
    }

    public function collectTaxes(HousingService $housing): JsonResponse
    {
        return response()->json($housing->collectDueTaxesSummary());
    }

    public function openMarket(Request $request, MarketService $market): JsonResponse
    {
        $validated = $request->validate([
            'minutes' => ['required', 'integer', 'min:1', 'max:'.self::MAX_MARKET_MINUTES],
        ]);

        return response()->json($market->openNow((int) $validated['minutes']));
    }

    public function closeMarket(MarketService $market): JsonResponse
    {
        return response()->json($market->closeNow());
    }

    private function liveAccount(): Exists
    {
        return Rule::exists('accounts', 'account_id')->whereNull('deleted_at');
    }
}
