<?php

namespace App\Services;

use App\Enums\ActionCounter;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class SportsDiveService
{
    public const COUNTED_BOARD = 'platform_5m';

    public const DIVES_PER_DAY = 10;

    public function __construct(private readonly ActionCounterService $counters) {}

    /** @return array{counted: bool} */
    public function platformDive(int $accountId, string $ref, CarbonImmutable $now): array
    {
        return DB::transaction(function () use ($accountId, $ref, $now): array {
            DB::table('accounts')->where('account_id', $accountId)->lockForUpdate()->first(['account_id']);
            $day = $now->setTimezone(SportsMatchService::DAY_TIMEZONE)->format('Y-m-d');
            $key = "{$day}:{$ref}";
            $keys = DB::table('account_counter_keys')
                ->where('account_id', $accountId)
                ->where('counter', ActionCounter::PlatformDives->value);
            if ((clone $keys)->where('key', $key)->exists()) {
                return ['counted' => true];
            }
            if ($keys->where('key', 'like', "{$day}:%")->count() >= self::DIVES_PER_DAY) {
                return ['counted' => false];
            }
            $this->counters->bumpOncePerKey($accountId, ActionCounter::PlatformDives, $key);

            return ['counted' => true];
        });
    }
}
