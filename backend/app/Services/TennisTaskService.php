<?php

namespace App\Services;

use App\Enums\ActionCounter;
use App\Models\Account;
use Illuminate\Support\Facades\DB;

final class TennisTaskService
{
    public const MATCHES_PER_DAY = 5;

    public const WHITEWASH_GAMES = 4;

    public function __construct(private readonly ActionCounterService $counters) {}

    /**
     * @param  array<string, string|int>  $settings
     * @param  list<array{accountId: int, team: string|null, result: string, score?: int|null}>  $players
     */
    public function matchRecorded(array $settings, array $players): void
    {
        $onCourt = array_values(array_filter($players, fn (array $p): bool => in_array($p['result'], ['win', 'loss'], true)));
        if (! $this->endedOnScore($onCourt) || ! $this->oldEnough($players)) {
            return;
        }
        $today = now(PlayerActivityService::DAY_TIMEZONE)->format('Y-m-d');
        foreach ($onCourt as $player) {
            $this->countMatch($player['accountId'], $today);
        }
        if (($settings['format'] ?? null) !== 'short_set_4') {
            return;
        }
        foreach ($onCourt as $player) {
            $opponents = array_values(array_filter($players, fn (array $other): bool => $other['team'] !== $player['team']));
            $whitewash = $player['result'] === 'win' && ($player['score'] ?? null) === self::WHITEWASH_GAMES
                && array_filter($opponents, fn (array $other): bool => ($other['score'] ?? null) !== 0) === [];
            if ($whitewash) {
                $lineUp = array_map(fn (array $other): int => $other['accountId'], $opponents);
                sort($lineUp);
                $this->counters->bumpOncePerKey($player['accountId'], ActionCounter::TennisWhitewashes, $today.':'.implode('-', $lineUp));
            }
        }
    }

    /** @param list<array{team: string|null, result: string}> $onCourt */
    private function endedOnScore(array $onCourt): bool
    {
        $teams = array_unique(array_map(fn (array $p): ?string => $p['team'], $onCourt));

        return count($teams) === 2 && ! in_array(null, $teams, true);
    }

    /** @param list<array{accountId: int}> $players */
    private function oldEnough(array $players): bool
    {
        $ids = array_map(fn (array $p): int => $p['accountId'], $players);

        return Account::query()->whereKey($ids)->where('created_at', '<=', now()->subHours(TradeService::MIN_GIVER_AGE_HOURS))->count() === count($ids);
    }

    private function countMatch(int $accountId, string $today): void
    {
        $countedToday = DB::table('account_counter_keys')
            ->where('account_id', $accountId)
            ->where('counter', ActionCounter::TennisMatches->value)
            ->where('key', 'like', $today.':%')
            ->count();
        if ($countedToday < self::MATCHES_PER_DAY) {
            $this->counters->bumpOncePerKey($accountId, ActionCounter::TennisMatches, $today.':'.($countedToday + 1));
        }
    }
}
