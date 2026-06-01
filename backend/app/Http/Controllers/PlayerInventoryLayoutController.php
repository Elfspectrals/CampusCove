<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Models\AccountInventoryLayout;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

class PlayerInventoryLayoutController extends Controller
{
    private const SLOT_COUNT = 36;

    public function show(Request $request): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user();
        $accountId = (int) $account->getAuthIdentifier();

        try {
            $row = AccountInventoryLayout::query()->where('account_id', $accountId)->first();
        } catch (Throwable $e) {
            Log::warning('inventory.layout.show failed, returning defaults', [
                'account_id' => $accountId,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'layout' => $this->defaultLayoutPayload(),
            ]);
        }

        if ($row === null) {
            return response()->json([
                'layout' => $this->defaultLayoutPayload(),
            ]);
        }

        return response()->json([
            'layout' => [
                'slots' => $this->normalizeSlotsForResponse($row->slots),
                'selected_hotbar_index' => (int) $row->selected_hotbar_index,
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'slots' => ['required', 'array', 'size:'.self::SLOT_COUNT],
            'slots.*' => ['nullable', 'string', 'max:160'],
            'selected_hotbar_index' => ['required', 'integer', 'min:0', 'max:8'],
        ]);

        /** @var Account $account */
        $account = $request->user();
        $accountId = (int) $account->getAuthIdentifier();

        $sanitizedSlots = [];
        foreach ($validated['slots'] as $slot) {
            $trimmed = trim((string) ($slot ?? ''));
            $sanitizedSlots[] = strlen($trimmed) > 160 ? substr($trimmed, 0, 160) : $trimmed;
        }

        AccountInventoryLayout::updateOrCreate(
            ['account_id' => $accountId],
            [
                'slots' => $sanitizedSlots,
                'selected_hotbar_index' => $validated['selected_hotbar_index'],
            ],
        );

        return response()->json(['ok' => true]);
    }

    /**
     * @return array{slots: array<int,string>, selected_hotbar_index: int}
     */
    private function defaultLayoutPayload(): array
    {
        return [
            'slots' => array_fill(0, self::SLOT_COUNT, ''),
            'selected_hotbar_index' => 0,
        ];
    }

    /**
     * @param  mixed  $slots
     * @return array<int,string>
     */
    private function normalizeSlotsForResponse($slots): array
    {
        $out = [];
        if (is_array($slots)) {
            foreach ($slots as $slot) {
                $out[] = is_string($slot) ? $slot : '';
                if (count($out) >= self::SLOT_COUNT) {
                    break;
                }
            }
        }
        while (count($out) < self::SLOT_COUNT) {
            $out[] = '';
        }

        return $out;
    }
}
