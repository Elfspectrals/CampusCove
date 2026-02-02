<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Models\AccountHandle;
use App\Models\Friendship;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class FriendController extends Controller
{
    /**
     * List accepted friends (with display_name). Optionally include presence placeholder.
     */
    public function index(Request $request): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();
        $accountId = $account->getAuthIdentifier();

        $friends = Friendship::query()
            ->where('status', 'accepted')
            ->where(function ($q) use ($accountId) {
                $q->where('account_id_a', $accountId)->orWhere('account_id_b', $accountId);
            })
            ->get()
            ->map(function (Friendship $f) use ($accountId) {
                $otherId = $f->otherAccountId($accountId);
                $handle = AccountHandle::where('account_id', $otherId)->first();

                return [
                    'account_id' => $otherId,
                    'display_name' => $handle?->display_name ?? 'Unknown',
                    'username' => $handle?->username ?? '',
                    'status' => 'offline', // placeholder until presence exists
                ];
            });

        return response()->json(['friends' => $friends]);
    }

    /**
     * List pending requests (incoming: to me; outgoing: from me).
     */
    public function pending(Request $request): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();
        $accountId = $account->getAuthIdentifier();

        $pending = Friendship::query()
            ->where('status', 'pending')
            ->where(function ($q) use ($accountId) {
                $q->where('account_id_a', $accountId)->orWhere('account_id_b', $accountId);
            })
            ->get()
            ->map(function (Friendship $f) use ($accountId) {
                $otherId = $f->otherAccountId($accountId);
                $handle = AccountHandle::where('account_id', $otherId)->first();
                $incoming = $f->requested_by !== $accountId;

                return [
                    'account_id' => $otherId,
                    'display_name' => $handle?->display_name ?? 'Unknown',
                    'username' => $handle?->username ?? '',
                    'incoming' => $incoming,
                ];
            });

        return response()->json(['pending' => $pending]);
    }

    /**
     * Send a friend request (by target username and handle/tag).
     */
    public function request(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'username' => 'required|string|min:3|max:24',
            'tag' => 'required|integer|min:0|max:9999',
        ]);
        $normalized = mb_strtolower($validated['username']);
        $tag = (int) $validated['tag'];

        /** @var Account $account */
        $account = $request->user();
        $myId = $account->getAuthIdentifier();

        $targetHandle = AccountHandle::where('normalized', $normalized)->where('tag', $tag)->first();
        if (! $targetHandle) {
            throw ValidationException::withMessages(['username' => ['User not found. Check username and handle.']]);
        }

        $targetId = $targetHandle->account_id;
        if ($targetId === $myId) {
            throw ValidationException::withMessages(['username' => ['You cannot add yourself.']]);
        }

        $a = min($myId, $targetId);
        $b = max($myId, $targetId);

        $existing = Friendship::where('account_id_a', $a)->where('account_id_b', $b)->first();
        if ($existing) {
            if ($existing->status === 'accepted') {
                throw ValidationException::withMessages(['username' => ['Already friends.']]);
            }
            if ($existing->status === 'blocked') {
                throw ValidationException::withMessages(['username' => ['Cannot send request.']]);
            }
            if ($existing->status === 'pending') {
                throw ValidationException::withMessages(['username' => ['Request already pending.']]);
            }
        }

        Friendship::updateOrCreate(
            ['account_id_a' => $a, 'account_id_b' => $b],
            ['status' => 'pending', 'requested_by' => $myId, 'updated_at' => now()]
        );

        return response()->json(['message' => 'Friend request sent.']);
    }

    /**
     * Accept a pending request (by other account_id).
     */
    public function accept(Request $request, int $accountId): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();
        $myId = $account->getAuthIdentifier();

        $a = min($myId, $accountId);
        $b = max($myId, $accountId);

        $friendship = Friendship::where('account_id_a', $a)->where('account_id_b', $b)->first();
        if (! $friendship || $friendship->status !== 'pending') {
            throw ValidationException::withMessages(['account_id' => ['No pending request found.']]);
        }
        if ($friendship->requested_by === $myId) {
            throw ValidationException::withMessages(['account_id' => ['You cannot accept your own request.']]);
        }

        Friendship::where('account_id_a', $a)->where('account_id_b', $b)->update(['status' => 'accepted', 'updated_at' => now()]);

        return response()->json(['message' => 'Friend request accepted.']);
    }

    /**
     * Block a user (by account_id). Creates or updates friendship to blocked.
     */
    public function block(Request $request, int $accountId): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();
        $myId = $account->getAuthIdentifier();

        if ($accountId === $myId) {
            throw ValidationException::withMessages(['account_id' => ['You cannot block yourself.']]);
        }

        $a = min($myId, $accountId);
        $b = max($myId, $accountId);

        $updated = Friendship::where('account_id_a', $a)->where('account_id_b', $b)->update(['status' => 'blocked', 'requested_by' => $myId, 'updated_at' => now()]);
        if ($updated === 0) {
            Friendship::create([
                'account_id_a' => $a,
                'account_id_b' => $b,
                'status' => 'blocked',
                'requested_by' => $myId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return response()->json(['message' => 'User blocked.']);
    }

    /**
     * Unfriend: remove accepted friendship (or decline pending by deleting).
     */
    public function destroy(Request $request, int $accountId): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();
        $myId = $account->getAuthIdentifier();

        $a = min($myId, $accountId);
        $b = max($myId, $accountId);

        Friendship::where('account_id_a', $a)->where('account_id_b', $b)->delete();

        return response()->json(['message' => 'Friend removed.']);
    }
}
