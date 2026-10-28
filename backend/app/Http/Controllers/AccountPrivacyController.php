<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Services\AccountPrivacyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/** GDPR self-service for the logged-in player: data export, account deletion, acceptance of the terms. */
class AccountPrivacyController extends Controller
{
    public function __construct(private readonly AccountPrivacyService $privacy) {}

    public function export(Request $request): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();

        return response()->json($this->privacy->export($account), 200, [
            'Content-Disposition' => 'attachment; filename="campuscove-data.json"',
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    }

    public function destroy(Request $request): JsonResponse
    {
        $validated = $request->validate(['password' => 'required|string']);
        /** @var Account $account */
        $account = $request->user()->load('localAuth');

        if (! $account->localAuth || ! Hash::check($validated['password'], $account->localAuth->password_hash)) {
            throw ValidationException::withMessages(['password' => ['The password is incorrect.']]);
        }

        $this->privacy->anonymize($account);

        return response()->json(['message' => 'Account deleted.']);
    }

    /** Records the acceptance of the terms / privacy policy in force (asked again when they change). */
    public function acceptTerms(Request $request): JsonResponse
    {
        $request->validate(['accepted_terms' => 'accepted']);
        /** @var Account $account */
        $account = $request->user();
        $account->update(['terms_version' => AuthController::TERMS_VERSION, 'terms_accepted_at' => now()]);

        return response()->json(['terms_version' => AuthController::TERMS_VERSION]);
    }
}
