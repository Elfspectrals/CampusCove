<?php

namespace App\Http\Controllers;

use App\Services\TradeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TradeController extends Controller
{
    public function __construct(private readonly TradeService $trades)
    {
    }

    /** Coins and tradable items the player can put in a trade (the realtime server checks offers against it too). */
    public function offerable(Request $request): JsonResponse
    {
        return response()->json($this->trades->offerable($this->accountId($request)));
    }

    /** Realtime server only: both players confirmed the same offers, near each other. */
    public function execute(Request $request): JsonResponse
    {
        $offerRules = static fn (string $key): array => [
            "{$key}" => 'required|array',
            "{$key}.coins" => 'required|integer|min:0|max:'.TradeService::MAX_COINS,
            "{$key}.items" => 'present|array|max:'.TradeService::MAX_LINES,
            "{$key}.items.*.code" => 'required|string|max:64',
            "{$key}.items.*.quantity" => 'required|integer|min:1|max:'.TradeService::MAX_QUANTITY,
        ];
        $validated = $request->validate([
            'partner_account_id' => 'required|integer|min:1',
            'trade_ref' => 'required|string|max:64',
            ...$offerRules('my_offer'),
            ...$offerRules('partner_offer'),
        ]);

        return response()->json($this->trades->execute(
            $this->accountId($request),
            (int) $validated['partner_account_id'],
            $this->offer($validated['my_offer']),
            $this->offer($validated['partner_offer']),
            $validated['trade_ref'],
        ));
    }

    /**
     * @param  array{coins: int, items: list<array{code: string, quantity: int}>}  $raw
     * @return array{coins: int, items: array<string, int>}
     */
    private function offer(array $raw): array
    {
        $items = [];
        foreach ($raw['items'] as $line) {
            $items[$line['code']] = ($items[$line['code']] ?? 0) + (int) $line['quantity'];
        }

        return ['coins' => (int) $raw['coins'], 'items' => $items];
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
