<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class CharacterCosmeticApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\ShopSeeder::class);
    }

    public function test_cosmetics_requires_authentication(): void
    {
        $this->getJson('/api/character/cosmetics')->assertUnauthorized();
    }

    public function test_cosmetics_returns_slots_for_authenticated_user(): void
    {
        $token = $this->registerAndCreditWallet(10_000, 'coins')['token'];

        $res = $this->getJson('/api/character/cosmetics', [
            'Authorization' => 'Bearer '.$token,
        ]);

        $res->assertOk();
        $slots = $res->json('slots');
        $this->assertIsArray($slots);
        $this->assertArrayHasKey('body', $slots);
        $this->assertArrayHasKey('head_accessory', $slots);

        $colors = $res->json('colors');
        $this->assertIsArray($colors);
        $this->assertSame('#8B7AA8', $colors['body']);
        $this->assertArrayHasKey('head_accessory', $colors);
        $this->assertIsArray($res->json('owned'));
    }

    public function test_cosmetics_put_colors_only(): void
    {
        $token = $this->registerAndCreditWallet(10_000, 'coins')['token'];

        $res = $this->putJson('/api/character/cosmetics', [
            'colors' => [
                'body' => '#FF00AA',
                'hair' => '#112233',
            ],
        ], [
            'Authorization' => 'Bearer '.$token,
        ]);

        $res->assertOk();
        $this->assertSame('#FF00AA', $res->json('colors.body'));
        $this->assertSame('#112233', $res->json('colors.hair'));
        $this->assertSame('#9B8ABF', $res->json('colors.top'));
    }

    public function test_cosmetics_equip_rejects_unowned_item(): void
    {
        $token = $this->registerAndCreditWallet(10_000, 'coins')['token'];

        $otherDef = DB::table('item_defs')->where('code', 'chair_campus_basic')->first();
        $this->assertNotNull($otherDef);

        $this->putJson('/api/character/cosmetics', [
            'slots' => [
                'body' => (int) $otherDef->item_def_id,
            ],
        ], [
            'Authorization' => 'Bearer '.$token,
        ])->assertStatus(422);
    }

    public function test_cosmetics_equip_owned_wearable(): void
    {
        $token = $this->registerAndCreditWallet(10_000, 'coins')['token'];

        $def = DB::table('item_defs')->where('code', 'COS_WEAR_BODY_DEFAULT')->first();
        $this->assertNotNull($def);

        $res = $this->putJson('/api/character/cosmetics', [
            'slots' => [
                'body' => (int) $def->item_def_id,
            ],
        ], [
            'Authorization' => 'Bearer '.$token,
        ]);

        $res->assertOk();
        $body = $res->json('slots.body');
        $this->assertIsArray($body);
        $this->assertSame('COS_WEAR_BODY_DEFAULT', $body['code']);
        $this->assertArrayHasKey('preview_image', $body);
        $this->assertArrayHasKey('model_glb', $body);
    }

    public function test_cosmetic_purchase_is_account_locker_owned_and_available_for_all_account_characters(): void
    {
        $itemDefId = (int) DB::table('item_defs')->insertGetId([
            'code' => 'cosmetic_locker_shared_body',
            'name' => 'Locker Shared Body',
            'kind' => 'cosmetic',
            'rarity' => 2,
            'tradable' => true,
            'premium_only' => false,
            'bind' => 'none',
            'max_stack' => 1,
            'cosmetic_slot' => 'body',
            'preview_image' => '/storage/skins/previews/locker-shared.jpg',
            'model_glb' => '/storage/skins/models/locker-shared.glb',
            'created_at' => now(),
        ], 'item_def_id');

        $catalogId = DB::table('shop_catalog_items')->insertGetId([
            'item_def_id' => $itemDefId,
            'currency' => 'coins',
            'price' => 100,
            'allow_coins' => true,
            'coins_price' => 100,
            'allow_premium' => false,
            'premium_price' => null,
            'is_active' => true,
            'is_published' => true,
            'is_unique_per_account' => false,
            'stock_remaining' => null,
            'sort_order' => 12,
            'created_at' => now(),
            'updated_at' => now(),
        ], 'shop_catalog_item_id');

        $catalog = DB::table('shop_catalog_items')->where('shop_catalog_item_id', $catalogId)->first();
        $this->assertNotNull($catalog);

        ['token' => $token, 'account_id' => $accountId] = $this->registerAndCreditWallet(10_000, 'coins');

        $serverId = (int) DB::table('servers')->insertGetId([
            'name' => 'test-server-'.uniqid('', true),
            'created_at' => now(),
        ], 'server_id');
        DB::table('characters')->insert([
            [
                'account_id' => $accountId,
                'server_id' => $serverId,
                'name' => 'MainChar',
                'normalized' => 'mainchar_'.uniqid('', true),
                'created_at' => now(),
            ],
            [
                'account_id' => $accountId,
                'server_id' => $serverId,
                'name' => 'AltChar',
                'normalized' => 'altchar_'.uniqid('', true),
                'created_at' => now(),
            ],
        ]);

        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $catalog->public_id,
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$token,
        ])->assertOk();

        $this->putJson('/api/character/cosmetics', [
            'slots' => ['body' => $itemDefId],
        ], [
            'Authorization' => 'Bearer '.$token,
        ])->assertOk()->assertJsonPath('slots.body.code', 'cosmetic_locker_shared_body');

        $show = $this->getJson('/api/character/cosmetics', [
            'Authorization' => 'Bearer '.$token,
        ]);
        $show->assertOk();
        $owned = collect($show->json('owned'))->firstWhere('code', 'cosmetic_locker_shared_body');
        $this->assertNotNull($owned);
        $this->assertSame(1, $owned['quantity']);
    }

    public function test_starter_body_item_defs_use_front_origin_model_paths(): void
    {
        $account = $this->registerAndCreditWallet(10_000, 'coins');
        $token = $account['token'];

        $rows = DB::table('item_defs')
            ->whereIn('code', [
                'COS_WEAR_BODY_DEFAULT',
                'COS_WEAR_BODY_STREET_RUNNER',
                'COS_WEAR_BODY_SCHOLAR',
                'COS_WEAR_BODY_EXPLORER',
                'COS_WEAR_BODY_NIGHT_OWL',
                'COS_WEAR_BODY_NEON_RONIN',
                'COS_WEAR_BODY_STREET_LUXE',
                'COS_WEAR_BODY_ASTRAL_ORACLE',
            ])
            ->pluck('model_glb', 'code')
            ->all();

        $this->assertSame('/assets/skins/campus_classic/model.glb', $rows['COS_WEAR_BODY_DEFAULT'] ?? null);
        $this->assertSame('/assets/skins/street_runner/model.glb', $rows['COS_WEAR_BODY_STREET_RUNNER'] ?? null);
        $this->assertSame('/assets/skins/scholar/model.glb', $rows['COS_WEAR_BODY_SCHOLAR'] ?? null);
        $this->assertSame('/assets/skins/explorer/model.glb', $rows['COS_WEAR_BODY_EXPLORER'] ?? null);
        $this->assertSame('/assets/skins/night_owl/model.glb', $rows['COS_WEAR_BODY_NIGHT_OWL'] ?? null);
        $this->assertSame('/assets/skins/neon_ronin/model.glb', $rows['COS_WEAR_BODY_NEON_RONIN'] ?? null);
        $this->assertSame('/assets/skins/street_luxe/model.glb', $rows['COS_WEAR_BODY_STREET_LUXE'] ?? null);
        $this->assertSame('/assets/skins/astral_oracle/model.glb', $rows['COS_WEAR_BODY_ASTRAL_ORACLE'] ?? null);

        $previewImage = DB::table('item_defs')
            ->where('code', 'COS_WEAR_BODY_DEFAULT')
            ->value('preview_image');
        $this->assertSame('/assets/skins/campus_classic/preview.png', $previewImage);

        $def = DB::table('item_defs')->where('code', 'COS_WEAR_BODY_DEFAULT')->first();
        $this->assertNotNull($def);
        $this->putJson('/api/character/cosmetics', [
            'slots' => [
                'body' => (int) $def->item_def_id,
            ],
        ], [
            'Authorization' => 'Bearer '.$token,
        ])->assertOk();

        $response = $this->getJson('/api/character/cosmetics', [
            'Authorization' => 'Bearer '.$token,
        ]);
        $response->assertOk();
        // front-served assets are passed through untouched (not rewritten to the API host)
        $this->assertSame(
            '/assets/skins/campus_classic/preview.png',
            $response->json('slots.body.preview_image')
        );
        $this->assertSame(
            '/assets/skins/campus_classic/model.glb',
            $response->json('slots.body.model_glb')
        );
    }

    public function test_only_the_default_skin_is_free_and_the_others_are_sold(): void
    {
        $account = $this->registerAndCreditWallet(0, 'coins');

        $owned = DB::table('account_locker_cosmetics')
            ->join('item_defs', 'item_defs.item_def_id', '=', 'account_locker_cosmetics.item_def_id')
            ->where('account_locker_cosmetics.account_id', $account['account_id'])
            ->where('item_defs.cosmetic_slot', 'body')
            ->pluck('item_defs.code')
            ->all();
        $this->assertSame(['COS_WEAR_BODY_DEFAULT'], $owned);

        $sold = DB::table('shop_catalog_items')
            ->join('item_defs', 'item_defs.item_def_id', '=', 'shop_catalog_items.item_def_id')
            ->where('shop_catalog_items.is_active', true)
            ->where('item_defs.cosmetic_slot', 'body')
            ->orderBy('item_defs.code')
            ->pluck('item_defs.code')
            ->all();
        $this->assertSame([
            'COS_WEAR_BODY_ASTRAL_ORACLE',
            'COS_WEAR_BODY_EXPLORER',
            'COS_WEAR_BODY_NEON_RONIN',
            'COS_WEAR_BODY_NIGHT_OWL',
            'COS_WEAR_BODY_SCHOLAR',
            'COS_WEAR_BODY_STREET_LUXE',
            'COS_WEAR_BODY_STREET_RUNNER',
        ], $sold);
    }

    /**
     * @return array{token: string, account_id: int}
     */
    private function registerAndCreditWallet(int $coins, string $currency): array
    {
        $email = 'u'.uniqid('', true).'@test.com';
        $username = 'u'.substr(str_replace('.', '', uniqid('', true)), 0, 10);

        $reg = $this->postJson('/api/register', [
            'email' => $email,
            'username' => $username,
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
            'accepted_terms' => true,
            'age_confirmed' => true,
        ]);
        $reg->assertCreated();
        $accountId = (int) $reg->json('user.account_id');
        $token = $reg->json('token');

        $this->setWalletBalance($accountId, $currency, $coins);

        return ['token' => $token, 'account_id' => $accountId];
    }
}
