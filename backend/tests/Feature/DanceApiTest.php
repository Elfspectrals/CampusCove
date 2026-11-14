<?php

namespace Tests\Feature;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class DanceApiTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.realtime.secret' => self::SECRET]);
        $this->travelTo(CarbonImmutable::parse('2026-11-14 10:00:00'));
    }

    public function test_a_team_run_records_one_row_per_dancer_with_the_team_key_and_the_paris_week(): void
    {
        $a = $this->player();
        $b = $this->player();

        $this->record($a, $this->danceRun('team', [$this->dancer($b, 900), $this->dancer($a, 700)], teamScore: 2100))
            ->assertOk()
            ->assertExactJson(['recorded' => true]);

        $rows = DB::table('dance_runs')->orderBy('account_id')->get();
        $this->assertCount(2, $rows);
        $teamKey = min($a['account_id'], $b['account_id']).'-'.max($a['account_id'], $b['account_id']);
        foreach ($rows as $row) {
            $this->assertSame('run-1', $row->ref);
            $this->assertSame('cove_groove', $row->song);
            $this->assertSame('hard', $row->difficulty);
            $this->assertSame($teamKey, $row->team_key);
            $this->assertSame(2100, (int) $row->team_score);
            $this->assertSame('2026-W46', $row->week);
        }
    }

    public function test_a_run_ending_sunday_night_in_paris_is_in_that_week_and_monday_starts_the_next(): void
    {
        $a = $this->player();
        $this->travelTo(CarbonImmutable::parse('2026-11-16 00:30:00', 'Europe/Paris'));

        $this->record($a, $this->danceRun('solo', [$this->dancer($a, 500)], endedAt: CarbonImmutable::parse('2026-11-15 23:59:00', 'Europe/Paris')))->assertOk();
        $this->record($a, $this->danceRun('solo', [$this->dancer($a, 500)], ref: 'run-2', endedAt: CarbonImmutable::parse('2026-11-16 00:01:00', 'Europe/Paris')))->assertOk();

        $this->assertSame(['2026-W46', '2026-W47'], DB::table('dance_runs')->orderBy('ended_at')->pluck('week')->all());
    }

    public function test_the_same_ref_twice_records_once_and_counts_once(): void
    {
        $a = $this->player();
        $body = $this->danceRun('solo', [$this->dancer($a, 500, fullCombo: true)]);
        $this->countedMatch('run-1');

        $this->record($a, $body)->assertOk()->assertExactJson(['recorded' => true]);
        $this->record($a, $body)->assertOk()->assertExactJson(['recorded' => false]);
        $this->record($a, array_merge($body, ['song' => 'night_sprint']))->assertOk()->assertExactJson(['recorded' => false]);

        $this->assertSame(1, DB::table('dance_runs')->count());
        $this->assertSame(1, $this->task($a, 'songs_danced')['value']);
        $this->assertSame(1, $this->task($a, 'full_combo_hard')['value']);
    }

    public function test_invalid_runs_are_refused_and_record_nothing(): void
    {
        $a = $this->player();
        $b = $this->player();
        $good = $this->danceRun('duel', [$this->dancer($a, 500), $this->dancer($b, 400)]);
        $bad = [
            ['ref' => ''],
            ['ref' => str_repeat('a', 65)],
            ['song' => 'macarena'],
            ['difficulty' => 'expert'],
            ['mode' => 'battle'],
            ['endedAt' => '1763114400000'],
            ['endedAt' => now()->addMinutes(2)->getTimestampMs()],
            ['teamScore' => -1],
            ['dancers' => []],
            ['dancers' => array_fill(0, 5, $this->dancer($a, 1))],
            ['dancers' => [$this->dancer($a, 500), $this->dancer($a, 400)]],
            ['dancers' => [['accountId' => 999_999, 'score' => 1, 'fullCombo' => false, 'finished' => true]]],
            ['dancers' => [array_merge($this->dancer($a, 500), ['score' => -1]), $this->dancer($b, 1)]],
            ['dancers' => [array_merge($this->dancer($a, 500), ['score' => 2.5]), $this->dancer($b, 1)]],
            ['dancers' => [array_merge($this->dancer($a, 500), ['finished' => 1]), $this->dancer($b, 1)]],
            ['dancers' => [array_merge($this->dancer($a, 500), ['coins' => 50]), $this->dancer($b, 1)]],
        ];

        foreach ($bad as $i => $patch) {
            $this->record($a, array_merge($good, $patch, ['ref' => $patch['ref'] ?? "bad-{$i}"]))->assertUnprocessable();
        }
        $this->postJson('/api/sports/dance/runs', $good, $this->auth($a['token']))->assertForbidden();
        $this->assertSame(0, DB::table('dance_runs')->count());
    }

    public function test_the_mode_sets_the_number_of_dancers_and_the_team_score(): void
    {
        $a = $this->player();
        $b = $this->player();

        $this->record($a, $this->danceRun('solo', [$this->dancer($a, 1), $this->dancer($b, 1)]))->assertUnprocessable()->assertJsonPath('code', 'dance_bad_dancer_count');
        $this->record($a, $this->danceRun('duel', [$this->dancer($a, 1)]))->assertUnprocessable()->assertJsonPath('code', 'dance_bad_dancer_count');
        $this->record($a, $this->danceRun('team', [$this->dancer($a, 1)], teamScore: 10))->assertUnprocessable()->assertJsonPath('code', 'dance_bad_dancer_count');
        $this->record($a, $this->danceRun('team', [$this->dancer($a, 1), $this->dancer($b, 1)]))->assertUnprocessable()->assertJsonPath('code', 'dance_bad_team_score');
        $this->record($a, $this->danceRun('duel', [$this->dancer($a, 1), $this->dancer($b, 1)], teamScore: 10))->assertUnprocessable()->assertJsonPath('code', 'dance_bad_team_score');
        $this->record($a, $this->danceRun('solo', [$this->dancer($a, 1)], teamScore: 0))->assertUnprocessable()->assertJsonPath('code', 'dance_bad_team_score');

        $this->assertSame(0, DB::table('dance_runs')->count());
    }

    public function test_tasks_count_only_runs_of_a_match_that_counts_for_tasks(): void
    {
        $a = $this->player();
        $this->record($a, $this->danceRun('solo', [$this->dancer($a, 900, fullCombo: true)], ref: 'solo'))->assertOk();
        $this->countedMatch('uncounted', counts: false);
        $this->record($a, $this->danceRun('solo', [$this->dancer($a, 900, fullCombo: true)], ref: 'uncounted'))->assertOk();
        $this->assertSame(0, $this->task($a, 'songs_danced')['value']);
        $this->assertSame(0, $this->task($a, 'full_combo_hard')['value']);
        $this->assertSame(2, DB::table('dance_runs')->count());
    }

    public function test_songs_danced_counts_finished_songs_with_points(): void
    {
        $a = $this->player();
        $b = $this->player();
        foreach (['left' => false, 'idle' => true, 'r1' => true, 'r2' => true] as $ref => $finished) {
            $this->countedMatch($ref);
            $score = $ref === 'idle' ? 0 : 100;
            $this->record($a, $this->danceRun('duel', [$this->dancer($a, $score, finished: $finished), $this->dancer($b, 50, finished: false)], ref: $ref))->assertOk();
        }

        $this->assertSame(2, $this->task($a, 'songs_danced')['value']);
        $this->assertSame(0, $this->task($b, 'songs_danced')['value']);
        $this->assertSame([10, 50, 200], $this->task($a, 'songs_danced')['tiers']);
    }

    public function test_full_combo_hard_counts_only_on_hard(): void
    {
        $a = $this->player();
        foreach (['h1' => 'hard', 'h2' => 'hard', 'n1' => 'normal'] as $ref => $difficulty) {
            $this->countedMatch($ref);
            $this->record($a, $this->danceRun('solo', [$this->dancer($a, 900, fullCombo: true)], ref: $ref, difficulty: $difficulty))->assertOk();
        }
        $this->countedMatch('h3');
        $this->record($a, $this->danceRun('solo', [$this->dancer($a, 900)], ref: 'h3'))->assertOk();

        $this->assertSame(2, $this->task($a, 'full_combo_hard')['value']);
        $this->assertSame([1, 10, 50], $this->task($a, 'full_combo_hard')['tiers']);
        $this->assertSame([1], $this->task($a, 'full_combo_hard')['reached']);
    }

    public function test_dance_songs_have_a_solo_and_a_team_core_board_by_score(): void
    {
        $a = $this->player();
        $b = $this->player();
        $settings = ['mode' => 'solo', 'song' => 'cove_groove', 'difficulty' => 'hard'];
        $this->postJson('/api/sports/matches', [
            'ref' => 'm1', 'sport' => 'dance', 'venue' => 'dance_studio', 'settings' => $settings,
            'startedAt' => now()->subMinutes(2)->getTimestampMs(), 'endedAt' => now()->getTimestampMs(),
            'players' => [['accountId' => $a['account_id'], 'team' => null, 'result' => 'finished', 'score' => 12345]],
        ], $this->auth($a['token'], self::SECRET))->assertOk();

        $this->getJson('/api/sports/boards/dance_cove_groove_hard_solo', $this->auth($b['token']))
            ->assertOk()
            ->assertJsonPath('board.entries.0.accountId', $a['account_id'])
            ->assertJsonPath('board.entries.0.value', 12345);
        $this->getJson('/api/sports/boards/dance_cove_groove_hard_team', $this->auth($b['token']))->assertOk()->assertJsonPath('board.entries', []);
    }

    private function countedMatch(string $ref, bool $counts = true): void
    {
        DB::table('sports_matches')->insert([
            'ref' => $ref,
            'sport' => 'dance',
            'venue' => 'dance_studio',
            'settings' => '{}',
            'started_at' => now()->subMinutes(2),
            'ended_at' => now(),
            'counts_for_tasks' => $counts,
        ]);
    }

    /**
     * @param  list<array<string, mixed>>  $dancers
     * @return array<string, mixed>
     */
    private function danceRun(
        string $mode,
        array $dancers,
        ?int $teamScore = null,
        string $ref = 'run-1',
        string $song = 'cove_groove',
        string $difficulty = 'hard',
        ?CarbonImmutable $endedAt = null,
    ): array {
        return [
            'ref' => $ref,
            'song' => $song,
            'difficulty' => $difficulty,
            'mode' => $mode,
            'endedAt' => ($endedAt ?? CarbonImmutable::now())->getTimestampMs(),
            'teamScore' => $teamScore,
            'dancers' => $dancers,
        ];
    }

    /**
     * @param  array{account_id: int}  $player
     * @return array<string, mixed>
     */
    private function dancer(array $player, int $score, bool $fullCombo = false, bool $finished = true): array
    {
        return ['accountId' => $player['account_id'], 'score' => $score, 'fullCombo' => $fullCombo, 'finished' => $finished];
    }

    /**
     * @param  array{token: string}  $player
     * @param  array<string, mixed>  $body
     */
    private function record(array $player, array $body): TestResponse
    {
        return $this->postJson('/api/sports/dance/runs', $body, $this->auth($player['token'], self::SECRET));
    }

    /**
     * @param  array{token: string}  $player
     * @return array{task: string, value: int, tiers: list<int>, reached: list<int>}
     */
    private function task(array $player, string $task): array
    {
        $tasks = $this->getJson('/api/tasks', $this->auth($player['token']))->assertOk()->json('tasks');

        return collect($tasks)->firstWhere('task', $task);
    }

    /** @return array{token: string, account_id: int, pseudo: string} */
    private function player(?string $username = null): array
    {
        $reg = $this->postJson('/api/register', [
            'email' => 'u'.uniqid('', true).'@test.com',
            'username' => $username ?? 'u'.substr(str_replace('.', '', uniqid('', true)), 0, 10),
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
            'accepted_terms' => true,
            'age_confirmed' => true,
        ])->assertCreated();
        $accountId = (int) $reg->json('user.account_id');
        $pseudo = DB::table('account_handles')->where('account_id', $accountId)->first();

        return [
            'token' => (string) $reg->json('token'),
            'account_id' => $accountId,
            'pseudo' => $pseudo->username.'#'.str_pad((string) $pseudo->tag, 4, '0', STR_PAD_LEFT),
        ];
    }

    /** @return array<string, string> */
    private function auth(string $token, ?string $secret = null): array
    {
        $this->app['auth']->forgetGuards();

        return array_filter(['Authorization' => 'Bearer '.$token, 'X-Realtime-Secret' => $secret]);
    }
}
