<?php

namespace App\Services;

use App\Enums\ActionCounter;

final class TennisTaskService
{
    public const WHITEWASH_GAMES = 4;

    private const PLAYED = ['win', 'loss'];

    public function __construct(private readonly ActionCounterService $counters) {}

    /**
     * @param  array<string, string|int>  $settings
     * @param  list<array{accountId: int, team: string|null, result: string, score?: int|null}>  $players
     */
    public function matchCounted(array $settings, array $players): void
    {
        foreach ($players as $player) {
            if (! in_array($player['result'], self::PLAYED, true)) {
                continue;
            }
            $this->counters->bump($player['accountId'], ActionCounter::TennisMatches);
            if ($this->whitewash($settings, $player, $players)) {
                $this->counters->bump($player['accountId'], ActionCounter::TennisWhitewashes);
            }
        }
    }

    /**
     * @param  array<string, string|int>  $settings
     * @param  array{team: string|null, result: string, score?: int|null}  $player
     * @param  list<array{team: string|null, score?: int|null}>  $players
     */
    private function whitewash(array $settings, array $player, array $players): bool
    {
        if (($settings['format'] ?? null) !== 'short_set_4' || $player['result'] !== 'win' || ($player['score'] ?? null) !== self::WHITEWASH_GAMES) {
            return false;
        }
        $opponents = array_filter($players, fn (array $other): bool => $other['team'] !== $player['team']);

        return $opponents !== [] && array_filter($opponents, fn (array $other): bool => ($other['score'] ?? null) !== 0) === [];
    }
}
