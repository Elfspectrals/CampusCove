<?php

namespace App\Http\Controllers;

use App\Services\FarmService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class FarmController extends Controller
{
    public function __construct(private readonly FarmService $farm) {}

    public function pick(Request $request): JsonResponse
    {
        $validated = $request->validate(['crop' => ['required', 'string', Rule::in(array_keys(FarmService::CROPS))]]);

        return response()->json($this->farm->pick((int) $request->user()->getAuthIdentifier(), $validated['crop']));
    }
}
