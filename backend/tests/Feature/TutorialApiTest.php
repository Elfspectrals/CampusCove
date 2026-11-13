<?php

namespace Tests\Feature;

use App\Models\Account;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TutorialApiTest extends TestCase
{
    use RefreshDatabase;

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
    }

    public function test_an_account_without_a_character_has_no_tutorial(): void
    {
        $player = $this->register();

        $this->getJson('/api/tutorial', $this->auth($player['token']))
            ->assertOk()
            ->assertExactJson(['status' => 'none', 'step' => null]);
    }

    public function test_creating_the_character_starts_the_tutorial_at_the_first_step(): void
    {
        $player = $this->createCharacter();

        $this->getJson('/api/tutorial', $this->auth($player['token']))
            ->assertOk()
            ->assertExactJson(['status' => 'active', 'step' => 'pick_apples']);
    }

    public function test_editing_the_character_later_does_not_restart_a_skipped_tutorial(): void
    {
        $player = $this->createCharacter();
        $this->postJson('/api/tutorial/skip', [], $this->auth($player['token']))->assertOk();

        $this->putJson('/api/character/appearance', self::LOOK, $this->auth($player['token']))->assertOk();

        $this->getJson('/api/tutorial', $this->auth($player['token']))
            ->assertExactJson(['status' => 'skipped', 'step' => 'pick_apples']);
    }

    public function test_an_account_whose_character_already_existed_never_gets_the_tutorial(): void
    {
        $player = $this->register();
        Account::query()->where('account_id', $player['account_id'])->update([
            'character_sex' => 'f',
            'character_face' => 1,
            'character_build' => 'slim',
            'character_created_at' => now()->subDays(3),
        ]);

        $this->putJson('/api/character/appearance', self::LOOK, $this->auth($player['token']))->assertOk();

        $this->getJson('/api/tutorial', $this->auth($player['token']))
            ->assertExactJson(['status' => 'none', 'step' => null]);
    }

    public function test_skipping_keeps_the_step_and_resuming_brings_it_back(): void
    {
        $player = $this->createCharacter();
        DB::table('account_tutorials')->where('account_id', $player['account_id'])->update(['step' => 'deposit_cash']);

        $this->postJson('/api/tutorial/skip', [], $this->auth($player['token']))
            ->assertOk()
            ->assertExactJson(['status' => 'skipped', 'step' => 'deposit_cash']);
        $this->postJson('/api/tutorial/skip', [], $this->auth($player['token']))
            ->assertOk()
            ->assertExactJson(['status' => 'skipped', 'step' => 'deposit_cash']);

        $this->postJson('/api/tutorial/resume', [], $this->auth($player['token']))
            ->assertOk()
            ->assertExactJson(['status' => 'active', 'step' => 'deposit_cash']);
        $this->postJson('/api/tutorial/resume', [], $this->auth($player['token']))
            ->assertOk()
            ->assertExactJson(['status' => 'active', 'step' => 'deposit_cash']);
    }

    public function test_a_finished_tutorial_cannot_be_skipped_or_resumed(): void
    {
        $player = $this->createCharacter();
        DB::table('account_tutorials')->where('account_id', $player['account_id'])
            ->update(['step' => 'play_darts', 'status' => 'done', 'completed_at' => now()]);

        $this->getJson('/api/tutorial', $this->auth($player['token']))
            ->assertExactJson(['status' => 'done', 'step' => null]);
        $this->postJson('/api/tutorial/skip', [], $this->auth($player['token']))
            ->assertStatus(409)
            ->assertJsonPath('code', 'tutorial_done');
        $this->postJson('/api/tutorial/resume', [], $this->auth($player['token']))
            ->assertStatus(409)
            ->assertJsonPath('code', 'tutorial_done');
    }

    public function test_skipping_without_a_tutorial_is_refused(): void
    {
        $player = $this->register();

        $this->postJson('/api/tutorial/skip', [], $this->auth($player['token']))
            ->assertStatus(409)
            ->assertJsonPath('code', 'tutorial_none');
        $this->postJson('/api/tutorial/resume', [], $this->auth($player['token']))
            ->assertStatus(409)
            ->assertJsonPath('code', 'tutorial_none');
    }

    public function test_it_needs_a_signed_in_player(): void
    {
        $this->getJson('/api/tutorial')->assertUnauthorized();
        $this->postJson('/api/tutorial/skip')->assertUnauthorized();
        $this->postJson('/api/tutorial/resume')->assertUnauthorized();
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
    private function auth(string $token): array
    {
        $this->app['auth']->forgetGuards();

        return ['Authorization' => 'Bearer '.$token];
    }
}
