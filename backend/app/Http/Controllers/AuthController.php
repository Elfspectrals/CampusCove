<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Models\AccountAuthLocal;
use App\Models\AccountHandle;
use App\Services\StarterCosmeticGrantService;
use App\Services\WalletSummaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Mail\Message;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class AuthController extends Controller
{
    private const PASSWORD_RESET_MESSAGE = 'If an account exists with that email, you will receive a reset link.';

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

        $account = DB::transaction(function () use ($validated, $normalized, $tag): Account {
            $account = Account::create(['status' => 'active']);
            $accountId = (int) $account->getKey();
            DB::table('password_reset_tokens')
                ->where('email', $validated['email'])
                ->delete();
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
            app(StarterCosmeticGrantService::class)->ensureStarterCosmeticsForAccount($accountId);

            return $account;
        });

        $account->load('handle', 'localAuth');

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
        if ($account->status !== 'active') {
            $account->tokens()->delete();

            return response()->json([
                'message' => 'Account is disabled.',
                'code' => 'account_disabled',
            ], 403);
        }
        if ($account->banned_at !== null) {
            $account->tokens()->delete();

            return response()->json([
                'message' => 'Account is banned.',
                'code' => 'account_banned',
            ], 403);
        }
        if ($account->suspended_until !== null && $account->suspended_until->isFuture()) {
            $account->tokens()->delete();

            return response()->json([
                'message' => 'Account is suspended.',
                'code' => 'account_suspended',
                'suspended_until' => $account->suspended_until->toIso8601String(),
            ], 403);
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
        $validated = $request->validate(['email' => 'required|email']);
        $localAuth = AccountAuthLocal::query()
            ->where('email', $validated['email'])
            ->first();

        if ($localAuth !== null) {
            $token = Str::random(64);
            DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => $localAuth->email],
                [
                    'token' => hash('sha256', $token),
                    'created_at' => now(),
                ],
            );

            $frontendUrl = rtrim((string) config('app.frontend_url'), '/');
            $resetUrl = $frontendUrl.'/reset-password?'.http_build_query([
                'token' => $token,
                'email' => $localAuth->email,
            ]);
            $expiryMinutes = (int) config('auth.passwords.users.expire', 60);

            try {
                Mail::raw(
                    "Use this link to reset your CampusCove password:\n\n{$resetUrl}\n\nThis link expires in {$expiryMinutes} minutes.",
                    function (Message $message) use ($localAuth): void {
                        $message
                            ->to((string) $localAuth->email)
                            ->subject('Reset your CampusCove password');
                    },
                );
            } catch (Throwable $error) {
                Log::error('auth.password_reset_delivery_failed', [
                    'account_id' => (int) $localAuth->account_id,
                    'error' => $error->getMessage(),
                ]);
            }
        }

        return response()->json(['message' => self::PASSWORD_RESET_MESSAGE]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'token' => ['required', 'string', 'size:64'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $localAuth = AccountAuthLocal::query()
            ->where('email', $validated['email'])
            ->first();
        $reset = $localAuth !== null
            ? DB::table('password_reset_tokens')->where('email', $localAuth->email)->first()
            : null;
        $expiryMinutes = (int) config('auth.passwords.users.expire', 60);
        $createdAt = $reset?->created_at !== null ? Carbon::parse($reset->created_at) : null;
        $isValid = $localAuth !== null
            && $reset !== null
            && is_string($reset->token)
            && hash_equals($reset->token, hash('sha256', $validated['token']))
            && $createdAt !== null
            && $createdAt->greaterThanOrEqualTo(now()->subMinutes($expiryMinutes));

        if (! $isValid || $localAuth === null) {
            throw ValidationException::withMessages([
                'token' => ['This password reset link is invalid or has expired.'],
            ]);
        }

        DB::transaction(function () use ($localAuth, $validated): void {
            $localAuth->update([
                'password_hash' => Hash::make($validated['password']),
            ]);
            $localAuth->account()->first()?->tokens()->delete();
            DB::table('password_reset_tokens')->where('email', $localAuth->email)->delete();
        });

        return response()->json([
            'message' => 'Password reset successfully. You can now sign in.',
        ]);
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
        $isAdmin = (bool) $account->is_admin;

        return [
            'account_id' => $account->account_id,
            'public_id' => (string) $account->public_id,
            'username' => $handle?->username ?? '',
            'tag' => $handle?->tag ?? 0,
            'display_name' => $displayName,
            'email' => $account->relationLoaded('localAuth') ? $account->localAuth?->email : $account->localAuth()->value('email'),
            'roles' => $roleNames,
            'is_admin' => $isAdmin,
            'suspended_until' => $account->suspended_until?->toIso8601String(),
            'banned_at' => $account->banned_at?->toIso8601String(),
            'wallet_summary' => $this->walletSummary->forAccountId((int) $account->account_id),
        ];
    }
}
