<?php

namespace App\Http\Controllers;

use App\Services\JobToolService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class JobToolController extends Controller
{
    public function __construct(private readonly JobToolService $tools) {}

    public function hold(Request $request): JsonResponse
    {
        return response()->json($this->tools->hold($this->accountId($request), $this->code($request)));
    }

    public function wear(Request $request): JsonResponse
    {
        return response()->json($this->tools->wear($this->accountId($request), $this->code($request)));
    }

    private function code(Request $request): string
    {
        return (string) $request->validate(['code' => 'required|string|max:64'])['code'];
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
