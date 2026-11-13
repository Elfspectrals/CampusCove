<?php

namespace App\Services;

use App\Exceptions\PubRejectedException;
use App\Models\Account;
use App\Models\PubQuizWin;
use Illuminate\Support\Facades\DB;

final class PubQuizService
{
    public const QUESTION_COUNT = 15;

    public const MIN_ANSWERS = 12;

    public const MIN_VALID_CONTESTANTS = 2;

    public const COINS_PER_EXTRA_CONTESTANT = 8;

    public const MAX_COINS = 120;

    public const PINT_HOURS = 24;

    public const PINT_CODES = ['drink_stout', 'drink_lager'];

    public const REWARD_REASON = 'pub_reward_quiz';

    public function __construct(private readonly CoinRewardService $coinRewards) {}

    public static function prizeCoins(int $validContestants): int
    {
        if ($validContestants < self::MIN_VALID_CONTESTANTS) {
            return 0;
        }

        return min(self::MAX_COINS, self::COINS_PER_EXTRA_CONTESTANT * ($validContestants - 1));
    }

    /**
     * @param  list<array{account_id: int, answered: int}>  $contestants
     * @return array{coins: int, pint: bool, valid_contestants: int}
     */
    public function rewardWinner(int $winnerAccountId, string $quizId, array $contestants): array
    {
        $accountIds = array_column($contestants, 'account_id');
        if (! in_array($winnerAccountId, $accountIds, true)) {
            throw new PubRejectedException('quiz_not_contestant', 'The winner must be one of the contestants.');
        }

        return DB::transaction(function () use ($winnerAccountId, $quizId, $contestants, $accountIds): array {
            $existing = PubQuizWin::query()->where('quiz_id', $quizId)->lockForUpdate()->first();
            if ($existing !== null) {
                return $this->summary($existing);
            }
            $valid = $this->validContestants($contestants, $accountIds);
            $coins = self::prizeCoins($valid);
            $win = PubQuizWin::query()->create([
                'quiz_id' => $quizId,
                'account_id' => $winnerAccountId,
                'valid_contestants' => $valid,
                'coins' => $coins,
                'pint_expires_at' => $valid >= self::MIN_VALID_CONTESTANTS ? now()->addHours(self::PINT_HOURS) : null,
            ]);
            if ($coins > 0) {
                $this->coinRewards->creditCash($winnerAccountId, self::REWARD_REASON, $coins, ['quiz_id' => $quizId, 'valid_contestants' => $valid]);
            }

            return $this->summary($win);
        });
    }

    public function redeemPint(int $accountId, string $code): bool
    {
        if (! in_array($code, self::PINT_CODES, true)) {
            return false;
        }
        $win = PubQuizWin::query()
            ->where('account_id', $accountId)
            ->whereNull('pint_redeemed_at')
            ->where('pint_expires_at', '>', now())
            ->orderBy('pint_expires_at')
            ->lockForUpdate()
            ->first();
        if ($win === null) {
            return false;
        }
        $win->update(['pint_redeemed_at' => now()]);

        return true;
    }

    /**
     * @param  list<array{account_id: int, answered: int}>  $contestants
     * @param  list<int>  $accountIds
     */
    private function validContestants(array $contestants, array $accountIds): int
    {
        $oldEnough = Account::query()
            ->whereKey($accountIds)
            ->where('created_at', '<=', now()->subHours(TradeService::MIN_GIVER_AGE_HOURS))
            ->pluck('account_id')
            ->map(fn ($id): int => (int) $id)
            ->all();

        return count(array_filter(
            $contestants,
            fn (array $c): bool => $c['answered'] >= self::MIN_ANSWERS && in_array($c['account_id'], $oldEnough, true),
        ));
    }

    /** @return array{coins: int, pint: bool, valid_contestants: int} */
    private function summary(PubQuizWin $win): array
    {
        return ['coins' => $win->coins, 'pint' => $win->pint_expires_at !== null, 'valid_contestants' => $win->valid_contestants];
    }
}
