<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Models\AccountAuthLocal;
use App\Models\AccountHandle;
use App\Services\StarterCosmeticGrantService;
use App\Services\WalletSummaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(
        private readonly WalletSummaryService $walletSummary,
    ) {
    }

    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => 'required|email|unique:account_auth_local,email',
            'username' => 'required|string|min:3|max:24|regex:/^[a-zA-Z0-9_]+$/',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $normalized = mb_strtolower($validated['username']);
        $exists = AccountHandle::where('normalized', $normalized)->exists();
        if ($exists) {
            throw ValidationException::withMessages([
                'username' => ['This username is already taken.'],
            ]);
        }

        $tag = random_int(0, 9999);

        DB::transaction(function () use ($validated, $normalized, $tag) {
            Account::create(['status' => 'active']);
            // PostgreSQL IDENTITY: Eloquent may not set account_id on the model, so fetch it
            $accountId = Account::orderByDesc('account_id')->value('account_id');
            AccountHandle::create([
                'account_id' => $accountId,
                'username' => $validated['username'],
                'tag' => $tag,
                'normalized' => $normalized,
            ]);
            AccountAuthLocal::create([
                'account_id' => $accountId,
                'email' => $validated['email'],
                'password_hash' => Hash::make($validated['password']),
                'email_verified' => false,
            ]);
        });

        $account = Account::whereHas('localAuth', fn ($q) => $q->where('email', $validated['email']))
            ->with('handle', 'localAuth')
            ->firstOrFail();

        app(StarterCosmeticGrantService::class)->ensureStarterCosmeticsForAccount((int) $account->account_id);

        $account->update(['last_login_at' => now()]);
        $token = $account->createToken('auth')->plainTextToken;

        return response()->json([
            'user' => $this->formatUser($account),
            'token' => $token,
            'token_type' => 'Bearer',
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        $account = Account::whereHas('localAuth', fn ($q) => $q->where('email', $validated['email']))
            ->with('handle', 'localAuth')
            ->first();

        if (! $account || ! Hash::check($validated['password'], $account->localAuth->password_hash)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        $account->update(['last_login_at' => now()]);
        $account->tokens()->delete();
        $token = $account->createToken('auth')->plainTextToken;

        return response()->json([
            'user' => $this->formatUser($account),
            'token' => $token,
            'token_type' => 'Bearer',
        ]);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate(['email' => 'required|email']);

        // TODO: send reset link email (e.g. Laravel password reset)
        return response()->json(['message' => 'If an account exists with that email, you will receive a reset link.']);
    }

    public function user(Request $request): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user()->load('handle', 'localAuth');

        return response()->json(['user' => $this->formatUser($account)]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out']);
    }

    private function formatUser(Account $account): array
    {
        $handle = $account->relationLoaded('handle') ? $account->handle : $account->handle()->first();
        $displayName = $handle ? $handle->display_name : '';
        $roleNames = $account->roles()->pluck('roles.name')->values()->all();
        $isAdmin = in_array('admin', $roleNames, true);

        return [
            'account_id' => $account->account_id,
            'public_id' => (string) $account->public_id,
            'username' => $handle?->username ?? '',
            'tag' => $handle?->tag ?? 0,
            'display_name' => $displayName,
            'email' => $account->relationLoaded('localAuth') ? $account->localAuth?->email : $account->localAuth()->value('email'),
            'roles' => $roleNames,
            'is_admin' => $isAdmin,
            'wallet_summary' => $this->walletSummary->forAccountId((int) $account->account_id),
        ];
    }
}
