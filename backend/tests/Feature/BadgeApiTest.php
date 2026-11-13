<?php

namespace Tests\Feature;

use App\Services\BadgeService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BadgeApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_new_account_has_no_badge(): void
    {
        $player = $this->register();

        $this->getJson('/api/user', $this->auth($player['token']))
            ->assertOk()
            ->assertJsonPath('user.badges', []);
    }

    public function test_a_badge_is_granted_once_and_shown_on_the_account(): void
    {
        $player = $this->register();
        $badges = app(BadgeService::class);

        $badges->grant($player['account_id'], BadgeService::NEW_CITIZEN);
        $badges->grant($player['account_id'], BadgeService::NEW_CITIZEN);

        $this->getJson('/api/user', $this->auth($player['token']))
            ->assertOk()
            ->assertJsonPath('user.badges', ['new_citizen']);
    }

    public function test_an_unknown_badge_is_refused(): void
    {
        $player = $this->register();

        $this->expectException(QueryException::class);
        app(BadgeService::class)->grant($player['account_id'], 'made_up');
    }

    /** @return array{token: string, account_id: int} */
    private function register(): array
    {
        $reg = $this->postJson('/api/register', [
            'email' => 'u'.uniqid('', true).'@test.com',
            'username' => 'u'.substr(str_replace('.', '', uniqid('', true)), 0, 10),
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
            'accepted_terms' => true,
            'age_confirmed' => true,
        ])->assertCreated();

        return ['token' => (string) $reg->json('token'), 'account_id' => (int) $reg->json('user.account_id')];
    }

    /** @return array<string, string> */
    private function auth(string $token): array
    {
        $this->app['auth']->forgetGuards();

        return ['Authorization' => 'Bearer '.$token];
    }
}
