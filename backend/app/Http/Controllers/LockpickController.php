<?php

namespace App\Http\Controllers;

use App\Services\LockpickService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LockpickController extends Controller
{
    public function __construct(private readonly LockpickService $lockpicks) {}

    public function start(Request $request): JsonResponse
    {
        $validated = $request->validate(['unit_public_id' => ['required', 'string', 'max:64']]);

        return response()->json($this->lockpicks->start($this->accountId($request), $validated['unit_public_id']));
    }

    public function miss(Request $request, int $attemptId): JsonResponse
    {
        $validated = $request->validate(['miss' => ['required', 'integer', 'min:1', 'max:1000']]);

        return response()->json($this->lockpicks->miss($this->accountId($request), $attemptId, (int) $validated['miss']));
    }

    public function succeed(Request $request, int $attemptId): JsonResponse
    {
        $this->lockpicks->succeed($this->accountId($request), $attemptId);

        return response()->json(['ok' => true]);
    }

    public function fitReinforcedLock(Request $request): JsonResponse
    {
        $validated = $request->validate(['unit_public_id' => ['required', 'string', 'max:64']]);
        $this->lockpicks->fitReinforcedLock($this->accountId($request), $validated['unit_public_id']);

        return response()->json(['ok' => true]);
    }

    public function abandon(Request $request, int $attemptId): JsonResponse
    {
        $this->lockpicks->abandon($this->accountId($request), $attemptId);

        return response()->json(['ok' => true]);
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
