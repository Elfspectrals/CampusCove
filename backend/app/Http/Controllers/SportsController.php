<?php

namespace App\Http\Controllers;

use App\Services\RunningService;
use App\Services\BoxingWinService;
use App\Services\SportsBoardService;
use App\Services\SportsGearService;
use App\Services\SportsMatchService;
use App\Services\SportsPassService;
use App\Services\TennisTaskService;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class SportsController extends Controller
{
    public function __construct(
        private readonly SportsPassService $passes,
        private readonly SportsGearService $gear,
        private readonly SportsMatchService $matches,
        private readonly RunningService $running,
        private readonly SportsBoardService $boards,
        private readonly TennisTaskService $tennisTasks,
        private readonly BoxingWinService $boxingWins,
    ) {}

    public function pass(Request $request): JsonResponse
    {
        return response()->json(['pass' => $this->passes->state($this->accountId($request))]);
    }

    public function buyPass(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'kind' => 'required|string|max:16',
            'ref' => 'required|string|min:1|max:64',
        ]);

        return response()->json($this->passes->buy($this->accountId($request), $validated['kind'], $validated['ref']));
    }

    public function gear(Request $request): JsonResponse
    {
        return response()->json(['gear' => $this->gear->owned($this->accountId($request))]);
    }

    public function recordMatch(Request $request): JsonResponse
    {
        $strictInt = static function (string $attribute, mixed $value, Closure $fail): void {
            if (! is_int($value)) {
                $fail("The {$attribute} field must be an integer.");
            }
        };
        $settingValue = static function (string $attribute, mixed $value, Closure $fail): void {
            if (! is_int($value) && ! (is_string($value) && strlen($value) <= 64)) {
                $fail("The {$attribute} field must be an integer or a short string.");
            }
        };
        $validated = $request->validate([
            'ref' => 'required|string|min:1|max:64',
            'sport' => ['required', 'string', Rule::in(SportsMatchService::SPORTS)],
            'venue' => ['required', 'string', 'max:64', 'regex:/^[a-z0-9_]+$/'],
            'settings' => 'present|array',
            'settings.*' => [$settingValue],
            'startedAt' => ['required', 'integer', $strictInt, 'min:0'],
            'endedAt' => ['required', 'integer', $strictInt, 'gte:startedAt'],
            'players' => 'required|array|min:1|max:64',
            'players.*' => 'required|array:accountId,team,result,place,timeMs,score',
            'players.*.accountId' => ['required', 'integer', $strictInt, 'distinct', 'exists:accounts,account_id'],
            'players.*.team' => ['present', 'nullable', Rule::in(SportsMatchService::TEAMS)],
            'players.*.result' => ['required', Rule::in(SportsMatchService::RESULTS)],
            'players.*.place' => ['nullable', 'integer', $strictInt, 'min:1', 'max:64'],
            'players.*.timeMs' => ['nullable', 'integer', $strictInt, 'min:0', 'max:86400000'],
            'players.*.score' => ['nullable', 'integer', $strictInt, 'min:-1000000', 'max:1000000'],
        ]);

        $players = array_values($validated['players']);
        $match = DB::transaction(function () use ($validated, $players): array {
            $match = $this->matches->record(
                $validated['ref'],
                $validated['sport'],
                $validated['venue'],
                $validated['settings'],
                $validated['startedAt'],
                $validated['endedAt'],
                $players,
            );
            if ($match['recorded'] && $match['countsForTasks'] && $validated['sport'] === RunningService::SPORT) {
                $this->running->countRace($validated['settings'], $players);
            }
            if ($match['recorded'] && $match['countsForTasks'] && $validated['sport'] === 'tennis') {
                $this->tennisTasks->matchCounted($validated['settings'], $players);
            }
            if ($match['recorded'] && $match['countsForTasks']) {
                $this->boxingWins->count($validated['sport'], $validated['endedAt'], $players);
            }

            return $match;
        });

        return response()->json(['match' => $match]);
    }

    public function board(string $board): JsonResponse
    {
        abort_unless(array_key_exists($board, SportsBoardService::BOARDS), 404);

        return response()->json(['board' => $this->boards->board($board)]);
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
