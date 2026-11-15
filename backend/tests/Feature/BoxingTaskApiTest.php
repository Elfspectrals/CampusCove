<?php

namespace Tests\Feature;

use App\Enums\ActionCounter;
use App\Services\ActionCounterService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class BoxingTaskApiTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-realtime-secret';

    private const MORNING_PARIS_14 = '2026-11-14 10:00:00';

    private const HALF_PAST_MIDNIGHT_PARIS_15 = '2026-11-14 23:30:00';

    private int $refs = 0;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.realtime.secret' => self::SECRET]);
        $this->travelTo(CarbonImmutable::parse('2026-11-15 12:00:00'));
    }

    public function test_a_boxing_win_counts_once_per_opponent_and_paris_day(): void
    {
        $winner = $this->player(ageHours: 100);
        $opponent = $this->player(ageHours: 100);

        $this->bout($winner, $opponent, self::MORNING_PARIS_14)->assertOk();
        $this->bout($winner, $opponent, self::MORNING_PARIS_14)->assertOk();
        $this->assertSame(1, $this->wins($winner));

        $this->bout($winner, $opponent, self::HALF_PAST_MIDNIGHT_PARIS_15)->assertOk();
        $this->assertSame(2, $this->wins($winner));
        $this->assertSame(0, $this->wins($opponent));
    }

    public function test_a_replayed_match_ref_counts_nothing_more(): void
    {
        $winner = $this->player(ageHours: 100);
        $first = $this->player(ageHours: 100);
        $second = $this->player(ageHours: 100);

        $this->bout($winner, $first, self::MORNING_PARIS_14, 'same-ref')->assertOk();
        $this->bout($winner, $second, self::MORNING_PARIS_14, 'same-ref')->assertOk()->assertJsonPath('match.recorded', false);

        $this->assertSame(1, $this->wins($winner));
    }

    public function test_an_opponent_younger_than_72_hours_counts_nothing(): void
    {
        $winner = $this->player(ageHours: 100);

        $this->bout($winner, $this->player(ageHours: 71), self::MORNING_PARIS_14)->assertOk();
        $this->assertSame(0, $this->wins($winner));

        $this->bout($winner, $this->player(ageHours: 72), self::MORNING_PARIS_14)->assertOk();
        $this->assertSame(1, $this->wins($winner));
    }

    public function test_a_draw_or_another_sport_counts_nothing(): void
    {
        $red = $this->player(ageHours: 100);
        $blue = $this->player(ageHours: 100);

        $this->record($red, [
            ['accountId' => $red['account_id'], 'team' => null, 'result' => 'draw', 'score' => 4],
            ['accountId' => $blue['account_id'], 'team' => null, 'result' => 'draw', 'score' => 4],
        ], self::MORNING_PARIS_14)->assertOk();
        $this->record($red, [
            ['accountId' => $red['account_id'], 'team' => 'red', 'result' => 'win'],
            ['accountId' => $blue['account_id'], 'team' => 'blue', 'result' => 'loss'],
        ], self::MORNING_PARIS_14, sport: 'tennis')->assertOk();

        $this->assertSame(0, $this->wins($red));
        $this->assertSame(0, $this->wins($blue));
    }

    /**
     * @param  array{token: string, account_id: int}  $winner
     * @param  array{token: string, account_id: int}  $loser
     */
    private function bout(array $winner, array $loser, string $endedAt, ?string $ref = null): TestResponse
    {
        return $this->record($winner, [
            ['accountId' => $winner['account_id'], 'team' => null, 'result' => 'win', 'score' => 6],
            ['accountId' => $loser['account_id'], 'team' => null, 'result' => 'loss', 'score' => 2],
        ], $endedAt, $ref);
    }

    /**
     * @param  array{token: string}  $by
     * @param  list<array<string, mixed>>  $players
     */
    private function record(array $by, array $players, string $endedAt, ?string $ref = null, string $sport = 'boxing'): TestResponse
    {
        $endedAtMs = CarbonImmutable::parse($endedAt)->getTimestampMs();
        $this->app['auth']->forgetGuards();

        return $this->postJson('/api/sports/matches', [
            'ref' => $ref ?? 'bout-'.++$this->refs,
            'sport' => $sport,
            'venue' => 'boxing_ring',
            'settings' => ['rounds' => 3],
            'startedAt' => $endedAtMs - 180_000,
            'endedAt' => $endedAtMs,
            'players' => $players,
        ], ['Authorization' => 'Bearer '.$by['token'], 'X-Realtime-Secret' => self::SECRET]);
    }

    /** @param array{account_id: int} $player */
    private function wins(array $player): int
    {
        return app(ActionCounterService::class)->value($player['account_id'], ActionCounter::BoxingWins);
    }

    /** @return array{token: string, account_id: int} */
    private function player(int $ageHours): array
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

        return ['token' => (string) $reg->json('token'), 'account_id' => $accountId];
    }
}
