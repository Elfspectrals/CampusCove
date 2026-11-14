<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SkatingBoardTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_the_board_keeps_each_skater_best_time_of_the_week_per_lap_count(): void
    {
        [$ana, $ben] = [$this->player(), $this->player()];
        $this->travelTo(now()->parse('2026-11-18 12:00:00', 'UTC'));
        $this->race($ana, 3, 62000);
        $this->race($ana, 3, 58000);
        $this->race($ben, 3, 60000);
        $this->race($ben, 1, 21000);
        $this->race($ben, 3, 50000, 'dnf');

        $board = $this->getJson('/api/sports/skating/board', $this->auth($ana))->assertOk();
        $this->assertSame('2026-W47', $board->json('week'));
        $boards = collect($board->json('boards'))->keyBy('laps');
        $this->assertSame([1, 3, 5], $boards->keys()->all());
        $this->assertSame([58000, 60000], array_column($boards[3]['entries'], 'timeMs'));
        $this->assertSame([21000], array_column($boards[1]['entries'], 'timeMs'));
        $this->assertSame([], $boards[5]['entries']);
    }

    public function test_closing_the_week_crowns_the_fastest_once_per_lap_count_and_gives_the_badge(): void
    {
        [$ana, $ben] = [$this->player(), $this->player()];
        $this->travelTo(now()->parse('2026-11-18 12:00:00', 'UTC'));
        $this->race($ana, 3, 58000);
        $this->race($ben, 3, 60000);
        $this->race($ben, 5, 95000);
        $this->travelTo(now()->parse('2026-11-23 00:10:00', 'Europe/Paris'));

        $this->artisan('sports:skating-board-close')->assertSuccessful();
        $this->artisan('sports:skating-board-close')->assertSuccessful();

        $wins = DB::table('skating_board_wins')->orderBy('laps')->get();
        $this->assertSame([[3, $ana['id'], 58000], [5, $ben['id'], 95000]], $wins->map(fn ($w) => [(int) $w->laps, (int) $w->account_id, (int) $w->time_ms])->all());
        $this->assertSame(1, DB::table('account_badges')->where('account_id', $ana['id'])->where('badge', 'skating_champion')->count());
        $champions = $this->getJson('/api/sports/skating/board', $this->auth($ana))->json('champions');
        $this->assertSame([3, 5], array_column($champions, 'laps'));
    }

    /** @param array{id: int, token: string} $player */
    private function race(array $player, int $laps, int $timeMs, string $result = 'finished'): void
    {
        $end = now()->getTimestampMs();
        $this->postJson('/api/sports/matches', [
            'ref' => uniqid('skate', true),
            'sport' => 'skating',
            'venue' => 'rink_skating',
            'settings' => ['laps' => $laps],
            'startedAt' => $end - $timeMs,
            'endedAt' => $end,
            'players' => [$result === 'dnf'
                ? ['accountId' => $player['id'], 'team' => null, 'result' => 'dnf']
                : ['accountId' => $player['id'], 'team' => null, 'result' => $result, 'place' => 1, 'timeMs' => $timeMs]],
        ], $this->auth($player, self::SECRET))->assertOk();
    }

    /** @return array{id: int, token: string} */
    private function player(): array
    {
        $reg = $this->postJson('/api/register', [
            'email' => 'u'.uniqid('', true).'@test.com',
            'username' => 'u'.substr(str_replace('.', '', uniqid('', true)), 0, 10),
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
            'accepted_terms' => true,
            'age_confirmed' => true,
        ])->assertCreated();

        return ['id' => (int) $reg->json('user.account_id'), 'token' => (string) $reg->json('token')];
    }

    /** @param array{id: int, token: string} $player */
    private function auth(array $player, ?string $secret = null): array
    {
        $this->app['auth']->forgetGuards();

        return array_filter(['Authorization' => 'Bearer '.$player['token'], 'X-Realtime-Secret' => $secret]);
    }
}
