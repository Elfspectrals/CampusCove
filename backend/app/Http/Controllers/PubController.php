<?php

namespace App\Http\Controllers;

use App\Services\PubService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PubController extends Controller
{
    public function __construct(private readonly PubService $pub)
    {
    }

    public function order(Request $request): JsonResponse
    {
        $validated = $request->validate(['code' => 'required|string|max:64']);

        return response()->json($this->pub->order($this->accountId($request), $validated['code']));
    }

    public function play(Request $request): JsonResponse
    {
        $validated = $request->validate(['game' => 'required|string|max:32']);

        return response()->json($this->pub->play($this->accountId($request), $validated['game']));
    }

    public function reward(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'game' => 'required|string|max:32',
            'placement' => 'required|integer|min:0|max:3',
            'score' => 'required|integer|min:0',
        ]);

        return response()->json($this->pub->reward(
            $this->accountId($request),
            $validated['game'],
            (int) $validated['placement'],
            (int) $validated['score'],
        ));
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
