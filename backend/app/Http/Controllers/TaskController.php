<?php

namespace App\Http\Controllers;

use App\Services\PlayerActivityService;
use App\Services\TaskProgressService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    public function __construct(
        private readonly TaskProgressService $tasks,
        private readonly PlayerActivityService $activity,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['tasks' => $this->tasks->overview($this->accountId($request))]);
    }

    public function zoneVisited(Request $request): JsonResponse
    {
        $validated = $request->validate(['zone' => ['required', 'string', 'regex:/^[a-z0-9_]{1,40}$/']]);
        $this->activity->zoneVisited($this->accountId($request), (string) $validated['zone']);

        return response()->json(['ok' => true]);
    }

    public function pubGame(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'game' => 'required|string|in:drink_fast,meter_shot',
            'intoxication' => 'required|integer|min:0|max:100',
        ]);
        $this->activity->pubGamePlayed($this->accountId($request), (int) $validated['intoxication']);

        return response()->json(['ok' => true]);
    }

    public function skateRace(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'laps' => 'required|integer|in:1,3,5',
            'timeMs' => 'required|integer|min:1|max:600000',
            'penaltyMs' => 'required|integer|min:0|max:600000',
        ]);
        $this->activity->skateRaceFinished($this->accountId($request), (int) $validated['laps'], (int) $validated['timeMs'], (int) $validated['penaltyMs']);

        return response()->json(['ok' => true]);
    }

    public function secretRoom(Request $request): JsonResponse
    {
        $this->activity->secretRoomEntered($this->accountId($request));

        return response()->json(['ok' => true]);
    }

    public function activeDay(Request $request): JsonResponse
    {
        $this->activity->activeDay($this->accountId($request));

        return response()->json(['ok' => true]);
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
