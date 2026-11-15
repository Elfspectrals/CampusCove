<?php

namespace App\Http\Controllers;

use App\Services\DanceService;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DanceController extends Controller
{
    private const ENDED_AT_CLOCK_SKEW_MS = 60_000;

    public function __construct(private readonly DanceService $dance) {}

    public function recordRuns(Request $request): JsonResponse
    {
        $strictInt = static function (string $attribute, mixed $value, Closure $fail): void {
            if (! is_int($value)) {
                $fail("The {$attribute} field must be an integer.");
            }
        };
        $strictBool = static function (string $attribute, mixed $value, Closure $fail): void {
            if (! is_bool($value)) {
                $fail("The {$attribute} field must be true or false.");
            }
        };
        $notInTheFuture = static function (string $attribute, mixed $value, Closure $fail): void {
            if (is_int($value) && $value > now()->getTimestampMs() + self::ENDED_AT_CLOCK_SKEW_MS) {
                $fail("The {$attribute} field is in the future.");
            }
        };
        $validated = $request->validate([
            'ref' => 'required|string|min:1|max:64',
            'song' => ['required', 'string', Rule::in(DanceService::SONGS)],
            'difficulty' => ['required', 'string', Rule::in(DanceService::DIFFICULTIES)],
            'mode' => ['required', 'string', Rule::in(DanceService::MODES)],
            'endedAt' => ['required', 'integer', $strictInt, 'min:0', $notInTheFuture],
            'teamScore' => ['present', 'nullable', 'integer', $strictInt, 'min:0', 'max:1000000'],
            'dancers' => 'required|array|min:1|max:4',
            'dancers.*' => 'required|array:accountId,score,fullCombo,finished',
            'dancers.*.accountId' => ['required', 'integer', $strictInt, 'distinct', 'exists:accounts,account_id'],
            'dancers.*.score' => ['required', 'integer', $strictInt, 'min:0', 'max:1000000'],
            'dancers.*.fullCombo' => ['required', 'boolean', $strictBool],
            'dancers.*.finished' => ['required', 'boolean', $strictBool],
        ]);

        return response()->json(['recorded' => $this->dance->recordRuns(
            $validated['ref'],
            $validated['song'],
            $validated['difficulty'],
            $validated['mode'],
            $validated['endedAt'],
            $validated['teamScore'],
            array_values($validated['dancers']),
        )]);
    }
}
