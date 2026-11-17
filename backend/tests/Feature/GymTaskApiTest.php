<?php

namespace Tests\Feature;

use App\Enums\ActionCounter;
use App\Services\ActionCounterService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class GymTaskApiTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_a_football_match_counts_once_per_player_and_three_goals_make_a_hat_trick(): void
    {
        $red = $this->player();
        $blue = $this->player();
        $this->record($red, 'm-1', 'football', [
            ['accountId' => $red['account_id'], 'team' => 'red', 'result' => 'win', 'score' => 3],
            ['accountId' => $blue['account_id'], 'team' => 'blue', 'result' => 'loss', 'score' => 1],
        ]);
        $body = ['ref' => 'm-1', 'sport' => 'football', 'players' => [
            ['accountId' => $red['account_id'], 'goals' => 3],
            ['accountId' => $blue['account_id'], 'goals' => 1],
        ]];

        $this->tasks($red, $body)->assertOk()->assertExactJson(['counted' => [$red['account_id'], $blue['account_id']]]);
        $this->tasks($red, $body)->assertOk();

        $this->assertSame(1, $this->counter($red, ActionCounter::FootballMatches));
        $this->assertSame(1, $this->counter($blue, ActionCounter::FootballMatches));
        $this->assertSame(1, $this->counter($red, ActionCounter::HatTricks));
        $this->assertSame(0, $this->counter($blue, ActionCounter::HatTricks));
    }

    public function test_five_three_pointers_make_a_sharpshooter_match_and_a_player_who_left_counts_nothing(): void
    {
        $shooter = $this->player();
        $quitter = $this->player();
        $this->record($shooter, 'b-1', 'basketball', [
            ['accountId' => $shooter['account_id'], 'team' => 'red', 'result' => 'win', 'score' => 17],
            ['accountId' => $quitter['account_id'], 'team' => 'blue', 'result' => 'dnf', 'score' => 0],
        ]);

        $this->tasks($shooter, ['ref' => 'b-1', 'sport' => 'basketball', 'players' => [
            ['accountId' => $shooter['account_id'], 'threes' => 5],
            ['accountId' => $quitter['account_id'], 'threes' => 0],
        ]])->assertOk()->assertExactJson(['counted' => [$shooter['account_id']]]);

        $this->assertSame(1, $this->counter($shooter, ActionCounter::BasketballMatches));
        $this->assertSame(1, $this->counter($shooter, ActionCounter::SharpshooterMatches));
        $this->assertSame(0, $this->counter($quitter, ActionCounter::BasketballMatches));
    }

    public function test_only_a_recorded_match_of_that_sport_counts(): void
    {
        $player = $this->player();
        $this->tasks($player, ['ref' => 'nope', 'sport' => 'football', 'players' => [['accountId' => $player['account_id'], 'goals' => 3]]])->assertNotFound();
        $this->record($player, 'm-2', 'football', [['accountId' => $player['account_id'], 'team' => 'red', 'result' => 'draw', 'score' => 0]]);
        $this->tasks($player, ['ref' => 'm-2', 'sport' => 'basketball', 'players' => [['accountId' => $player['account_id'], 'threes' => 9]]])->assertUnprocessable();
        $this->assertSame(0, $this->counter($player, ActionCounter::BasketballMatches));
    }

    public function test_the_feats_are_validated_and_only_the_socket_may_count(): void
    {
        $player = $this->player();
        $this->record($player, 'm-3', 'football', [['accountId' => $player['account_id'], 'team' => 'red', 'result' => 'win', 'score' => 3]]);
        $good = ['ref' => 'm-3', 'sport' => 'football', 'players' => [['accountId' => $player['account_id'], 'goals' => 3]]];

        $this->postJson('/api/sports/gym/tasks', $good, $this->auth($player['token']))->assertForbidden();
        $this->tasks($player, [...$good, 'players' => [['accountId' => $player['account_id'], 'threes' => 3]]])->assertUnprocessable();
        $this->tasks($player, [...$good, 'players' => [['accountId' => $player['account_id'], 'goals' => '3']]])->assertUnprocessable();
        $this->tasks($player, [...$good, 'sport' => 'tennis'])->assertUnprocessable();
        $this->assertSame(0, $this->counter($player, ActionCounter::FootballMatches));
    }

    /**
     * @param  array{token: string}  $player
     * @param  list<array<string, mixed>>  $players
     */
    private function record(array $player, string $ref, string $sport, array $players): void
    {
        $this->postJson('/api/sports/matches', [
            'ref' => $ref,
            'sport' => $sport,
            'venue' => "gym_{$sport}",
            'settings' => ['teamSize' => 2, 'durationSec' => 240],
            'startedAt' => 1_763_114_400_000,
            'endedAt' => 1_763_114_640_000,
            'players' => $players,
        ], $this->auth($player['token'], self::SECRET))->assertOk();
    }

    /**
     * @param  array{token: string}  $player
     * @param  array<string, mixed>  $body
     */
    private function tasks(array $player, array $body): TestResponse
    {
        return $this->postJson('/api/sports/gym/tasks', $body, $this->auth($player['token'], self::SECRET));
    }

    /** @param array{account_id: int} $player */
    private function counter(array $player, ActionCounter $counter): int
    {
        return app(ActionCounterService::class)->value($player['account_id'], $counter);
    }

    /** @return array{token: string, account_id: int} */
    private function player(): array
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
        DB::table('accounts')->where('account_id', $accountId)->update(['created_at' => now()->subHours(100)]);

        return ['token' => (string) $reg->json('token'), 'account_id' => $accountId];
    }

    /** @return array<string, string> */
    private function auth(string $token, ?string $secret = null): array
    {
        $this->app['auth']->forgetGuards();

        return array_filter(['Authorization' => 'Bearer '.$token, 'X-Realtime-Secret' => $secret]);
    }
}
