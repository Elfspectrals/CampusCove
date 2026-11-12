<?php

namespace App\Http\Controllers;

use App\Services\CashDropService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CashDropController extends Controller
{
    public function __construct(private readonly CashDropService $cashDrops) {}

    public function pick(Request $request, int $id): JsonResponse
    {
        return response()->json($this->cashDrops->pick($id, (int) $request->user()->getAuthIdentifier()));
    }
}
