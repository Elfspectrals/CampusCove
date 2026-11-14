<?php

namespace App\Http\Controllers;

use App\Services\SkatingBoardService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;

class SkatingBoardController extends Controller
{
    public function __construct(private readonly SkatingBoardService $boards) {}

    public function show(): JsonResponse
    {
        return response()->json($this->boards->overview(CarbonImmutable::now()));
    }
}
