<?php

namespace App\Http\Controllers;

use App\Services\PetanqueTallyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PetanqueController extends Controller
{
    public function __construct(private readonly PetanqueTallyService $tallies) {}

    public function tally(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ref' => 'required|string|min:1|max:64',
            'carreaux' => 'required|integer|min:0|max:'.PetanqueTallyService::MAX_CARREAUX_PER_GAME,
        ]);
        $counted = $this->tallies->tally((int) $request->user()->getAuthIdentifier(), $validated['ref'], (int) $validated['carreaux']);

        return response()->json(['counted' => $counted]);
    }
}
