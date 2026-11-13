<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

final class MarketSchedule
{
    public const TIMEZONE = 'Europe/Paris';

    public const DAY = CarbonInterface::SATURDAY;

    public const OPENS_AT = '15:00';

    public const CLOSES_AT = '17:00';

    /** @return array{open: bool, market_date: string, opens_at: CarbonImmutable, closes_at: CarbonImmutable} */
    public static function window(CarbonInterface $now): array
    {
        $local = CarbonImmutable::instance($now)->setTimezone(self::TIMEZONE);
        $day = $local->startOfDay();
        if (self::openAllDayForPlaytest()) {
            return ['open' => true, 'market_date' => $day->toDateString(), 'opens_at' => $day, 'closes_at' => $day->addDay()];
        }
        if ($day->dayOfWeek !== self::DAY || $local >= self::at($day, self::CLOSES_AT)) {
            $day = $day->next(self::DAY);
        }
        $opensAt = self::at($day, self::OPENS_AT);
        $closesAt = self::at($day, self::CLOSES_AT);

        return [
            'open' => $local >= $opensAt && $local < $closesAt,
            'market_date' => $day->toDateString(),
            'opens_at' => $opensAt,
            'closes_at' => $closesAt,
        ];
    }

    public static function openMarketDate(CarbonInterface $now): ?string
    {
        $window = self::window($now);

        return $window['open'] ? $window['market_date'] : null;
    }

    private static function openAllDayForPlaytest(): bool
    {
        return config('market.open_now_in_local') === true && app()->environment('local');
    }

    private static function at(CarbonImmutable $day, string $time): CarbonImmutable
    {
        [$hour, $minute] = array_map('intval', explode(':', $time));

        return $day->setTime($hour, $minute);
    }
}
