<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

final class WantedService
{
    public const CRIME_KINDS = ['assault', 'murder', 'bag_theft', 'pickpocket_seen', 'pickpocket_failed', 'lockpick', 'alarm'];

    public const MAX_STARS = 5;

    public const DECAY_MS = 240_000;

    /** @return array{stars: int, decay_ms: int} */
    public function state(int $accountId): array
    {
        $row = DB::table('account_wanted_levels')->where('account_id', $accountId)->first();

        return [
            'stars' => $row !== null ? (int) $row->stars : 0,
            'decay_ms' => $row !== null ? (int) $row->decay_ms : self::DECAY_MS,
        ];
    }

    /** @return array{stars: int, decay_ms: int} */
    public function save(int $accountId, int $stars, int $decayMs): array
    {
        DB::table('account_wanted_levels')->updateOrInsert(
            ['account_id' => $accountId],
            ['stars' => $stars, 'decay_ms' => $decayMs, 'updated_at' => now()]
        );

        return ['stars' => $stars, 'decay_ms' => $decayMs];
    }

    public function record(int $accountId, string $kind, int $stars, ?int $victimAccountId): void
    {
        DB::table('crime_records')->insert(['account_id' => $accountId, 'kind' => $kind, 'stars' => $stars, 'victim_account_id' => $victimAccountId]);
    }
}
