<?php

namespace Tests\Feature;

use App\Enums\ActionCounter;
use App\Services\ActionCounterService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class TennisTaskApiTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-realtime-secret';

    private int $refs = 0;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.realtime.secret' => self::SECRET]);
        $this->travelTo(CarbonImmutable::parse('2026-11-14 10:00:00'));
    }

    public function test_a_tennis_match_finished_on_the_score_counts_for_every_player_on_court(): void
    {
        [$red, $blue] = [$this->player(), $this->player()];

        $this->record($red, 'short_set_4', [[$red, 'red', 'win', 4], [$blue, 'blue', 'loss', 2]])->assertOk();

        $this->assertSame([1, 1], [$this->value($red, ActionCounter::TennisMatches), $this->value($blue, ActionCounter::TennisMatches)]);
        $this->assertSame(0, $this->value($red, ActionCounter::TennisWhitewashes));
    }

    public function test_a_replayed_match_counts_once(): void
    {
        [$red, $blue] = [$this->player(), $this->player()];
        $players = [[$red, 'red', 'win', 4], [$blue, 'blue', 'loss', 2]];

        $this->record($red, 'short_set_4', $players, 'same')->assertOk();
        $this->record($red, 'short_set_4', $players, 'same')->assertOk()->assertJsonPath('match.recorded', false);

        $this->assertSame(1, $this->value($red, ActionCounter::TennisMatches));
    }

    public function test_a_forfeit_a_young_account_or_another_sport_counts_nothing(): void
    {
        [$red, $blue, $young] = [$this->player(), $this->player(), $this->player(ageHours: 10)];

        $this->record($red, 'short_set_4', [[$red, 'red', 'win', 1], [$blue, 'blue', 'dnf', 0]])->assertOk();
        $this->record($red, 'short_set_4', [[$red, 'red', 'win', 4], [$young, 'blue', 'loss', 0]])->assertOk();
        $this->postJson('/api/sports/matches', $this->body('football', 'short_set_4', [[$red, 'red', 'win', 4], [$blue, 'blue', 'loss', 0]]), $this->auth($red))->assertOk();

        $this->assertSame([0, 0], [$this->value($red, ActionCounter::TennisMatches), $this->value($red, ActionCounter::TennisWhitewashes)]);
    }

    public function test_at_most_five_matches_count_a_day_and_the_count_starts_again_the_next_day(): void
    {
        [$red, $blue] = [$this->player(), $this->player()];
        for ($i = 0; $i < 7; $i++) {
            $this->record($red, 'tiebreak_7', [[$red, 'red', 'win', 7], [$blue, 'blue', 'loss', 3]])->assertOk();
        }
        $this->assertSame(5, $this->value($red, ActionCounter::TennisMatches));

        $this->travelTo(CarbonImmutable::parse('2026-11-15 10:00:00'));
        $this->record($red, 'tiebreak_7', [[$red, 'red', 'win', 7], [$blue, 'blue', 'loss', 3]])->assertOk();

        $this->assertSame(6, $this->value($red, ActionCounter::TennisMatches));
    }

    public function test_a_short_set_won_4_0_counts_once_a_day_per_opposing_line_up_and_never_in_a_tie_break(): void
    {
        [$a, $b, $c, $d] = [$this->player(), $this->player(), $this->player(), $this->player()];

        $this->record($a, 'short_set_4', [[$a, 'red', 'win', 4], [$b, 'red', 'win', 4], [$c, 'blue', 'loss', 0], [$d, 'blue', 'loss', 0]])->assertOk();
        $this->record($a, 'short_set_4', [[$a, 'red', 'win', 4], [$b, 'red', 'win', 4], [$c, 'blue', 'loss', 0], [$d, 'blue', 'loss', 0]])->assertOk();
        $this->record($a, 'short_set_4', [[$a, 'red', 'win', 4], [$c, 'blue', 'loss', 0]])->assertOk();
        $this->record($a, 'tiebreak_7', [[$a, 'red', 'win', 7], [$d, 'blue', 'loss', 0]])->assertOk();

        $this->assertSame(2, $this->value($a, ActionCounter::TennisWhitewashes));
        $this->assertSame(1, $this->value($b, ActionCounter::TennisWhitewashes));
        $this->assertSame(0, $this->value($c, ActionCounter::TennisWhitewashes));
    }

    public function test_the_tennis_tasks_reach_their_first_tier(): void
    {
        [$red, $blue] = [$this->player(), $this->player()];
        $this->record($red, 'short_set_4', [[$red, 'red', 'win', 4], [$blue, 'blue', 'loss', 0]])->assertOk();

        $this->assertDatabaseHas('account_task_tiers', ['account_id' => $red['account_id'], 'task' => 'tennis_whitewash', 'tier' => 1]);
        $this->assertDatabaseMissing('account_task_tiers', ['account_id' => $red['account_id'], 'task' => 'tennis']);
    }

    /**
     * @param  array{account_id: int, token: string}  $by
     * @param  list<array{0: array{account_id: int}, 1: string, 2: string, 3: int}>  $players
     */
    private function record(array $by, string $format, array $players, ?string $ref = null): TestResponse
    {
        $body = $this->body('tennis', $format, $players);
        $body['ref'] = $ref ?? 'tennis-'.(++$this->refs);

        return $this->postJson('/api/sports/matches', $body, $this->auth($by));
    }

    /** @param list<array{0: array{account_id: int}, 1: string, 2: string, 3: int}> $players */
    private function body(string $sport, string $format, array $players): array
    {
        return [
            'ref' => 'match-'.(++$this->refs),
            'sport' => $sport,
            'venue' => 'tennis_1',
            'settings' => ['mode' => count($players) > 2 ? 'doubles' : 'singles', 'format' => $format],
            'startedAt' => 1_763_114_400_000,
            'endedAt' => 1_763_114_700_000,
            'players' => array_map(fn (array $p): array => ['accountId' => $p[0]['account_id'], 'team' => $p[1], 'result' => $p[2], 'score' => $p[3]], $players),
        ];
    }

    /** @param array{account_id: int} $player */
    private function value(array $player, ActionCounter $counter): int
    {
        return app(ActionCounterService::class)->value($player['account_id'], $counter);
    }

    /** @return array{account_id: int, token: string} */
    private function player(int $ageHours = 100): array
    {
        $reg = $this->postJson('/api/register', [
            'email' => 'u'.uniqid('', true).'@test.com',
            'username' => 'u'.substr(str_replace('.', '', uniqid('', true)), 0, 10),
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
            'accepted_terms' => true,
            'age_confirmed' => true,
        ]);
        $reg->assertCreated();
        $accountId = (int) $reg->json('user.account_id');
        DB::table('accounts')->where('account_id', $accountId)->update(['created_at' => now()->subHours($ageHours)]);

        return ['account_id' => $accountId, 'token' => (string) $reg->json('token')];
    }

    /** @param array{token: string} $player */
    private function auth(array $player): array
    {
        $this->app['auth']->forgetGuards();

        return ['Authorization' => 'Bearer '.$player['token'], 'X-Realtime-Secret' => self::SECRET];
    }
}
