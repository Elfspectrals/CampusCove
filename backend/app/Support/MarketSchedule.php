<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Cache;

final class MarketSchedule
{
    public const TIMEZONE = 'Europe/Paris';

    public const DAY = CarbonInterface::SATURDAY;

    public const OPENS_AT = '15:00';

    public const CLOSES_AT = '17:00';

    public const OVERRIDE_CACHE_KEY = 'market.admin_override';

    /** @return array{open: bool, market_date: string, opens_at: CarbonImmutable, closes_at: CarbonImmutable} */
    public static function window(CarbonInterface $now): array
    {
        $override = Cache::get(self::OVERRIDE_CACHE_KEY);
        if ($override === null) {
            return self::plannedWindow($now);
        }
        $until = CarbonImmutable::parse($override['until'])->setTimezone(self::TIMEZONE);
        if ($override['open']) {
            return [
                'open' => true,
                'market_date' => $override['market_date'],
                'opens_at' => CarbonImmutable::parse($override['opens_at'])->setTimezone(self::TIMEZONE),
                'closes_at' => $until,
            ];
        }

        return ['open' => false] + self::plannedWindow($until);
    }

    public static function openNow(CarbonInterface $now, int $minutes): void
    {
        $current = self::window($now);
        $opensAt = CarbonImmutable::instance($now)->setTimezone(self::TIMEZONE);
        $planned = self::plannedWindow($now);
        $until = $opensAt->addMinutes($minutes);
        if ($planned['open'] && $planned['closes_at'] > $until) {
            $until = $planned['closes_at'];
        }
        Cache::put(self::OVERRIDE_CACHE_KEY, [
            'open' => true,
            'market_date' => $current['open'] ? $current['market_date'] : $opensAt->toDateString(),
            'opens_at' => $current['open'] ? $current['opens_at']->toIso8601String() : $opensAt->toIso8601String(),
            'until' => $until->toIso8601String(),
        ], $until);
    }

    public static function closeNow(CarbonInterface $now): void
    {
        Cache::forget(self::OVERRIDE_CACHE_KEY);
        $planned = self::plannedWindow($now);
        if ($planned['open']) {
            Cache::put(self::OVERRIDE_CACHE_KEY, [
                'open' => false,
                'until' => $planned['closes_at']->toIso8601String(),
            ], $planned['closes_at']);
        }
    }

    /** @return array{open: bool, market_date: string, opens_at: CarbonImmutable, closes_at: CarbonImmutable} */
    private static function plannedWindow(CarbonInterface $now): array
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
