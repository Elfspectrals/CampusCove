<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Services\CharacterAppearanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CharacterAppearanceController extends Controller
{
    public function show(Request $request, CharacterAppearanceService $appearance): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();

        return response()->json($appearance->get((int) $account->getAuthIdentifier()));
    }

    public function update(Request $request, CharacterAppearanceService $appearance): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();
        $validated = $request->validate([
            'sex' => ['required', 'string', Rule::in(CharacterAppearanceService::SEXES)],
            'face' => ['required', 'integer', 'between:1,'.CharacterAppearanceService::FACE_COUNT],
            'build' => ['required', 'string', Rule::in(CharacterAppearanceService::BUILDS)],
            'hair' => ['required', 'string', Rule::in(array_keys(CharacterAppearanceService::HAIRCUTS))],
            'skin_color' => ['required', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'hair_color' => ['required', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);

        return response()->json($appearance->save((int) $account->getAuthIdentifier(), [
            'sex' => $validated['sex'],
            'face' => (int) $validated['face'],
            'build' => $validated['build'],
            'hair' => $validated['hair'],
            'skin_color' => $validated['skin_color'],
            'hair_color' => $validated['hair_color'],
        ]));
    }
}
