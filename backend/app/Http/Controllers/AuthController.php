<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Models\AccountAuthLocal;
use App\Models\AccountHandle;
use App\Services\AccountMailer;
use App\Services\ReferralService;
use App\Services\StarterCosmeticGrantService;
use App\Services\WalletSummaryService;
use App\Services\WelcomeBonusService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /** Version of the terms / privacy policy in force; keep in sync with SITE.legalVersion in the front (asked again at login when it changes). */
    public const TERMS_VERSION = '2026-10-28';

    public function __construct(
        private readonly WalletSummaryService $walletSummary,
    ) {
    }

    public function register(Request $request): JsonResponse
    {
        $request->merge(['username' => AccountHandle::cleanUsername($request->input('username'))]);
        $validated = $request->validate([
            'email' => 'required|email|unique:account_auth_local,email',
            'username' => ['required', ...AccountHandle::usernameRules()],
            // one field with a show / hide toggle in the front, no confirmation field
            'password' => 'required|string|min:8',
            'referral_code' => 'nullable|string|max:12',
            // GDPR proof of consent + minimum age (15, French digital majority)
            'accepted_terms' => 'accepted',
            'age_confirmed' => 'accepted',
        ], [
            'email.unique' => 'An account already uses this e-mail. Sign in instead.',
            'username.regex' => 'Invisible or control characters are not allowed.',
            'accepted_terms.accepted' => 'Accept the terms to create your account.',
            'age_confirmed.accepted' => 'Confirm your age to create your account.',
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
            Account::create([
                'status' => 'active',
                'terms_version' => self::TERMS_VERSION,
                'terms_accepted_at' => now(),
                'age_confirmed_at' => now(),
            ]);
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
        app(WelcomeBonusService::class)->grantOnce((int) $account->account_id);
        app(ReferralService::class)->attachReferrer((int) $account->account_id, $validated['referral_code'] ?? null);

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

        // a login cancels a pending inactivity notice (AccountPrivacyService::purgeInactive)
        $account->update(['last_login_at' => now(), 'inactivity_warned_at' => null]);
        // the account-age condition becomes true with time, without any other event
        app(ReferralService::class)->checkQualification((int) $account->account_id);
        $account->tokens()->delete();
        $token = $account->createToken('auth')->plainTextToken;

        return response()->json([
            'user' => $this->formatUser($account),
            'token' => $token,
            'token_type' => 'Bearer',
        ]);
    }

    /** Minutes a password reset link stays valid. */
    public const RESET_TOKEN_MINUTES = 60;

    /**
     * E-mails a one-time reset link. Only the SHA-256 of the token is stored, and the link carries the token alone
     * (no e-mail address in the URL). The answer is the same whether the account exists or not.
     */
    public function forgotPassword(Request $request, AccountMailer $mailer): JsonResponse
    {
        $validated = $request->validate(['email' => 'required|email']);
        $auth = AccountAuthLocal::where('email', $validated['email'])->first();
        $account = $auth ? Account::find($auth->account_id) : null;

        if ($auth && $account && $account->anonymized_at === null && $account->banned_at === null) {
            $token = Str::random(64);
            DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => $auth->email],
                ['token' => hash('sha256', $token), 'created_at' => now()],
            );
            $link = rtrim((string) config('app.frontend_url'), '/').'/reset-password?token='.$token;
            $minutes = self::RESET_TOKEN_MINUTES;
            $mailer->send(
                (int) $auth->account_id,
                'Réinitialisation du mot de passe / Password reset',
                "Pour choisir un nouveau mot de passe, ouvre ce lien (valable {$minutes} minutes) : {$link}\nSi tu n’es pas à l’origine de cette demande, ignore cet e-mail.",
                "To choose a new password, open this link (valid for {$minutes} minutes): {$link}\nIf you did not ask for this, ignore this e-mail.",
            );
        }

        return response()->json(['message' => 'If an account exists with that email, you will receive a reset link.']);
    }

    /** Sets a new password from a reset link, then signs every session out. */
    public function resetPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'token' => 'required|string|size:64',
            'password' => 'required|string|min:8',
        ]);
        $row = DB::table('password_reset_tokens')->where('token', hash('sha256', $validated['token']))->first();
        $valid = $row !== null && $row->created_at !== null
            && now()->subMinutes(self::RESET_TOKEN_MINUTES)->lessThan($row->created_at);
        if (! $valid) {
            throw ValidationException::withMessages(['token' => ['This reset link is invalid or has expired.']]);
        }

        $auth = AccountAuthLocal::where('email', $row->email)->firstOrFail();
        $auth->update(['password_hash' => Hash::make($validated['password'])]);
        DB::table('password_reset_tokens')->where('email', $row->email)->delete();
        Account::find($auth->account_id)?->tokens()->delete();

        return response()->json(['message' => 'Password updated. You can sign in.']);
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
            // false when the terms / privacy policy changed since the player accepted them: the front asks again
            'terms_current' => $account->terms_version === self::TERMS_VERSION,
            'wallet_summary' => $this->walletSummary->forAccountId((int) $account->account_id),
        ];
    }
}
