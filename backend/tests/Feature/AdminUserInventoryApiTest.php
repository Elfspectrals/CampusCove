<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AdminUserInventoryApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\ShopSeeder::class);
    }

    public function test_admin_can_create_and_soft_delete_and_restore_user(): void
    {
        $adminToken = $this->registerToken(true);

        $create = $this->postJson('/api/admin/users', [
            'username' => 'newadminuser',
            'email' => 'newadminuser@test.com',
            'password' => 'password1x',
            'is_admin' => false,
        ], [
            'Authorization' => 'Bearer '.$adminToken,
        ]);
        $create->assertCreated();
        $accountId = (int) $create->json('user.account_id');

        $this->deleteJson('/api/admin/users/'.$accountId, [], [
            'Authorization' => 'Bearer '.$adminToken,
        ])->assertNoContent();

        $this->assertSoftDeleted('accounts', ['account_id' => $accountId]);

        $this->postJson('/api/admin/users/'.$accountId.'/restore', [], [
            'Authorization' => 'Bearer '.$adminToken,
        ])->assertOk()
            ->assertJsonPath('user.account_id', $accountId);
    }

    public function test_suspended_or_banned_user_login_is_blocked_and_tokens_revoked(): void
    {
        $adminToken = $this->registerToken(true);
        $victim = $this->registerWithCredentials();
        $accountId = (int) $victim['account_id'];

        $this->postJson('/api/admin/users/'.$accountId.'/suspend', [
            'until' => now()->addHour()->toIso8601String(),
            'reason' => 'test suspend',
        ], ['Authorization' => 'Bearer '.$adminToken])->assertOk();

        $this->postJson('/api/login', [
            'email' => $victim['email'],
            'password' => $victim['password'],
        ])->assertStatus(403)
            ->assertJsonPath('code', 'account_suspended');

        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $accountId]);

        $this->postJson('/api/admin/users/'.$accountId.'/unsuspend', [], [
            'Authorization' => 'Bearer '.$adminToken,
        ])->assertOk();

        $this->postJson('/api/admin/users/'.$accountId.'/ban', [
            'reason' => 'test ban',
        ], ['Authorization' => 'Bearer '.$adminToken])->assertOk();

        $this->postJson('/api/login', [
            'email' => $victim['email'],
            'password' => $victim['password'],
        ])->assertStatus(403)
            ->assertJsonPath('code', 'account_banned');
    }

    public function test_admin_inventory_actions_grant_set_revoke_and_reset(): void
    {
        $adminToken = $this->registerToken(true);
        $victim = $this->registerWithCredentials();
        $accountId = (int) $victim['account_id'];

        $itemDef = DB::table('item_defs')->where('code', 'chair_campus_basic')->first();
        $this->assertNotNull($itemDef);

        $this->postJson('/api/admin/inventories/'.$accountId.'/grant', [
            'item_def_id' => $itemDef->item_def_id,
            'quantity' => 2,
        ], ['Authorization' => 'Bearer '.$adminToken])->assertOk();

        $this->postJson('/api/admin/inventories/'.$accountId.'/set-quantity', [
            'item_def_id' => $itemDef->item_def_id,
            'quantity' => 5,
        ], ['Authorization' => 'Bearer '.$adminToken])->assertOk();

        $this->postJson('/api/admin/inventories/'.$accountId.'/revoke', [
            'item_def_id' => $itemDef->item_def_id,
            'quantity' => 2,
        ], ['Authorization' => 'Bearer '.$adminToken])->assertOk();

        $show = $this->getJson('/api/admin/inventories/'.$accountId, [
            'Authorization' => 'Bearer '.$adminToken,
        ]);
        $show->assertOk();

        $row = collect($show->json('items'))->firstWhere('item_def_id', (int) $itemDef->item_def_id);
        $this->assertNotNull($row);
        $this->assertSame(3, $row['quantity']);

        $this->postJson('/api/admin/inventories/'.$accountId.'/reset', [], [
            'Authorization' => 'Bearer '.$adminToken,
        ])->assertOk();

        $afterReset = $this->getJson('/api/admin/inventories/'.$accountId, [
            'Authorization' => 'Bearer '.$adminToken,
        ]);
        $afterReset->assertOk();
        $this->assertSame([], $afterReset->json('items'));
    }

    private function registerToken(bool $admin = false): string
    {
        $created = $this->registerWithCredentials();
        if ($admin) {
            DB::table('accounts')->where('account_id', $created['account_id'])->update(['is_admin' => true]);
        }

        return $created['token'];
    }

    /**
     * @return array{token: string, account_id: int, email: string, password: string}
     */
    private function registerWithCredentials(): array
    {
        $email = 'u'.uniqid('', true).'@test.com';
        $username = 'u'.substr(str_replace('.', '', uniqid('', true)), 0, 10);
        $password = 'password1x';

        $reg = $this->postJson('/api/register', [
            'email' => $email,
            'username' => $username,
            'password' => $password,
            'password_confirmation' => $password,
        ]);
        $reg->assertCreated();

        return [
            'token' => (string) $reg->json('token'),
            'account_id' => (int) $reg->json('user.account_id'),
            'email' => $email,
            'password' => $password,
        ];
    }
}
