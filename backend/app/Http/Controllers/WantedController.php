<?php

namespace App\Http\Controllers;

use App\Services\WantedService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class WantedController extends Controller
{
    public function __construct(private readonly WantedService $wanted) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json(['wanted' => $this->wanted->state($this->accountId($request))]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'stars' => 'required|integer|min:0|max:'.WantedService::MAX_STARS,
            'decay_ms' => 'required|integer|min:1|max:'.WantedService::DECAY_MS,
        ]);

        return response()->json([
            'wanted' => $this->wanted->save($this->accountId($request), (int) $validated['stars'], (int) $validated['decay_ms']),
        ]);
    }

    public function record(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'kind' => ['required', 'string', Rule::in(WantedService::CRIME_KINDS)],
            'stars' => 'required|integer|min:1|max:'.WantedService::MAX_STARS,
            'victim_account_id' => 'sometimes|nullable|integer|exists:accounts,account_id',
        ]);
        $victim = isset($validated['victim_account_id']) ? (int) $validated['victim_account_id'] : null;
        $this->wanted->record($this->accountId($request), $validated['kind'], (int) $validated['stars'], $victim);

        return response()->json(['recorded' => true], 201);
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
