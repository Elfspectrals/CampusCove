<?php

namespace Tests\Feature;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class RunningApiTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-realtime-secret';

    private int $refs = 0;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.realtime.secret' => self::SECRET]);
        $this->travelTo(CarbonImmutable::parse('2026-11-11 10:00:00', 'Europe/Paris'));
    }

    public function test_a_race_between_two_settled_accounts_counts_and_a_400_under_52_seconds_counts_as_fast(): void
    {
        $a = $this->player();
        $b = $this->player();

        $this->race($a, 400, [[$a, 'finished', 51_000], [$b, 'finished', 53_000]])->assertOk()->assertJsonPath('match.countsForTasks', true);
        $this->race($a, 100, [[$a, 'dnf', null], [$b, 'finished', 12_000]])->assertOk();

        $this->assertSame(1, $this->counter($a['account_id'], 'races_run'));
        $this->assertSame(1, $this->counter($a['account_id'], 'fast_400_runs'));
        $this->assertSame(2, $this->counter($b['account_id'], 'races_run'));
        $this->assertSame(0, $this->counter($b['account_id'], 'fast_400_runs'));
    }

    public function test_a_solo_race_or_a_new_account_does_not_count_and_the_same_race_twice_counts_once(): void
    {
        $a = $this->player();
        $b = $this->player();
        $fresh = $this->player(ageHours: 10);

        $this->race($a, 400, [[$a, 'finished', 50_000]])->assertOk()->assertJsonPath('match.countsForTasks', false);
        $this->race($a, 400, [[$a, 'finished', 50_000], [$fresh, 'finished', 50_500]])->assertOk()->assertJsonPath('match.countsForTasks', false);
        $this->assertSame(0, $this->counter($a['account_id'], 'races_run'));

        $body = $this->body(100, [[$a, 'finished', 12_000], [$b, 'finished', 12_500]]);
        $this->postJson('/api/sports/matches', $body, $this->auth($a))->assertOk();
        $this->postJson('/api/sports/matches', $body, $this->auth($a))->assertOk();
        $this->assertSame(1, $this->counter($a['account_id'], 'races_run'));
    }

    /** @param list<array{0: array{account_id: int}, 1: string, 2: int|null}> $runners */
    private function race(array $recorder, int $distance, array $runners): TestResponse
    {
        return $this->postJson('/api/sports/matches', $this->body($distance, $runners), $this->auth($recorder));
    }

    /**
     * @param  list<array{0: array{account_id: int}, 1: string, 2: int|null}>  $runners
     * @return array<string, mixed>
     */
    private function body(int $distance, array $runners): array
    {
        $now = now()->getTimestampMs();
        $this->refs++;

        return [
            'ref' => "race-{$this->refs}",
            'sport' => 'running',
            'venue' => 'athletics_track',
            'settings' => ['distanceM' => $distance],
            'startedAt' => $now - 60_000,
            'endedAt' => $now,
            'players' => array_map(fn (array $r, int $i): array => [
                'accountId' => $r[0]['account_id'],
                'team' => null,
                'result' => $r[1],
                'place' => $r[1] === 'finished' ? $i + 1 : null,
                'timeMs' => $r[2],
                'score' => null,
            ], $runners, array_keys($runners)),
        ];
    }

    private function counter(int $accountId, string $counter): int
    {
        return (int) DB::table('account_counters')->where('account_id', $accountId)->where('counter', $counter)->value('value');
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
