<?php

namespace App\Http\Controllers;

use App\Services\FurnitureStorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FurnitureStorageController extends Controller
{
    public function __construct(private readonly FurnitureStorageService $storages) {}

    public function open(Request $request): JsonResponse
    {
        $validated = $request->validate($this->target());

        return response()->json($this->storages->open($this->accountId($request), (int) $validated['owner_account_id'], $validated['object_id']));
    }

    public function deposit(Request $request): JsonResponse
    {
        $validated = $request->validate([...$this->target(), ...$this->move()]);

        return response()->json($this->storages->deposit($this->accountId($request), (int) $validated['owner_account_id'], $validated['object_id'], $validated['code'], (int) $validated['quantity']));
    }

    public function take(Request $request): JsonResponse
    {
        $validated = $request->validate([...$this->target(), ...$this->move()]);

        return response()->json($this->storages->take($this->accountId($request), (int) $validated['owner_account_id'], $validated['object_id'], $validated['code'], (int) $validated['quantity']));
    }

    /** @return array<string, list<string>> */
    private function target(): array
    {
        return [
            'owner_account_id' => ['required', 'integer', 'min:1'],
            'object_id' => ['required', 'string', 'max:64'],
        ];
    }

    /** @return array<string, list<string>> */
    private function move(): array
    {
        return [
            'code' => ['required', 'string', 'max:64'],
            'quantity' => ['required', 'integer', 'min:1', 'max:999'],
        ];
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
