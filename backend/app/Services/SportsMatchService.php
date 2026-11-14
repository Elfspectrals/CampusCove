<?php

namespace App\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class SportsMatchService
{
    public const SPORTS = ['football', 'basketball', 'swimming', 'diving', 'dance', 'boxing', 'climbing', 'skating', 'running', 'tennis', 'petanque'];

    public const TEAMS = ['red', 'blue'];

    public const RESULTS = ['win', 'loss', 'draw', 'finished', 'dnf'];

    public const TASK_MATCHES_PER_PAIR_PER_DAY = 3;

    public const DAY_TIMEZONE = 'Europe/Paris';

    /**
     * @param  array<string, string|int>  $settings
     * @param  list<array{accountId: int, team: string|null, result: string, place?: int|null, timeMs?: int|null, score?: int|null}>  $players
     * @return array{id: int, recorded: bool, countsForTasks: bool}
     */
    public function record(string $ref, string $sport, string $venue, array $settings, int $startedAtMs, int $endedAtMs, array $players): array
    {
        return DB::transaction(function () use ($ref, $sport, $venue, $settings, $startedAtMs, $endedAtMs, $players): array {
            $inserted = DB::table('sports_matches')->insertOrIgnore([
                'ref' => $ref,
                'sport' => $sport,
                'venue' => $venue,
                'settings' => json_encode((object) $settings, JSON_THROW_ON_ERROR),
                'started_at' => CarbonImmutable::createFromTimestampMs($startedAtMs)->toIso8601ZuluString('millisecond'),
                'ended_at' => CarbonImmutable::createFromTimestampMs($endedAtMs)->toIso8601ZuluString('millisecond'),
            ]);
            $match = DB::table('sports_matches')->where('ref', $ref)->first(['id', 'counts_for_tasks']);
            $id = (int) $match->id;
            if ($inserted === 0) {
                return ['id' => $id, 'recorded' => false, 'countsForTasks' => (bool) $match->counts_for_tasks];
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
            $countsForTasks = $this->countsForTasks($id, $sport, $endedAtMs, array_column($players, 'accountId'));
            DB::table('sports_matches')->where('id', $id)->update(['counts_for_tasks' => $countsForTasks]);

            return ['id' => $id, 'recorded' => true, 'countsForTasks' => $countsForTasks];
        });
    }

    /** @param list<int> $accountIds */
    private function countsForTasks(int $matchId, string $sport, int $endedAtMs, array $accountIds): bool
    {
        $eligible = DB::table('accounts')
            ->whereIn('account_id', $accountIds)
            ->where('created_at', '<=', now()->subHours(TradeService::MIN_GIVER_AGE_HOURS))
            ->orderBy('account_id')
            ->lockForUpdate()
            ->pluck('account_id')
            ->map(fn ($id): int => (int) $id)
            ->all();
        if (count($eligible) < 2) {
            return false;
        }
        $dayStart = CarbonImmutable::createFromTimestampMs($endedAtMs)->setTimezone(self::DAY_TIMEZONE)->startOfDay();
        $playedToday = DB::table('sports_match_players as p')
            ->join('sports_matches as m', 'm.id', '=', 'p.match_id')
            ->where('m.sport', $sport)
            ->where('m.counts_for_tasks', true)
            ->where('m.id', '<>', $matchId)
            ->where('m.ended_at', '>=', $dayStart->toIso8601String())
            ->where('m.ended_at', '<', $dayStart->addDay()->toIso8601String())
            ->whereIn('p.account_id', $eligible)
            ->get(['p.match_id', 'p.account_id'])
            ->groupBy('match_id')
            ->map(fn ($rows): array => $rows->pluck('account_id')->map(fn ($id): int => (int) $id)->all());

        foreach ($eligible as $i => $first) {
            foreach (array_slice($eligible, $i + 1) as $second) {
                $together = $playedToday->filter(fn (array $ids): bool => in_array($first, $ids, true) && in_array($second, $ids, true))->count();
                if ($together < self::TASK_MATCHES_PER_PAIR_PER_DAY) {
                    return true;
                }
            }
        }

        return false;
    }
}
