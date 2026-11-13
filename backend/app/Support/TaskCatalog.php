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
            'explorer' => ['counter' => ActionCounter::ZonesVisited, 'tiers' => [5, 10, 15]],
            'loyal' => ['counter' => ActionCounter::ActiveDays, 'tiers' => [7, 30, 100]],
            'market_gardener' => ['counter' => ActionCounter::FarmHarvests, 'tiers' => [100, 1000, 5000]],
            'trader' => ['counter' => ActionCounter::ItemsSoldToBuyers, 'tiers' => [50, 500, 2500]],
            'cook' => ['counter' => ActionCounter::DishesCooked, 'tiers' => [10, 100, 500]],
            'loyal_customer' => ['counter' => ActionCounter::ShopBaskets, 'tiers' => [10, 100, 300]],
            'dapper' => ['counter' => ActionCounter::ClothesBought, 'tiers' => [3, 10, 25]],
            'regular' => ['counter' => ActionCounter::PubOrderDays, 'tiers' => [3, 15, 50]],
            'pub_games' => ['counter' => ActionCounter::PubGames, 'tiers' => [10, 50, 150]],
            'duellist' => ['counter' => ActionCounter::DuelsWon, 'tiers' => [1, 5, 15]],
            'insider' => ['counter' => ActionCounter::SecretRoomWeeks, 'tiers' => [1, 4, 12]],
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
