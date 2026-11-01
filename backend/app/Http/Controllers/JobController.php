<?php

namespace App\Http\Controllers;

use App\Services\JobService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Routes only the realtime server calls (middleware `realtime`), on behalf of the player whose token it sends. */
class JobController extends Controller
{
    public function __construct(private readonly JobService $jobs)
    {
    }

    public function start(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'job' => 'required|string|max:32',
            'building' => 'required|string|max:64',
            'station' => ['required', 'string', 'regex:/^[a-z0-9_]{1,64}$/'],
        ]);

        return response()->json($this->jobs->start(
            $this->accountId($request),
            $validated['job'],
            $validated['building'],
            $validated['station'],
        ), 201);
    }

    public function end(Request $request, int $shiftId): JsonResponse
    {
        $validated = $request->validate(['reason' => ['required', 'string', 'regex:/^[a-z_]{1,32}$/']]);

        return response()->json($this->jobs->end($this->accountId($request), $shiftId, $validated['reason']));
    }

    public function salary(Request $request, int $shiftId): JsonResponse
    {
        $validated = $request->validate(['period' => 'required|integer|min:1|max:1000000']);

        return response()->json($this->jobs->paySalary($this->accountId($request), $shiftId, (int) $validated['period']));
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
