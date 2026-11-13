<?php

namespace Tests\Feature;

use App\Enums\ActionCounter;
use App\Services\ActionCounterService;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class TutorialProgressApiTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-realtime-secret';

    private const LOOK = [
        'sex' => 'm',
        'face' => 2,
        'build' => 'normal',
        'hair' => 'short',
        'skin_color' => '#C68E62',
        'hair_color' => '#2A1B12',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
        config(['services.realtime.secret' => self::SECRET, 'services.realtime.url' => 'http://socket.test']);
        Http::fake(['socket.test/*' => Http::response(['ok' => true])]);
    }

    public function test_six_apples_picked_move_on_to_eating_five_do_not(): void
    {
        $player = $this->createCharacter();

        $this->bump($player, ActionCounter::ApplesPicked, 5);
        $this->assertTutorial($player, 'active', 'pick_apples');

        $this->bump($player, ActionCounter::ApplesPicked);
        $this->assertTutorial($player, 'active', 'eat_apple');
    }

    public function test_only_what_is_done_during_a_step_counts(): void
    {
        $player = $this->createCharacter();
        $this->bump($player, ActionCounter::FoodEaten, 2);
        $this->bump($player, ActionCounter::ApplesPicked, 6);
        $this->assertTutorial($player, 'active', 'eat_apple');

        $this->bump($player, ActionCounter::FoodEaten);
        $this->assertTutorial($player, 'active', 'sell_apples');
    }

    public function test_a_counter_of_another_step_does_not_move_the_tutorial(): void
    {
        $player = $this->createCharacter();

        $this->bump($player, ActionCounter::DartsPlayed);
        $this->bump($player, ActionCounter::AtmDeposits);

        $this->assertTutorial($player, 'active', 'pick_apples');
    }

    public function test_the_whole_day_ends_the_tutorial_with_the_badge_and_tells_the_socket(): void
    {
        $player = $this->createCharacter();

        $this->bump($player, ActionCounter::ApplesPicked, 6);
        $this->bump($player, ActionCounter::FoodEaten);
        $this->bump($player, ActionCounter::ApplesSold);
        $this->bump($player, ActionCounter::AtmDeposits);
        $this->assertTutorial($player, 'active', 'play_darts');
        $this->getJson('/api/user', $this->auth($player['token']))->assertJsonPath('user.badges', []);

        $this->bump($player, ActionCounter::DartsPlayed);

        $this->assertTutorial($player, 'done', null);
        $this->getJson('/api/user', $this->auth($player['token']))->assertJsonPath('user.badges', ['new_citizen']);
        Http::assertSent(fn (HttpRequest $request): bool => $request->url() === 'http://socket.test/internal/tutorial-changed'
            && $request['accountId'] === $player['account_id']
            && $request['status'] === 'done'
            && $request['step'] === null);
    }

    public function test_a_skipped_tutorial_ignores_actions_and_starts_its_step_again_on_resume(): void
    {
        $player = $this->createCharacter();
        $this->postJson('/api/tutorial/skip', [], $this->auth($player['token']))->assertOk();

        $this->bump($player, ActionCounter::ApplesPicked, 6);
        $this->assertTutorial($player, 'skipped', 'pick_apples');

        $this->postJson('/api/tutorial/resume', [], $this->auth($player['token']))->assertOk();
        $this->bump($player, ActionCounter::ApplesPicked, 5);
        $this->assertTutorial($player, 'active', 'pick_apples');

        $this->bump($player, ActionCounter::ApplesPicked);
        $this->assertTutorial($player, 'active', 'eat_apple');
    }

    public function test_an_account_without_a_tutorial_is_left_alone(): void
    {
        $player = $this->register();

        $this->bump($player, ActionCounter::ApplesPicked, 6);

        $this->assertSame(0, DB::table('account_tutorials')->where('account_id', $player['account_id'])->count());
        Http::assertNothingSent();
    }

    public function test_the_free_tutorial_darts_game_ends_the_tutorial(): void
    {
        $player = $this->createCharacter();
        $this->bump($player, ActionCounter::ApplesPicked, 6);
        $this->bump($player, ActionCounter::FoodEaten);
        $this->bump($player, ActionCounter::ApplesSold);
        $this->bump($player, ActionCounter::AtmDeposits);
        $headers = $this->auth($player['token'], self::SECRET);

        $this->postJson('/api/pub/play', ['game' => 'darts'], $headers)->assertOk()->assertJsonPath('fee', 0);
        $this->postJson('/api/pub/reward', ['game' => 'darts', 'placement' => 0, 'score' => 60, 'free' => true], $headers)
            ->assertOk()
            ->assertJsonPath('coins', 0);

        $this->assertTutorial($player, 'done', null);
    }

    /** @param array{token: string, account_id: int} $player */
    private function bump(array $player, ActionCounter $counter, int $by = 1): void
    {
        app(ActionCounterService::class)->bump($player['account_id'], $counter, $by);
    }

    /** @param array{token: string, account_id: int} $player */
    private function assertTutorial(array $player, string $status, ?string $step): void
    {
        $this->getJson('/api/tutorial', $this->auth($player['token']))
            ->assertOk()
            ->assertExactJson(['status' => $status, 'step' => $step]);
    }

    /** @return array{token: string, account_id: int} */
    private function createCharacter(): array
    {
        $player = $this->register();
        $this->putJson('/api/character/appearance', self::LOOK, $this->auth($player['token']))->assertOk();

        return $player;
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
    private function auth(string $token, ?string $secret = null): array
    {
        $this->app['auth']->forgetGuards();

        return array_filter([
            'Authorization' => 'Bearer '.$token,
            'X-Realtime-Secret' => $secret,
        ]);
    }
}
