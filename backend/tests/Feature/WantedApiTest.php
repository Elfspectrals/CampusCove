<?php

namespace Tests\Feature;

use App\Services\WantedService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class WantedApiTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_only_the_realtime_server_reads_saves_and_records(): void
    {
        $player = $this->player();

        $this->getJson('/api/wanted', $this->auth($player['token']))->assertForbidden()->assertJsonPath('code', 'realtime_only');
        $this->putJson('/api/wanted', ['stars' => 1, 'decay_ms' => 1000], $this->auth($player['token']))->assertForbidden();
        $this->postJson('/api/crimes', ['kind' => 'assault', 'stars' => 1], $this->auth($player['token'], 'wrong'))->assertForbidden();
        $this->assertSame(0, DB::table('crime_records')->count());
    }

    public function test_a_new_player_is_not_wanted(): void
    {
        $player = $this->player();

        $this->getJson('/api/wanted', $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertJsonPath('wanted.stars', 0)
            ->assertJsonPath('wanted.decay_ms', WantedService::DECAY_MS);
    }

    public function test_the_saved_level_survives_a_reconnect(): void
    {
        $player = $this->player();
        $headers = $this->auth($player['token'], self::SECRET);

        $this->putJson('/api/wanted', ['stars' => 3, 'decay_ms' => 90_000], $headers)->assertOk()->assertJsonPath('wanted.stars', 3);
        $this->putJson('/api/wanted', ['stars' => 2, 'decay_ms' => 120_000], $this->auth($player['token'], self::SECRET))->assertOk();

        $this->getJson('/api/wanted', $this->auth($player['token'], self::SECRET))
            ->assertJsonPath('wanted.stars', 2)
            ->assertJsonPath('wanted.decay_ms', 120_000);
    }

    public function test_a_level_out_of_range_is_refused(): void
    {
        $player = $this->player();

        foreach ([['stars' => 6, 'decay_ms' => 1000], ['stars' => -1, 'decay_ms' => 1000], ['stars' => 2, 'decay_ms' => 0], ['stars' => 2, 'decay_ms' => WantedService::DECAY_MS + 1]] as $body) {
            $this->putJson('/api/wanted', $body, $this->auth($player['token'], self::SECRET))->assertUnprocessable();
        }
    }

    public function test_each_crime_is_written_to_the_record(): void
    {
        $player = $this->player();

        $this->postJson('/api/crimes', ['kind' => 'murder', 'stars' => 3], $this->auth($player['token'], self::SECRET))->assertCreated();
        $this->postJson('/api/crimes', ['kind' => 'assault', 'stars' => 1], $this->auth($player['token'], self::SECRET))->assertCreated();

        $this->assertSame(
            [['murder', 3], ['assault', 1]],
            DB::table('crime_records')->where('account_id', $player['account_id'])->orderBy('id')->get()
                ->map(fn ($row) => [$row->kind, (int) $row->stars])->all()
        );
    }

    public function test_an_unknown_crime_is_refused(): void
    {
        $player = $this->player();

        $this->postJson('/api/crimes', ['kind' => 'jaywalking', 'stars' => 1], $this->auth($player['token'], self::SECRET))->assertUnprocessable();
        $this->postJson('/api/crimes', ['kind' => 'assault', 'stars' => 0], $this->auth($player['token'], self::SECRET))->assertUnprocessable();
        $this->assertSame(0, DB::table('crime_records')->count());
    }

    public function test_a_crime_keeps_its_victim(): void
    {
        $player = $this->player();
        $victim = $this->player();

        $this->postJson('/api/crimes', ['kind' => 'assault', 'stars' => 1, 'victim_account_id' => $victim['account_id']], $this->auth($player['token'], self::SECRET))->assertCreated();
        $this->postJson('/api/crimes', ['kind' => 'alarm', 'stars' => 2], $this->auth($player['token'], self::SECRET))->assertCreated();
        $this->postJson('/api/crimes', ['kind' => 'assault', 'stars' => 1, 'victim_account_id' => 999999], $this->auth($player['token'], self::SECRET))->assertUnprocessable();

        $this->assertSame(
            [$victim['account_id'], null],
            DB::table('crime_records')->orderBy('id')->pluck('victim_account_id')->map(fn ($id) => $id === null ? null : (int) $id)->all()
        );
    }

    public function test_the_database_refuses_an_unknown_crime_kind(): void
    {
        $player = $this->player();

        $this->expectException(QueryException::class);
        DB::table('crime_records')->insert(['account_id' => $player['account_id'], 'kind' => 'jaywalking', 'stars' => 1]);
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

        return ['token' => (string) $reg->json('token'), 'account_id' => (int) $reg->json('user.account_id')];
    }

    /** @return array<string, string> */
    private function auth(string $token, ?string $secret = null): array
    {
        $this->app['auth']->forgetGuards();

        return array_filter(['Authorization' => 'Bearer '.$token, 'X-Realtime-Secret' => $secret]);
    }
}
