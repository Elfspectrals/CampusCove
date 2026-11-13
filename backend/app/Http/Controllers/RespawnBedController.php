<?php

namespace App\Http\Controllers;

use App\Services\RespawnBedService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RespawnBedController extends Controller
{
    public function __construct(private readonly RespawnBedService $beds) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json(['bed' => $this->beds->current((int) $request->user()->getAuthIdentifier())]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'owner_account_id' => ['required', 'integer', 'min:1'],
            'object_id' => ['required', 'string', 'max:64'],
        ]);

        return response()->json(['bed' => $this->beds->set((int) $request->user()->getAuthIdentifier(), (int) $validated['owner_account_id'], $validated['object_id'])]);
    }
}
