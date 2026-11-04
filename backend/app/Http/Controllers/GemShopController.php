<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Models\GemOrder;
use App\Services\GemCheckoutService;
use App\Services\WalletSummaryService;
use App\Support\GemCheckoutConfig;
use App\Support\GemPackCatalog;
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

    /** `available` says whether *this* player may order, with the same rule as POST /gems/orders. */
    public function packs(Request $request, GemCheckoutConfig $config): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();
        $reason = $config->unavailableReason($account);

        return response()->json([
            'available' => $reason === null,
            // null | disabled (demo off) | admin_only (production server, reserved to administrators)
            'unavailable_reason' => $reason,
            // always true: no real sale is open, Stripe only runs in test mode
            'demo' => true,
            'packs' => GemPackCatalog::all(),
        ]);
    }

    /**
     * Creates (or hands back) the order and its Checkout Session; the browser then goes to `checkout_url`.
     * 202 `checkout_preparing`: another request is creating the session, poll GET /gems/orders/{id} for the URL.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'pack' => ['required', 'string', Rule::in(GemPackCatalog::codes())],
            'locale' => 'nullable|string|in:fr,en',
        ]);

        /** @var Account $account */
        $account = $request->user();
        $result = $this->checkout->start($account, $validated['pack'], $validated['locale'] ?? 'en');

        if ($result['preparing']) {
            return response()->json([
                'code' => 'checkout_preparing',
                'message' => 'The payment page is being prepared.',
                'order' => $result['order']->toPlayerArray(),
                'checkout_url' => null,
                'retry_after_ms' => GemCheckoutService::PREPARING_RETRY_MS,
            ], 202, ['Retry-After' => (string) max(1, intdiv(GemCheckoutService::PREPARING_RETRY_MS, 1000))]);
        }

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
            // the owner's own payment page while it is open: the shop polls it after a 202 checkout_preparing
            'checkout_url' => $order->status === GemOrder::STATUS_OPEN ? $order->checkout_url : null,
            'wallet_summary' => $wallets->forAccountId((int) $account->getAuthIdentifier()),
        ]);
    }
}
