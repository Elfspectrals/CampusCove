<?php

namespace App\Http\Controllers;

use App\Services\PoliceBountyService;
use App\Services\PoliceLicenceService;
use App\Services\WantedService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PoliceController extends Controller
{
    public function __construct(
        private readonly PoliceLicenceService $licences,
        private readonly PoliceBountyService $bounties,
    ) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json(['licence' => $this->licences->state($this->accountId($request))]);
    }

    public function buy(Request $request): JsonResponse
    {
        return response()->json(['licence' => $this->licences->buy($this->accountId($request))]);
    }

    public function bounty(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'suspect_account_id' => 'required|integer|exists:accounts,account_id',
            'stars' => 'required|integer|min:1|max:'.WantedService::MAX_STARS,
            'ref' => 'required|string|max:100',
        ]);

        return response()->json(['bounty' => $this->bounties->pay(
            $this->accountId($request),
            (int) $validated['suspect_account_id'],
            (int) $validated['stars'],
            $validated['ref'],
        )]);
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
