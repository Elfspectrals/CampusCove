<?php

namespace App\Services;

use App\Enums\ActionCounter;

final class PlayerActivityService
{
    public const DAY_TIMEZONE = 'Europe/Paris';

    public function __construct(private readonly ActionCounterService $counters) {}

    public function zoneVisited(int $accountId, string $zone): void
    {
        $this->counters->bumpOncePerKey($accountId, ActionCounter::ZonesVisited, $zone);
    }

    public function activeDay(int $accountId): void
    {
        $this->counters->bumpOncePerKey($accountId, ActionCounter::ActiveDays, now(self::DAY_TIMEZONE)->toDateString());
    }
}
