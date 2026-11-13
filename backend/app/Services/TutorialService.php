<?php

namespace App\Services;

use App\Enums\ActionCounter;
use App\Exceptions\TutorialRejectedException;
use App\Models\AccountTutorial;
use Illuminate\Support\Facades\DB;

final class TutorialService
{
    /** @var list<string> */
    public const STEPS = ['pick_apples', 'eat_apple', 'sell_apples', 'deposit_cash', 'play_darts'];

    /** @var array<string, array{ActionCounter, int}> */
    private const GOALS = [
        'pick_apples' => [ActionCounter::ApplesPicked, 6],
        'eat_apple' => [ActionCounter::FoodEaten, 1],
        'sell_apples' => [ActionCounter::ApplesSold, 1],
        'deposit_cash' => [ActionCounter::AtmDeposits, 1],
        'play_darts' => [ActionCounter::DartsPlayed, 1],
    ];

    public function __construct(
        private readonly ActionCounterService $counters,
        private readonly BadgeService $badges,
        private readonly RealtimeNotifier $realtime,
    ) {}

    public function start(int $accountId): void
    {
        $step = self::STEPS[0];
        AccountTutorial::query()->insertOrIgnore([
            'account_id' => $accountId,
            'step' => $step,
            'status' => 'active',
            'step_baseline' => $this->counterAt($accountId, $step),
        ]);
    }

    public function isActiveAt(int $accountId, string $step): bool
    {
        return AccountTutorial::query()
            ->where('account_id', $accountId)
            ->where('status', 'active')
            ->where('step', $step)
            ->exists();
    }

    public function onCounterBumped(int $accountId, ActionCounter $counter, int $after): void
    {
        $moved = DB::transaction(function () use ($accountId, $counter, $after): bool {
            $tutorial = AccountTutorial::query()->lockForUpdate()->find($accountId);
            if ($tutorial === null || $tutorial->status !== 'active') {
                return false;
            }
            [$goalCounter, $goal] = self::GOALS[$tutorial->step];
            if ($goalCounter !== $counter || $after - $tutorial->step_baseline < $goal) {
                return false;
            }
            $next = self::STEPS[array_search($tutorial->step, self::STEPS, true) + 1] ?? null;
            if ($next === null) {
                $tutorial->update(['status' => 'done', 'completed_at' => now()]);
                $this->badges->grant($accountId, BadgeService::NEW_CITIZEN);
            } else {
                $tutorial->update(['step' => $next, 'step_baseline' => $this->counterAt($accountId, $next)]);
            }

            return true;
        });
        if ($moved) {
            $state = $this->get($accountId);
            $this->realtime->tutorialChanged($accountId, $state['status'], $state['step']);
        }
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
            $tutorial->update(['status' => $to, 'step_baseline' => $this->counterAt($accountId, $tutorial->step)]);
        });

        return $this->get($accountId);
    }

    private function counterAt(int $accountId, string $step): int
    {
        return $this->counters->value($accountId, self::GOALS[$step][0]);
    }
}
