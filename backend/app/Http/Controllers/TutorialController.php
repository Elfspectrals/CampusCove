<?php

namespace App\Http\Controllers;

use App\Services\TutorialService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TutorialController extends Controller
{
    public function __construct(private readonly TutorialService $tutorial) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json($this->tutorial->get($this->accountId($request)));
    }

    public function skip(Request $request): JsonResponse
    {
        return response()->json($this->tutorial->skip($this->accountId($request)));
    }

    public function resume(Request $request): JsonResponse
    {
        return response()->json($this->tutorial->resume($this->accountId($request)));
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
