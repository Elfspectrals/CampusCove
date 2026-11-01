<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Models\GemOrder;
use App\Services\GemCheckoutService;
use App\Services\WalletSummaryService;
use App\Support\GemPackCatalog;
use App\Support\GemCheckoutConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Gem packs paid through Stripe Checkout in test mode only: demo payments with Stripe's test cards, no real money,
 * but the premium wallet of the game is really credited (docs/STRIPE.md).
 */
class GemShopController extends Controller
{
    public function __construct(private readonly GemCheckoutService $checkout) {}

    public function packs(GemCheckoutConfig $config): JsonResponse
    {
        return response()->json([
            'available' => $config->checkoutOpen(),
            // always true: no real sale is open, Stripe only runs in test mode
            'demo' => true,
            'packs' => GemPackCatalog::all(),
        ]);
    }

    /** Creates (or hands back) the order and its Checkout Session; the browser then goes to `checkout_url`. */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'pack' => ['required', 'string', Rule::in(GemPackCatalog::codes())],
            'locale' => 'nullable|string|in:fr,en',
        ]);

        /** @var Account $account */
        $account = $request->user();
        $result = $this->checkout->start($account, $validated['pack'], $validated['locale'] ?? 'en');

        return response()->json([
            'order' => $result['order']->toPlayerArray(),
            'checkout_url' => $result['checkout_url'],
        ], $result['reused'] ? 200 : 201);
    }

    public function index(Request $request): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();

        $orders = GemOrder::query()
            ->where('account_id', $account->getAuthIdentifier())
            ->whereNotIn('status', [GemOrder::STATUS_CREATING, GemOrder::STATUS_CANCELED])
            ->latest('id')
            ->limit(30)
            ->get();

        return response()->json(['orders' => $orders->map(fn (GemOrder $o) => $o->toPlayerArray())->all()]);
    }

    /** Real state of the order, plus the wallet so the front resyncs its cache from the API (never optimistically). */
    public function show(Request $request, string $publicId, WalletSummaryService $wallets): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();
        $order = $this->checkout->statusFor($account, $publicId);

        return response()->json([
            'order' => $order->toPlayerArray(),
            'wallet_summary' => $wallets->forAccountId((int) $account->getAuthIdentifier()),
        ]);
    }
}
