<?php

namespace App\Services;

use App\Enums\ActionCounter;

final class RunningService
{
    public const SPORT = 'running';

    public const FAST_400_MS = 52000;

    public function __construct(private readonly ActionCounterService $counters) {}

    /**
     * @param  array<string, string|int>  $settings
     * @param  list<array{accountId: int, result: string, timeMs?: int|null}>  $players
     */
    public function countRace(array $settings, array $players): void
    {
        $distance = (int) ($settings['distanceM'] ?? 0);
        foreach ($players as $player) {
            if ($player['result'] !== 'finished') {
                continue;
            }
            $this->counters->bump($player['accountId'], ActionCounter::RacesRun);
            $time = $player['timeMs'] ?? null;
            if ($distance === 400 && $time !== null && $time < self::FAST_400_MS) {
                $this->counters->bump($player['accountId'], ActionCounter::Fast400Runs);
            }
        }
    }
}
