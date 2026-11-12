<?php

namespace App\Http\Controllers;

use App\Services\BankService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BankController extends Controller
{
    private const MAX_AMOUNT = 1_000_000;

    public function __construct(private readonly BankService $bank) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json($this->bank->summary($this->accountId($request)));
    }

    public function deposit(Request $request): JsonResponse
    {
        return response()->json($this->bank->deposit($this->accountId($request), $this->amount($request), $this->ref($request)));
    }

    public function withdraw(Request $request): JsonResponse
    {
        return response()->json($this->bank->withdraw($this->accountId($request), $this->amount($request), $this->ref($request)));
    }

    public function transfer(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'username' => 'required|string|max:255',
            'tag' => 'required|integer|min:0|max:9999',
        ]);

        return response()->json($this->bank->transfer(
            $this->accountId($request),
            (string) $validated['username'],
            (int) $validated['tag'],
            $this->amount($request),
            $this->ref($request),
        ));
    }

    private function amount(Request $request): int
    {
        return (int) $request->validate(['amount' => 'required|integer|min:1|max:'.self::MAX_AMOUNT])['amount'];
    }

    private function ref(Request $request): string
    {
        return (string) $request->validate(['ref' => 'required|string|max:64'])['ref'];
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
