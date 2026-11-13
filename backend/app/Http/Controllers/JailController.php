<?php

namespace App\Http\Controllers;

use App\Services\JailService;
use App\Services\WantedService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class JailController extends Controller
{
    public function __construct(private readonly JailService $jail) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json(['jail' => $this->jail->sentence($this->accountId($request))]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'kind' => ['present', 'nullable', Rule::in([JailService::KIND_NPC, JailService::KIND_OFFICER])],
            'stars' => 'required|integer|min:0|max:'.WantedService::MAX_STARS,
            'ms_left' => 'required|integer|min:0|max:'.JailService::OFFICER_HOLD_MS,
        ]);
        $kind = $validated['kind'];
        $stars = (int) $validated['stars'];
        $msLeft = (int) $validated['ms_left'];
        $valid = match ($kind) {
            null => $stars === 0 && $msLeft === 0,
            JailService::KIND_NPC => $stars > 0 && $msLeft > 0 && $msLeft <= JailService::MAX_SENTENCE_MS,
            JailService::KIND_OFFICER => $stars === 0 && $msLeft > 0,
        };
        if (! $valid) {
            throw ValidationException::withMessages(['ms_left' => 'An NPC sentence has stars and up to 10 minutes, an officer hold no star and up to 15 minutes, freedom neither.']);
        }

        return response()->json(['jail' => $this->jail->save($this->accountId($request), $kind, $stars, $msLeft)]);
    }

    public function pay(Request $request): JsonResponse
    {
        $validated = $request->validate(['stars' => 'required|integer|min:1|max:'.WantedService::MAX_STARS]);

        return response()->json($this->jail->payFine($this->accountId($request), (int) $validated['stars']));
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
