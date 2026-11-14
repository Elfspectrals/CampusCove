<?php

namespace Tests\Feature;

use App\Enums\ActionCounter;
use App\Services\ActionCounterService;
use Carbon\CarbonImmutable;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class PetanqueTallyApiTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
        config(['services.realtime.secret' => self::SECRET]);
        $this->travelTo(CarbonImmutable::parse('2026-11-14 10:00:00'));
    }

    public function test_a_finished_game_counts_once_with_its_carreaux(): void
    {
        [$red, $blue] = [$this->player(), $this->player()];
        $this->recordGame('game-1', $red, $blue);

        $this->tally($red, 'game-1', 2)->assertOk()->assertExactJson(['counted' => true]);
        $this->tally($red, 'game-1', 2)->assertOk()->assertExactJson(['counted' => false]);
        $this->tally($blue, 'game-1', 0)->assertOk()->assertExactJson(['counted' => true]);

        $this->assertSame(1, $this->value($red, ActionCounter::PetanqueGames));
        $this->assertSame(2, $this->value($red, ActionCounter::PetanqueCarreaux));
        $this->assertSame(0, $this->value($blue, ActionCounter::PetanqueCarreaux));
        $this->assertSame([1], DB::table('account_task_tiers')->where('account_id', $red['account_id'])->where('task', 'carreau')->pluck('tier')->all());
    }

    public function test_at_most_five_games_a_day_count(): void
    {
        [$red, $blue] = [$this->player(), $this->player()];
        for ($i = 1; $i <= 6; $i++) {
            $this->recordGame("game-{$i}", $red, $blue);
            $this->tally($red, "game-{$i}", 1)->assertOk()->assertExactJson(['counted' => $i <= 5]);
        }
        $this->assertSame(5, $this->value($red, ActionCounter::PetanqueGames));
        $this->assertSame(5, $this->value($red, ActionCounter::PetanqueCarreaux));

        $this->travelTo(CarbonImmutable::parse('2026-11-15 10:00:00'));
        $this->recordGame('game-7', $red, $blue);
        $this->tally($red, 'game-7', 0)->assertOk()->assertExactJson(['counted' => true]);
        $this->tally($red, 'game-1', 1)->assertOk()->assertExactJson(['counted' => false]);
    }

    public function test_a_game_against_young_accounts_only_counts_nothing(): void
    {
        [$red, $blue] = [$this->player(), $this->player(ageHours: 10)];
        $this->recordGame('game-1', $red, $blue);

        $this->tally($red, 'game-1', 3)->assertOk()->assertExactJson(['counted' => false]);
        $this->assertSame(0, $this->value($red, ActionCounter::PetanqueGames));
        $this->assertSame(0, $this->value($red, ActionCounter::PetanqueCarreaux));
    }

    public function test_unknown_games_other_players_and_bad_bodies_are_refused(): void
    {
        [$red, $blue, $stranger] = [$this->player(), $this->player(), $this->player()];
        $this->recordGame('game-1', $red, $blue);

        $this->tally($red, 'nope', 0)->assertStatus(409)->assertJson(['code' => 'petanque_match_unknown']);
        $this->tally($stranger, 'game-1', 0)->assertStatus(409)->assertJson(['code' => 'petanque_not_in_match']);
        $this->tally($red, 'game-1', 31)->assertStatus(422);
        $this->tally($red, 'game-1', -1)->assertStatus(422);
        $this->postJson('/api/sports/petanque/tally', ['ref' => 'game-1', 'carreaux' => 0], $this->auth($red['token']))->assertForbidden();
    }

    /**
     * @param  array{token: string, account_id: int}  $red
     * @param  array{token: string, account_id: int}  $blue
     */
    private function recordGame(string $ref, array $red, array $blue): void
    {
        $this->postJson('/api/sports/matches', [
            'ref' => $ref,
            'sport' => 'petanque',
            'venue' => 'petanque_1',
            'settings' => ['format' => '1v1_3', 'targetPoints' => 7],
            'startedAt' => 1_763_114_400_000,
            'endedAt' => 1_763_115_000_000,
            'players' => [
                ['accountId' => $red['account_id'], 'team' => 'red', 'result' => 'win', 'score' => 7],
                ['accountId' => $blue['account_id'], 'team' => 'blue', 'result' => 'loss', 'score' => 4],
            ],
        ], $this->auth($red['token'], self::SECRET))->assertOk();
    }

    /** @param array{token: string} $player */
    private function tally(array $player, string $ref, int $carreaux): TestResponse
    {
        return $this->postJson('/api/sports/petanque/tally', ['ref' => $ref, 'carreaux' => $carreaux], $this->auth($player['token'], self::SECRET));
    }

    /** @param array{account_id: int} $player */
    private function value(array $player, ActionCounter $counter): int
    {
        return app(ActionCounterService::class)->value($player['account_id'], $counter);
    }

    /** @return array{token: string, account_id: int} */
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

        return ['token' => (string) $reg->json('token'), 'account_id' => $accountId];
    }

    /** @return array<string, string> */
    private function auth(string $token, ?string $secret = null): array
    {
        $this->app['auth']->forgetGuards();

        return array_filter(['Authorization' => 'Bearer '.$token, 'X-Realtime-Secret' => $secret]);
    }
}
