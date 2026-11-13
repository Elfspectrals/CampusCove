<?php

namespace App\Http\Controllers;

use App\Services\CashDropService;
use App\Services\JailService;
use App\Services\PoliceLicenceService;
use App\Services\SurvivalService;
use App\Services\WantedService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SurvivalController extends Controller
{
    public function __construct(
        private readonly SurvivalService $survival,
        private readonly CashDropService $cashDrops,
        private readonly PoliceLicenceService $licences,
        private readonly JailService $jail,
    ) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json(['stats' => $this->survival->stats($this->accountId($request))]);
    }

    /** Realtime server only. */
    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'health' => 'required|numeric',
            'hunger' => 'required|numeric',
            'thirst' => 'required|numeric',
        ]);
        $stats = $this->survival->save(
            $this->accountId($request),
            (float) $validated['health'],
            (float) $validated['hunger'],
            (float) $validated['thirst'],
        );

        return response()->json(['stats' => $stats]);
    }

    /** Realtime server only. */
    public function consume(Request $request): JsonResponse
    {
        $validated = $request->validate(['code' => 'required|string|max:64']);

        return response()->json(['consumed' => $this->survival->consume($this->accountId($request), $validated['code'])]);
    }

    /** Realtime server only (it checks the player stands at a stove or a barbecue). */
    public function cook(Request $request): JsonResponse
    {
        $validated = $request->validate(['code' => 'required|string|max:64']);

        return response()->json(['cooked' => $this->survival->cook($this->accountId($request), $validated['code'])]);
    }

    /** Realtime server only: the player passed out, so they pay the hospital and lose their belongings. */
    public function hospital(Request $request): JsonResponse
    {
        $accountId = $this->accountId($request);
        $validated = $request->validate([
            'killer_account_id' => 'nullable|integer|min:1|exists:accounts,account_id',
            'jailed' => 'sometimes|boolean',
            'jail_stars' => 'required_if_accepted:jailed|integer|min:0|max:'.WantedService::MAX_STARS,
        ]);
        $killer = $validated['killer_account_id'] ?? null;
        $bill = ($validated['jailed'] ?? false)
            ? $this->jail->billDeathInCell($accountId, (int) $validated['jail_stars'])
            : [...$this->survival->billHospital($accountId), 'jail_tax' => 0];

        return response()->json([
            ...$bill,
            'lost' => $this->survival->loseBelongings($accountId),
            'cash_drop' => $this->cashDrops->dropAtDeath($accountId, $killer === null ? null : (int) $killer),
            'licence_lost' => $this->licences->loseAtDeath($accountId),
        ]);
    }

    public function clinicHeal(Request $request): JsonResponse
    {
        return response()->json($this->survival->payClinicHeal($this->accountId($request)));
    }

    public function hangover(Request $request): JsonResponse
    {
        $accountId = $this->accountId($request);

        return response()->json([
            ...$this->survival->billHangover($accountId),
            'licence_lost' => $this->licences->loseAtDeath($accountId),
        ]);
    }

    private function accountId(Request $request): int
    {
        return (int) $request->user()->getAuthIdentifier();
    }
}
