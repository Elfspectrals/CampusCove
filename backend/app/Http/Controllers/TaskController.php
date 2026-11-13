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
