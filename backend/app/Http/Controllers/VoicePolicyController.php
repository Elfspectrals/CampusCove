<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Models\Friendship;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VoicePolicyController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();
        $accountId = (int) $account->getAuthIdentifier();

        $blockedAccountIds = Friendship::query()
            ->where('status', 'blocked')
            ->where(function ($query) use ($accountId): void {
                $query
                    ->where('account_id_a', $accountId)
                    ->orWhere('account_id_b', $accountId);
            })
            ->get(['account_id_a', 'account_id_b'])
            ->map(
                fn (Friendship $friendship): int => $friendship->otherAccountId($accountId),
            )
            ->unique()
            ->values()
            ->all();

        return response()->json([
            'blocked_account_ids' => $blockedAccountIds,
            'refreshed_at' => now()->toIso8601String(),
        ]);
    }
}
