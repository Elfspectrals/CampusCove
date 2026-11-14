<?php

namespace App\Services;

use App\Enums\ActionCounter;
use Carbon\CarbonImmutable;

final class BoxingWinService
{
    public const SPORT = 'boxing';

    public function __construct(private readonly ActionCounterService $counters) {}

    /**
     * @param  list<array{accountId: int, result: string}>  $players
     */
    public function count(string $sport, int $endedAtMs, array $players): void
    {
        if ($sport !== self::SPORT || count($players) !== 2) {
            return;
        }
        $winners = array_values(array_filter($players, fn (array $p): bool => $p['result'] === 'win'));
        $losers = array_values(array_filter($players, fn (array $p): bool => $p['result'] === 'loss'));
        if (count($winners) !== 1 || count($losers) !== 1) {
            return;
        }
        $loser = $losers[0]['accountId'];
        $day = CarbonImmutable::createFromTimestampMs($endedAtMs)->setTimezone(PlayerActivityService::DAY_TIMEZONE)->toDateString();
        $this->counters->bumpOncePerKey($winners[0]['accountId'], ActionCounter::BoxingWins, "{$loser}:{$day}");
    }
}
