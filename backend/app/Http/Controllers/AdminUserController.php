<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Models\AccountAuthLocal;
use App\Models\AccountHandle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminUserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:200'],
            'is_admin' => ['nullable', 'boolean'],
            'is_banned' => ['nullable', 'boolean'],
            'is_suspended' => ['nullable', 'boolean'],
            'with_deleted' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = Account::query()
            ->with(['handle', 'localAuth'])
            ->orderByDesc('account_id');

        if (($validated['with_deleted'] ?? false) === true) {
            $query->withTrashed();
        }
        if (array_key_exists('is_admin', $validated)) {
            $query->where('is_admin', $validated['is_admin']);
        }
        if (($validated['is_banned'] ?? false) === true) {
            $query->whereNotNull('banned_at');
        }
        if (($validated['is_suspended'] ?? false) === true) {
            $query->whereNotNull('suspended_until')->where('suspended_until', '>', now());
        }
        if (! empty($validated['q'])) {
            $term = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $validated['q']).'%';
            $query->where(function ($q) use ($term): void {
                $q->whereHas('handle', fn ($subQ) => $subQ->where('username', 'ilike', $term))
                    ->orWhereHas('localAuth', fn ($subQ) => $subQ->where('email', 'ilike', $term));
            });
        }

        $perPage = (int) ($validated['per_page'] ?? 20);

        return response()->json($query->paginate($perPage)->through(fn (Account $account): array => $this->toPayload($account)));
    }

    public function show(int $accountId): JsonResponse
    {
        $account = Account::withTrashed()->with(['handle', 'localAuth'])->findOrFail($accountId);

        return response()->json(['user' => $this->toPayload($account)]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'username' => ['required', 'string', 'min:3', 'max:24', 'regex:/^[a-zA-Z0-9_]+$/'],
            'email' => ['required', 'email', 'unique:account_auth_local,email'],
            'password' => ['required', 'string', 'min:8'],
            'is_admin' => ['nullable', 'boolean'],
        ]);

        $normalized = mb_strtolower($validated['username']);
        if (AccountHandle::query()->where('normalized', $normalized)->exists()) {
            throw ValidationException::withMessages([
                'username' => ['This username is already taken.'],
            ]);
        }

        $created = DB::transaction(function () use ($validated, $normalized): Account {
            $account = Account::query()->create([
                'status' => 'active',
                'is_admin' => (bool) ($validated['is_admin'] ?? false),
            ]);

            AccountHandle::query()->create([
                'account_id' => (int) $account->account_id,
                'username' => (string) $validated['username'],
                'tag' => random_int(0, 9999),
                'normalized' => $normalized,
            ]);

            AccountAuthLocal::query()->create([
                'account_id' => (int) $account->account_id,
                'email' => (string) $validated['email'],
                'password_hash' => Hash::make((string) $validated['password']),
                'email_verified' => false,
            ]);

            return $account;
        });

        return response()->json([
            'user' => $this->toPayload($created->load(['handle', 'localAuth'])),
        ], 201);
    }

    public function update(Request $request, int $accountId): JsonResponse
    {
        $account = Account::withTrashed()->with(['handle', 'localAuth'])->findOrFail($accountId);

        $validated = $request->validate([
            'username' => ['sometimes', 'string', 'min:3', 'max:24', 'regex:/^[a-zA-Z0-9_]+$/'],
            'email' => [
                'sometimes',
                'email',
                Rule::unique('account_auth_local', 'email')->ignore($accountId, 'account_id'),
            ],
            'is_admin' => ['sometimes', 'boolean'],
        ]);

        DB::transaction(function () use ($account, $validated): void {
            if (array_key_exists('username', $validated)) {
                $normalized = mb_strtolower((string) $validated['username']);
                $exists = AccountHandle::query()
                    ->where('normalized', $normalized)
                    ->where('account_id', '!=', (int) $account->account_id)
                    ->exists();
                if ($exists) {
                    throw ValidationException::withMessages(['username' => ['This username is already taken.']]);
                }

                $account->handle()->update([
                    'username' => (string) $validated['username'],
                    'normalized' => $normalized,
                ]);
            }

            if (array_key_exists('email', $validated)) {
                $account->localAuth()->update(['email' => (string) $validated['email']]);
            }

            if (array_key_exists('is_admin', $validated)) {
                $account->update(['is_admin' => (bool) $validated['is_admin']]);
            }
        });

        return response()->json(['user' => $this->toPayload($account->fresh(['handle', 'localAuth']))]);
    }

    public function destroy(int $accountId): JsonResponse
    {
        $account = Account::query()->findOrFail($accountId);
        $account->tokens()->delete();
        $account->delete();

        return response()->json(null, 204);
    }

    public function restore(int $accountId): JsonResponse
    {
        $account = Account::withTrashed()->findOrFail($accountId);
        $account->restore();

        return response()->json(['user' => $this->toPayload($account->fresh(['handle', 'localAuth']))]);
    }

    public function suspend(Request $request, int $accountId): JsonResponse
    {
        $validated = $request->validate([
            'until' => ['required', 'date', 'after:now'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $account = Account::withTrashed()->findOrFail($accountId);
        $account->update([
            'suspended_until' => $validated['until'],
            'suspension_reason' => $validated['reason'] ?? null,
        ]);
        $account->tokens()->delete();

        return response()->json([
            'message' => 'User suspended.',
            'code' => 'user_suspended',
            'user' => $this->toPayload($account->fresh(['handle', 'localAuth'])),
        ]);
    }

    public function unsuspend(int $accountId): JsonResponse
    {
        $account = Account::withTrashed()->findOrFail($accountId);
        $account->update([
            'suspended_until' => null,
            'suspension_reason' => null,
        ]);

        return response()->json([
            'message' => 'User unsuspended.',
            'code' => 'user_unsuspended',
            'user' => $this->toPayload($account->fresh(['handle', 'localAuth'])),
        ]);
    }

    public function ban(Request $request, int $accountId): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $account = Account::withTrashed()->findOrFail($accountId);
        $account->update([
            'banned_at' => now(),
            'ban_reason' => $validated['reason'] ?? null,
        ]);
        $account->tokens()->delete();

        return response()->json([
            'message' => 'User banned.',
            'code' => 'user_banned',
            'user' => $this->toPayload($account->fresh(['handle', 'localAuth'])),
        ]);
    }

    public function unban(int $accountId): JsonResponse
    {
        $account = Account::withTrashed()->findOrFail($accountId);
        $account->update([
            'banned_at' => null,
            'ban_reason' => null,
        ]);

        return response()->json([
            'message' => 'User unbanned.',
            'code' => 'user_unbanned',
            'user' => $this->toPayload($account->fresh(['handle', 'localAuth'])),
        ]);
    }

    public function resetPassword(Request $request, int $accountId): JsonResponse
    {
        $validated = $request->validate([
            'password' => ['required', 'string', 'min:8'],
        ]);

        $account = Account::withTrashed()->findOrFail($accountId);
        $account->localAuth()->update([
            'password_hash' => Hash::make((string) $validated['password']),
        ]);
        $account->tokens()->delete();

        return response()->json([
            'message' => 'Password reset successfully.',
            'code' => 'password_reset',
        ]);
    }

    private function toPayload(Account $account): array
    {
        return [
            'account_id' => (int) $account->account_id,
            'public_id' => (string) $account->public_id,
            'username' => $account->handle?->username,
            'tag' => $account->handle?->tag,
            'email' => $account->localAuth?->email,
            'is_admin' => (bool) $account->is_admin,
            'suspended_until' => $account->suspended_until?->toIso8601String(),
            'suspension_reason' => $account->suspension_reason,
            'banned_at' => $account->banned_at?->toIso8601String(),
            'ban_reason' => $account->ban_reason,
            'deleted_at' => $account->deleted_at?->toIso8601String(),
            'created_at' => $account->created_at?->toIso8601String(),
            'last_login_at' => $account->last_login_at?->toIso8601String(),
        ];
    }
}
