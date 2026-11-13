<?php

namespace App\Services;

use App\Exceptions\TutorialRejectedException;
use App\Models\AccountTutorial;
use Illuminate\Support\Facades\DB;

final class TutorialService
{
    /** @var list<string> */
    public const STEPS = ['pick_apples', 'eat_apple', 'sell_apples', 'deposit_cash', 'play_darts'];

    public function start(int $accountId): void
    {
        AccountTutorial::query()->insertOrIgnore([
            'account_id' => $accountId,
            'step' => self::STEPS[0],
            'status' => 'active',
        ]);
    }

    /**
     * @return array{status: 'none'|'active'|'skipped'|'done', step: string|null}
     */
    public function get(int $accountId): array
    {
        $tutorial = AccountTutorial::query()->find($accountId);
        if ($tutorial === null) {
            return ['status' => 'none', 'step' => null];
        }

        return [
            'status' => $tutorial->status,
            'step' => $tutorial->status === 'done' ? null : $tutorial->step,
        ];
    }

    /**
     * @return array{status: 'none'|'active'|'skipped'|'done', step: string|null}
     */
    public function skip(int $accountId): array
    {
        return $this->switchStatus($accountId, from: 'active', to: 'skipped');
    }

    /**
     * @return array{status: 'none'|'active'|'skipped'|'done', step: string|null}
     */
    public function resume(int $accountId): array
    {
        return $this->switchStatus($accountId, from: 'skipped', to: 'active');
    }

    /**
     * @return array{status: 'none'|'active'|'skipped'|'done', step: string|null}
     */
    private function switchStatus(int $accountId, string $from, string $to): array
    {
        DB::transaction(function () use ($accountId, $from, $to): void {
            $tutorial = AccountTutorial::query()->lockForUpdate()->find($accountId);
            if ($tutorial === null) {
                throw new TutorialRejectedException('tutorial_none', 'There is no tutorial for this account.', 409);
            }
            if ($tutorial->status === $to) {
                return;
            }
            if ($tutorial->status !== $from) {
                throw new TutorialRejectedException('tutorial_'.$tutorial->status, 'The tutorial is already finished.', 409);
            }
            $tutorial->update(['status' => $to]);
        });

        return $this->get($accountId);
    }
}
