<?php

namespace App\Services;

use App\Enums\ActionCounter;
use App\Exceptions\DanceRejectedException;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class DanceService
{
    public const SONGS = ['harbour_sway', 'cove_groove', 'night_sprint'];

    public const DIFFICULTIES = ['easy', 'normal', 'hard'];

    public const MODES = ['solo', 'team', 'duel'];

    private const DANCERS_PER_MODE = ['solo' => [1, 1], 'team' => [2, 4], 'duel' => [2, 4]];

    public function __construct(private readonly ActionCounterService $counters) {}

    /** @param list<array{accountId: int, score: int, fullCombo: bool, finished: bool}> $dancers */
    public function recordRuns(string $ref, string $song, string $difficulty, string $mode, int $endedAtMs, ?int $teamScore, array $dancers): bool
    {
        [$minDancers, $maxDancers] = self::DANCERS_PER_MODE[$mode];
        if (count($dancers) < $minDancers || count($dancers) > $maxDancers) {
            throw new DanceRejectedException('dance_bad_dancer_count', "A {$mode} run has {$minDancers} to {$maxDancers} dancers.");
        }
        if (($mode === 'team') !== ($teamScore !== null)) {
            throw new DanceRejectedException('dance_bad_team_score', 'A team score is sent for team runs only, and always for them.');
        }
        $endedAt = CarbonImmutable::createFromTimestampMs($endedAtMs)->setTimezone(PlayerActivityService::DAY_TIMEZONE);
        $accountIds = array_column($dancers, 'accountId');
        sort($accountIds);
        $teamKey = $mode === 'team' ? implode('-', $accountIds) : null;

        return DB::transaction(function () use ($ref, $song, $difficulty, $mode, $endedAt, $teamScore, $teamKey, $dancers): bool {
            if (DB::table('dance_runs')->where('ref', $ref)->exists()) {
                return false;
            }
            $countsForTasks = (bool) DB::table('sports_matches')->where('ref', $ref)->value('counts_for_tasks');
            $recorded = false;
            foreach ($dancers as $dancer) {
                $inserted = DB::table('dance_runs')->insertOrIgnore([
                    'ref' => $ref,
                    'account_id' => $dancer['accountId'],
                    'song' => $song,
                    'difficulty' => $difficulty,
                    'mode' => $mode,
                    'score' => $dancer['score'],
                    'full_combo' => $dancer['fullCombo'],
                    'finished' => $dancer['finished'],
                    'team_key' => $teamKey,
                    'team_score' => $teamScore,
                    'week' => $endedAt->format('o-\\WW'),
                    'ended_at' => $endedAt,
                ]) === 1;
                if ($inserted) {
                    $recorded = true;
                    if ($countsForTasks) {
                        $this->countTasks($dancer, $difficulty);
                    }
                }
            }

            return $recorded;
        });
    }

    /** @param array{accountId: int, score: int, fullCombo: bool, finished: bool} $dancer */
    private function countTasks(array $dancer, string $difficulty): void
    {
        if (! $dancer['finished'] || $dancer['score'] === 0) {
            return;
        }
        $this->counters->bump($dancer['accountId'], ActionCounter::SongsDanced);
        if ($difficulty === 'hard' && $dancer['fullCombo']) {
            $this->counters->bump($dancer['accountId'], ActionCounter::FullComboHard);
        }
    }
}
