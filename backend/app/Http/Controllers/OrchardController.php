<?php

namespace App\Http\Controllers;

use App\Services\OrchardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrchardController extends Controller
{
    public function __construct(private readonly OrchardService $orchard) {}

    public function pick(Request $request): JsonResponse
    {
        return response()->json($this->orchard->pick($this->accountId($request)));
    }

    public function sell(Request $request): JsonResponse
    {
        $validated = $request->validate(['quantity' => 'required|integer|min:1']);

        return response()->json($this->orchard->sell($this->accountId($request), (int) $validated['quantity']));
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
