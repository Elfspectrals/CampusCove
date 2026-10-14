<?php

namespace App\Http\Controllers;

use App\Services\ReferralService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReferralController extends Controller
{
    /**
     * The player's referral code and the progress of the players they invited.
     */
    public function show(Request $request, ReferralService $referrals): JsonResponse
    {
        return response()->json($referrals->summaryFor((int) $request->user()->getAuthIdentifier()));
    }
}
