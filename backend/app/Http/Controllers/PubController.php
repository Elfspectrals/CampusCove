<?php

namespace App\Http\Controllers;

use App\Services\PubQuizService;
use App\Services\PubService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PubController extends Controller
{
    public function __construct(
        private readonly PubService $pub,
        private readonly PubQuizService $quiz,
    ) {}

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

    public function quizReward(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'quiz_id' => 'required|string|max:128',
            'contestants' => 'required|array|min:1|max:64',
            'contestants.*.account_id' => 'required|integer|min:1|distinct',
            'contestants.*.answered' => 'required|integer|min:0|max:'.PubQuizService::QUESTION_COUNT,
        ]);
        $contestants = array_map(
            fn (array $c): array => ['account_id' => (int) $c['account_id'], 'answered' => (int) $c['answered']],
            $validated['contestants'],
        );

        return response()->json($this->quiz->rewardWinner($this->accountId($request), $validated['quiz_id'], $contestants));
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
