<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CharacterCosmeticApiTest extends TestCase
{
    use RefreshDatabase;

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

    public function test_starter_body_item_defs_are_kept_with_storage_asset_paths(): void
    {
        $account = $this->registerAndCreditWallet(10_000, 'coins');
        $token = $account['token'];

        $rows = DB::table('item_defs')
            ->whereIn('code', [
                'COS_WEAR_BODY_DEFAULT',
                'COS_WEAR_BODY_ADVENTURER',
                'COS_WEAR_BODY_SWORDSMAN',
            ])
            ->pluck('model_glb', 'code')
            ->all();

        $this->assertSame('/storage/skins/models/low_poly_character.glb', $rows['COS_WEAR_BODY_DEFAULT'] ?? null);
        $this->assertSame('/storage/skins/models/low_poly_adventurer.glb', $rows['COS_WEAR_BODY_ADVENTURER'] ?? null);
        $this->assertSame('/storage/skins/models/low_poly_character_swordsman.glb', $rows['COS_WEAR_BODY_SWORDSMAN'] ?? null);

        $previewImage = DB::table('item_defs')
            ->where('code', 'COS_WEAR_BODY_DEFAULT')
            ->value('preview_image');
        $this->assertSame('/storage/skins/previews/placeholderSkin.jpg', $previewImage);

        $response = $this->getJson('/api/character/cosmetics', [
            'Authorization' => 'Bearer '.$token,
        ]);
        $response->assertOk();
        $this->assertStringContainsString(
            '/api/assets/public/skins/previews/placeholderSkin.jpg',
            (string) $response->json('slots.body.preview_image')
        );
        $this->assertStringContainsString(
            '/api/assets/public/skins/models/low_poly_character.glb',
            (string) $response->json('slots.body.model_glb')
        );
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
        ]);
        $reg->assertCreated();
        $accountId = (int) $reg->json('user.account_id');
        $token = $reg->json('token');

        $walletId = (int) DB::table('wallets')->insertGetId([
            'owner_type' => 'account',
            'owner_id' => $accountId,
            'currency' => $currency,
            'created_at' => now(),
        ], 'wallet_id');

        DB::table('wallet_ledger')->insert([
            'wallet_id' => $walletId,
            'tx_id' => null,
            'delta' => $coins,
            'reason' => 'test_credit',
            'created_at' => now(),
        ]);

        return ['token' => $token, 'account_id' => $accountId];
    }
}
