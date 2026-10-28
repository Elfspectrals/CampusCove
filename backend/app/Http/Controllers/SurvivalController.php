<?php

namespace App\Http\Controllers;

use App\Services\SurvivalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SurvivalController extends Controller
{
    public function __construct(private readonly SurvivalService $survival)
    {
    }

    public function show(Request $request): JsonResponse
    {
        return response()->json(['stats' => $this->survival->stats($this->accountId($request))]);
    }

    /** Realtime server only. */
    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'health' => 'required|numeric',
            'hunger' => 'required|numeric',
            'thirst' => 'required|numeric',
        ]);
        $stats = $this->survival->save(
            $this->accountId($request),
            (float) $validated['health'],
            (float) $validated['hunger'],
            (float) $validated['thirst'],
        );

        return response()->json(['stats' => $stats]);
    }

    /** Realtime server only. */
    public function consume(Request $request): JsonResponse
    {
        $validated = $request->validate(['code' => 'required|string|max:64']);

        return response()->json(['consumed' => $this->survival->consume($this->accountId($request), $validated['code'])]);
    }

    /** Realtime server only (it checks the player stands at a stove or a barbecue). */
    public function cook(Request $request): JsonResponse
    {
        $validated = $request->validate(['code' => 'required|string|max:64']);

        return response()->json(['cooked' => $this->survival->cook($this->accountId($request), $validated['code'])]);
    }

    /** Realtime server only. */
    public function hospital(Request $request): JsonResponse
    {
        return response()->json($this->survival->billHospital($this->accountId($request)));
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
