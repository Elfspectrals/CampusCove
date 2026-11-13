<?php

namespace App\Support;

use App\Enums\ActionCounter;

final class TaskCatalog
{
    /** @return array<string, array{counter: ActionCounter, tiers: list<int>}> */
    public static function tasks(): array
    {
        return [
            'orchard' => ['counter' => ActionCounter::ApplesPicked, 'tiers' => [100, 1000, 5000]],
            'darts' => ['counter' => ActionCounter::DartsPlayed, 'tiers' => [10, 50, 200]],
            'sharp_eye' => ['counter' => ActionCounter::DartsDuels80, 'tiers' => [1, 10, 50]],
            'gourmet' => ['counter' => ActionCounter::FoodsTasted, 'tiers' => [5, 15, 30]],
        ];
    }

    /** @return array<string, list<int>> */
    public static function tiersReading(ActionCounter $counter): array
    {
        $tiers = [];
        foreach (self::tasks() as $task => $definition) {
            if ($definition['counter'] === $counter) {
                $tiers[$task] = $definition['tiers'];
            }
        }

        return $tiers;
    }
}
