<?php

namespace App\Http\Controllers;

use App\Services\GymTaskService;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GymTaskController extends Controller
{
    public function __construct(private readonly GymTaskService $tasks) {}

    public function store(Request $request): JsonResponse
    {
        $strictInt = static function (string $attribute, mixed $value, Closure $fail): void {
            if (! is_int($value)) {
                $fail("The {$attribute} field must be an integer.");
            }
        };
        $validated = $request->validate([
            'ref' => 'required|string|min:1|max:64',
            'sport' => 'required|string|in:football,basketball',
            'players' => 'required|array|min:1|max:64',
            'players.*' => 'required|array:accountId,goals,threes',
            'players.*.accountId' => ['required', 'integer', $strictInt, 'distinct'],
            'players.*.goals' => ['required_if:sport,football', 'prohibited_unless:sport,football', 'integer', $strictInt, 'min:0', 'max:1000'],
            'players.*.threes' => ['required_if:sport,basketball', 'prohibited_unless:sport,basketball', 'integer', $strictInt, 'min:0', 'max:1000'],
        ]);

        return response()->json(['counted' => $this->tasks->countMatch($validated['ref'], $validated['sport'], array_values($validated['players']))]);
    }
}
