<?php

namespace App\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class SportsMatchService
{
    public const SPORTS = ['football', 'basketball', 'swimming', 'diving', 'dance', 'boxing', 'climbing', 'skating', 'running', 'tennis', 'petanque'];

    public const TEAMS = ['red', 'blue'];

    public const RESULTS = ['win', 'loss', 'draw', 'finished', 'dnf'];

    /**
     * @param  array<string, string|int>  $settings
     * @param  list<array{accountId: int, team: string|null, result: string, place?: int|null, timeMs?: int|null, score?: int|null}>  $players
     * @return array{id: int, recorded: bool}
     */
    public function record(string $ref, string $sport, string $venue, array $settings, int $startedAtMs, int $endedAtMs, array $players): array
    {
        return DB::transaction(function () use ($ref, $sport, $venue, $settings, $startedAtMs, $endedAtMs, $players): array {
            $inserted = DB::table('sports_matches')->insertOrIgnore([
                'ref' => $ref,
                'sport' => $sport,
                'venue' => $venue,
                'settings' => json_encode((object) $settings, JSON_THROW_ON_ERROR),
                'started_at' => CarbonImmutable::createFromTimestampMs($startedAtMs),
                'ended_at' => CarbonImmutable::createFromTimestampMs($endedAtMs),
            ]);
            $id = (int) DB::table('sports_matches')->where('ref', $ref)->value('id');
            if ($inserted === 0) {
                return ['id' => $id, 'recorded' => false];
            }
            DB::table('sports_match_players')->insert(array_map(fn (array $player): array => [
                'match_id' => $id,
                'account_id' => $player['accountId'],
                'team' => $player['team'],
                'result' => $player['result'],
                'place' => $player['place'] ?? null,
                'time_ms' => $player['timeMs'] ?? null,
                'score' => $player['score'] ?? null,
            ], $players));

            return ['id' => $id, 'recorded' => true];
        });
    }
}
