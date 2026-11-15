<?php

namespace App\Services;

use App\Models\AccountHandle;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class SportsBoardService
{
    public const TOP = 10;

    public const WEEK_TIMEZONE = 'Europe/Paris';

    public const CHAMPION_BADGE = 'sports_champion';

    /** @var array<string, array{sport: string, settings: array<string, int|string>, metric: 'time'|'score'}> */
    public const BOARDS = [
        'swim_25' => ['sport' => 'swimming', 'settings' => ['distanceM' => 25], 'metric' => 'time'],
        'swim_50' => ['sport' => 'swimming', 'settings' => ['distanceM' => 50], 'metric' => 'time'],
        'swim_100' => ['sport' => 'swimming', 'settings' => ['distanceM' => 100], 'metric' => 'time'],
        'run_100' => ['sport' => 'running', 'settings' => ['distanceM' => 100], 'metric' => 'time'],
        'run_400' => ['sport' => 'running', 'settings' => ['distanceM' => 400], 'metric' => 'time'],
        'run_1500' => ['sport' => 'running', 'settings' => ['distanceM' => 1500], 'metric' => 'time'],
        'skate_1' => ['sport' => 'skating', 'settings' => ['laps' => 1], 'metric' => 'time'],
        'skate_3' => ['sport' => 'skating', 'settings' => ['laps' => 3], 'metric' => 'time'],
        'skate_5' => ['sport' => 'skating', 'settings' => ['laps' => 5], 'metric' => 'time'],
        'dance_harbour_sway_easy_solo' => ['sport' => 'dance', 'settings' => ['song' => 'harbour_sway', 'difficulty' => 'easy', 'mode' => 'solo'], 'metric' => 'score'],
        'dance_harbour_sway_easy_team' => ['sport' => 'dance', 'settings' => ['song' => 'harbour_sway', 'difficulty' => 'easy', 'mode' => 'team'], 'metric' => 'score'],
        'dance_harbour_sway_normal_solo' => ['sport' => 'dance', 'settings' => ['song' => 'harbour_sway', 'difficulty' => 'normal', 'mode' => 'solo'], 'metric' => 'score'],
        'dance_harbour_sway_normal_team' => ['sport' => 'dance', 'settings' => ['song' => 'harbour_sway', 'difficulty' => 'normal', 'mode' => 'team'], 'metric' => 'score'],
        'dance_harbour_sway_hard_solo' => ['sport' => 'dance', 'settings' => ['song' => 'harbour_sway', 'difficulty' => 'hard', 'mode' => 'solo'], 'metric' => 'score'],
        'dance_harbour_sway_hard_team' => ['sport' => 'dance', 'settings' => ['song' => 'harbour_sway', 'difficulty' => 'hard', 'mode' => 'team'], 'metric' => 'score'],
        'dance_cove_groove_easy_solo' => ['sport' => 'dance', 'settings' => ['song' => 'cove_groove', 'difficulty' => 'easy', 'mode' => 'solo'], 'metric' => 'score'],
        'dance_cove_groove_easy_team' => ['sport' => 'dance', 'settings' => ['song' => 'cove_groove', 'difficulty' => 'easy', 'mode' => 'team'], 'metric' => 'score'],
        'dance_cove_groove_normal_solo' => ['sport' => 'dance', 'settings' => ['song' => 'cove_groove', 'difficulty' => 'normal', 'mode' => 'solo'], 'metric' => 'score'],
        'dance_cove_groove_normal_team' => ['sport' => 'dance', 'settings' => ['song' => 'cove_groove', 'difficulty' => 'normal', 'mode' => 'team'], 'metric' => 'score'],
        'dance_cove_groove_hard_solo' => ['sport' => 'dance', 'settings' => ['song' => 'cove_groove', 'difficulty' => 'hard', 'mode' => 'solo'], 'metric' => 'score'],
        'dance_cove_groove_hard_team' => ['sport' => 'dance', 'settings' => ['song' => 'cove_groove', 'difficulty' => 'hard', 'mode' => 'team'], 'metric' => 'score'],
        'dance_night_sprint_easy_solo' => ['sport' => 'dance', 'settings' => ['song' => 'night_sprint', 'difficulty' => 'easy', 'mode' => 'solo'], 'metric' => 'score'],
        'dance_night_sprint_easy_team' => ['sport' => 'dance', 'settings' => ['song' => 'night_sprint', 'difficulty' => 'easy', 'mode' => 'team'], 'metric' => 'score'],
        'dance_night_sprint_normal_solo' => ['sport' => 'dance', 'settings' => ['song' => 'night_sprint', 'difficulty' => 'normal', 'mode' => 'solo'], 'metric' => 'score'],
        'dance_night_sprint_normal_team' => ['sport' => 'dance', 'settings' => ['song' => 'night_sprint', 'difficulty' => 'normal', 'mode' => 'team'], 'metric' => 'score'],
        'dance_night_sprint_hard_solo' => ['sport' => 'dance', 'settings' => ['song' => 'night_sprint', 'difficulty' => 'hard', 'mode' => 'solo'], 'metric' => 'score'],
        'dance_night_sprint_hard_team' => ['sport' => 'dance', 'settings' => ['song' => 'night_sprint', 'difficulty' => 'hard', 'mode' => 'team'], 'metric' => 'score'],
    ];

    public static function week(CarbonImmutable $at): string
    {
        return $at->setTimezone(self::WEEK_TIMEZONE)->format('o-\WW');
    }

    /** @return array{board: string, week: string, entries: list<array{rank: int, accountId: int, name: string, value: int}>, champion: array{week: string, accountId: int, name: string, value: int}|null} */
    public function board(string $board): array
    {
        $weekStart = $this->weekStart(CarbonImmutable::now());
        $lastWeek = self::week($weekStart->subWeek());
        $champion = DB::table('sports_board_champions')->where('board', $board)->where('week', $lastWeek)->first();

        return [
            'board' => $board,
            'week' => self::week($weekStart),
            'entries' => $this->named($this->standings($board, $weekStart, self::TOP)),
            'champion' => $champion === null ? null : [
                'week' => $lastWeek,
                'accountId' => (int) $champion->account_id,
                'name' => $this->name((int) $champion->account_id),
                'value' => (int) $champion->value,
            ],
        ];
    }

    public function closePastWeek(): int
    {
        $lastWeekStart = $this->weekStart(CarbonImmutable::now())->subWeek();
        $week = self::week($lastWeekStart);
        $crowned = 0;
        foreach (array_keys(self::BOARDS) as $board) {
            $first = $this->standings($board, $lastWeekStart, 1)[0] ?? null;
            if ($first === null) {
                continue;
            }
            $crowned += DB::table('sports_board_champions')->insertOrIgnore([
                'board' => $board,
                'week' => $week,
                'account_id' => $first['accountId'],
                'value' => $first['value'],
            ]);
        }

        return $crowned;
    }

    public function isChampion(int $accountId): bool
    {
        return DB::table('sports_board_champions')->where('account_id', $accountId)->exists();
    }

    private function weekStart(CarbonImmutable $at): CarbonImmutable
    {
        return $at->setTimezone(self::WEEK_TIMEZONE)->startOfWeek(CarbonImmutable::MONDAY);
    }

    /** @return list<array{rank: int, accountId: int, value: int}> */
    private function standings(string $board, CarbonImmutable $weekStart, int $limit): array
    {
        $definition = self::BOARDS[$board] ?? throw new \InvalidArgumentException("Unknown sports board {$board}");
        [$column, $order, $result] = $definition['metric'] === 'time' ? ['time_ms', 'ASC', 'finished'] : ['score', 'DESC', null];
        $rows = DB::select(<<<SQL
SELECT account_id, value FROM (
  SELECT DISTINCT ON (p.account_id) p.account_id, p.{$column} AS value, m.ended_at
  FROM sports_match_players p
  JOIN sports_matches m ON m.id = p.match_id
  WHERE m.sport = ? AND m.settings @> ?::jsonb AND m.ended_at >= ? AND m.ended_at < ?
    AND p.{$column} IS NOT NULL AND (?::text IS NULL OR p.result = ?::text)
  ORDER BY p.account_id, p.{$column} {$order}, m.ended_at ASC
) best
ORDER BY value {$order}, ended_at ASC, account_id ASC
LIMIT ?
SQL, [
            $definition['sport'],
            json_encode((object) $definition['settings'], JSON_THROW_ON_ERROR),
            $weekStart->toIso8601String(),
            $weekStart->addWeek()->toIso8601String(),
            $result,
            $result,
            $limit,
        ]);

        return array_map(fn (object $row, int $i): array => [
            'rank' => $i + 1,
            'accountId' => (int) $row->account_id,
            'value' => (int) $row->value,
        ], $rows, array_keys($rows));
    }

    /**
     * @param  list<array{rank: int, accountId: int, value: int}>  $entries
     * @return list<array{rank: int, accountId: int, name: string, value: int}>
     */
    private function named(array $entries): array
    {
        return array_map(fn (array $entry): array => [...$entry, 'name' => $this->name($entry['accountId'])], $entries);
    }

    private function name(int $accountId): string
    {
        return AccountHandle::query()->find($accountId)?->display_name ?? '';
    }
}
