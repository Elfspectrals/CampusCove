<?php

namespace Tests\Feature;

use App\Services\AccountCosmeticService;
use Database\Seeders\ShopSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CharacterAppearanceApiTest extends TestCase
{
    use RefreshDatabase;

    private const LOOK = [
        'sex' => 'f',
        'face' => 3,
        'build' => 'broad',
        'hair' => 'ponytail',
        'skin_color' => '#C68E62',
        'hair_color' => '#2A1B12',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
    }

    public function test_a_new_account_has_no_character_yet(): void
    {
        $player = $this->register();

        $this->getJson('/api/character/appearance', $this->auth($player['token']))
            ->assertOk()
            ->assertJsonPath('created', false)
            ->assertJsonPath('sex', null)
            ->assertJsonPath('face', null)
            ->assertJsonPath('build', null);
        $this->getJson('/api/character/cosmetics', $this->auth($player['token']))->assertJsonPath('character', null);
    }

    public function test_creating_the_character_saves_it_and_dresses_the_newcomer(): void
    {
        $player = $this->register();

        $this->putJson('/api/character/appearance', self::LOOK, $this->auth($player['token']))
            ->assertOk()
            ->assertJsonPath('created', true)
            ->assertJsonPath('sex', 'f')
            ->assertJsonPath('face', 3)
            ->assertJsonPath('build', 'broad')
            ->assertJsonPath('hair', 'ponytail')
            ->assertJsonPath('skin_color', '#C68E62')
            ->assertJsonPath('hair_color', '#2A1B12');

        $this->getJson('/api/character/cosmetics', $this->auth($player['token']))
            ->assertOk()
            ->assertJsonPath('character', ['sex' => 'f', 'face' => 3, 'build' => 'broad']);
        $loadout = app(AccountCosmeticService::class)->getLoadout($player['account_id']);
        $this->assertSame('COS_WEAR_HAIR_PONYTAIL', $loadout['hair']['code']);
        $this->assertSame('COS_WEAR_TOP_NEWCOMER', $loadout['top']['code']);
        $this->assertSame('COS_WEAR_BOTTOM_NEWCOMER', $loadout['bottom']['code']);
        $this->assertSame('COS_WEAR_SHOES_NEWCOMER', $loadout['shoes']['code']);
    }

    public function test_editing_later_keeps_the_outfit_and_never_charges(): void
    {
        $player = $this->register();
        $this->putJson('/api/character/appearance', self::LOOK, $this->auth($player['token']))->assertOk();
        $hoodie = (int) DB::table('item_defs')->where('code', 'COS_WEAR_TOP_HOODIE')->value('item_def_id');
        DB::table('account_locker_cosmetics')->insert(['account_id' => $player['account_id'], 'item_def_id' => $hoodie, 'quantity' => 1]);
        app(AccountCosmeticService::class)->setLoadout($player['account_id'], ['top' => $hoodie]);
        $ledgerRows = DB::table('wallet_ledger')->count();

        $this->putJson('/api/character/appearance', [...self::LOOK, 'sex' => 'm', 'hair' => 'buzz'], $this->auth($player['token']))
            ->assertOk()
            ->assertJsonPath('sex', 'm')
            ->assertJsonPath('hair', 'buzz');

        $this->assertSame('COS_WEAR_TOP_HOODIE', app(AccountCosmeticService::class)->getLoadout($player['account_id'])['top']['code']);
        $this->assertSame($ledgerRows, DB::table('wallet_ledger')->count());
    }

    public function test_every_field_is_checked(): void
    {
        $player = $this->register();
        $bad = [
            'sex' => 'x',
            'face' => 7,
            'build' => 'tiny',
            'hair' => 'mohawk',
            'skin_color' => 'red',
            'hair_color' => '#12345',
        ];
        foreach ($bad as $field => $value) {
            $this->putJson('/api/character/appearance', [...self::LOOK, $field => $value], $this->auth($player['token']))
                ->assertUnprocessable()
                ->assertJsonValidationErrors($field);
        }
        $this->putJson('/api/character/appearance', ['sex' => 'm'], $this->auth($player['token']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['face', 'build', 'hair', 'skin_color', 'hair_color']);

        $this->getJson('/api/character/appearance', $this->auth($player['token']))->assertJsonPath('created', false);
    }

    public function test_the_database_refuses_a_half_made_character(): void
    {
        $player = $this->register();

        $this->expectException(QueryException::class);
        DB::table('accounts')->where('account_id', $player['account_id'])->update(['character_sex' => 'f']);
    }

    public function test_haircuts_are_no_longer_sold(): void
    {
        $listed = DB::table('shop_catalog_items')
            ->join('item_defs', 'item_defs.item_def_id', '=', 'shop_catalog_items.item_def_id')
            ->where('item_defs.cosmetic_slot', 'hair')
            ->where('shop_catalog_items.is_active', true)
            ->count();

        $this->assertSame(0, $listed);
    }

    public function test_it_needs_a_signed_in_player(): void
    {
        $this->getJson('/api/character/appearance')->assertUnauthorized();
        $this->putJson('/api/character/appearance', self::LOOK)->assertUnauthorized();
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
