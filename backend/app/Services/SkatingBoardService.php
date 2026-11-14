<?php

namespace App\Services;

use App\Models\AccountHandle;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class SkatingBoardService
{
    public const CHAMPION_BADGE = BadgeService::SKATING_CHAMPION;

    public const BOARD_SIZE = 5;

    public const LAPS = [1, 3, 5];

    private const TIMEZONE = 'Europe/Paris';

    public function __construct(private readonly BadgeService $badges) {}

    public function weekStart(CarbonImmutable $at): CarbonImmutable
    {
        return $at->setTimezone(self::TIMEZONE)->startOfWeek(CarbonImmutable::MONDAY);
    }

    public function weekKey(CarbonImmutable $weekStart): string
    {
        return $weekStart->format('o-\\WW');
    }

    /** @return array{week: string, boards: list<array{laps: int, entries: list<array{name: string, timeMs: int}>}>, champions: list<array{laps: int, name: string, timeMs: int}>} */
    public function overview(CarbonImmutable $now): array
    {
        $start = $this->weekStart($now);
        $ranked = $this->ranked($start, self::BOARD_SIZE);
        $wins = DB::table('skating_board_wins')->where('week', $this->weekKey($start->subWeek()))->orderBy('laps')->get(['laps', 'account_id', 'time_ms']);
        $names = $this->names([...array_column($ranked, 'account_id'), ...$wins->pluck('account_id')->all()]);
        $boards = array_map(fn (int $laps): array => [
            'laps' => $laps,
            'entries' => array_values(array_map(
                fn (object $row): array => ['name' => $names[(int) $row->account_id], 'timeMs' => (int) $row->best],
                array_filter($ranked, fn (object $row): bool => (int) $row->laps === $laps),
            )),
        ], self::LAPS);

        return [
            'week' => $this->weekKey($start),
            'boards' => $boards,
            'champions' => $wins->map(fn ($row): array => ['laps' => (int) $row->laps, 'name' => $names[(int) $row->account_id], 'timeMs' => (int) $row->time_ms])->values()->all(),
        ];
    }

    public function closeWeek(CarbonImmutable $weekStart): int
    {
        $week = $this->weekKey($weekStart);
        $closed = 0;
        foreach ($this->ranked($weekStart, 1) as $row) {
            DB::transaction(function () use ($week, $row, &$closed): void {
                $inserted = DB::table('skating_board_wins')->insertOrIgnore([
                    'week' => $week, 'laps' => $row->laps, 'account_id' => $row->account_id, 'time_ms' => $row->best,
                ]);
                if ($inserted === 0) {
                    return;
                }
                $this->badges->grant((int) $row->account_id, self::CHAMPION_BADGE);
                $closed++;
            });
        }

        return $closed;
    }

    /**
     * @param  list<int|string>  $accountIds
     * @return array<int, string>
     */
    private function names(array $accountIds): array
    {
        return AccountHandle::query()->whereIn('account_id', array_unique($accountIds))->get()
            ->mapWithKeys(fn (AccountHandle $handle): array => [(int) $handle->account_id => $handle->display_name])
            ->all();
    }

    /** @return list<object{laps: int, account_id: int, best: int}> */
    private function ranked(CarbonImmutable $weekStart, int $limit): array
    {
        return DB::select(<<<'SQL'
SELECT laps, account_id, best FROM (
  SELECT (m.settings->>'laps')::int AS laps, p.account_id, MIN(p.time_ms) AS best,
         ROW_NUMBER() OVER (PARTITION BY (m.settings->>'laps')::int ORDER BY MIN(p.time_ms), MIN(m.ended_at), p.account_id) AS rank
  FROM sports_match_players p
  JOIN sports_matches m ON m.id = p.match_id
  WHERE m.sport = 'skating' AND p.result = 'finished' AND p.time_ms IS NOT NULL
    AND (m.settings->>'laps') IN ('1', '3', '5')
    AND m.ended_at >= ? AND m.ended_at < ?
  GROUP BY (m.settings->>'laps')::int, p.account_id
) ranked WHERE rank <= ? ORDER BY laps, rank
SQL, [$weekStart->utc(), $weekStart->addWeek()->utc(), $limit]);
    }
}
