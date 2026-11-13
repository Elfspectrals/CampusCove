<?php

namespace Tests\Feature;

use App\Models\ItemDef;
use App\Models\ItemInstance;
use App\Services\AccountInventoryService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class JobToolTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_job_tools_are_unstacked_weapons_with_a_number_of_uses(): void
    {
        $tools = ItemDef::query()->where('kind', 'tool')->where('weapon', true)->pluck('max_uses', 'code')->all();

        $this->assertSame([
            'tool_crowbar' => 300,
            'tool_hammer' => 300,
            'tool_secateurs' => 600,
            'tool_wrench' => 300,
        ], collect($tools)->sortKeys()->all());
        $this->assertFalse((bool) ItemDef::query()->where('code', 'house_key')->value('weapon'));
    }

    public function test_a_granted_tool_starts_with_all_its_uses(): void
    {
        $accountId = $this->register()['account_id'];
        $secateurs = ItemDef::query()->where('code', 'tool_secateurs')->firstOrFail();

        app(AccountInventoryService::class)->grantItem($accountId, $secateurs, 2);

        $uses = ItemInstance::query()->where('owner_account_id', $accountId)->where('item_def_id', $secateurs->item_def_id)->pluck('uses_left')->all();
        $this->assertSame([600, 600], $uses);
    }

    public function test_uses_cannot_be_given_to_a_stackable_item(): void
    {
        $this->expectException(QueryException::class);

        DB::table('item_defs')->where('code', 'house_key')->update(['max_uses' => 10]);
    }

    public function test_holding_a_carried_tool_gives_its_uses_left(): void
    {
        $player = $this->register();
        $this->grant($player['account_id'], 'tool_crowbar');

        $this->postJson('/api/tools/hold', ['code' => 'tool_crowbar'], $this->realtime($player['token']))
            ->assertOk()
            ->assertExactJson(['code' => 'tool_crowbar', 'uses_left' => 300]);
    }

    public function test_a_tool_not_carried_or_not_a_weapon_cannot_be_held(): void
    {
        $player = $this->register();
        $this->grant($player['account_id'], 'house_key');

        foreach (['tool_hammer', 'house_key', 'farm_apple'] as $code) {
            $this->postJson('/api/tools/hold', ['code' => $code], $this->realtime($player['token']))
                ->assertStatus(422)
                ->assertJsonPath('code', 'tool_not_carried');
        }
    }

    public function test_each_wear_spends_one_use_of_the_most_worn_tool_and_breaks_it_at_zero(): void
    {
        $player = $this->register();
        $this->grant($player['account_id'], 'tool_wrench', 2);
        $worn = ItemInstance::query()->where('owner_account_id', $player['account_id'])->orderBy('item_instance_id')->firstOrFail();
        $worn->update(['uses_left' => 2]);
        $wear = fn () => $this->postJson('/api/tools/wear', ['code' => 'tool_wrench'], $this->realtime($player['token']))->assertOk();

        $wear()->assertExactJson(['code' => 'tool_wrench', 'uses_left' => 1]);
        $wear()->assertExactJson(['code' => 'tool_wrench', 'uses_left' => 0]);
        $wear()->assertExactJson(['code' => 'tool_wrench', 'uses_left' => 299]);

        $this->assertNull(ItemInstance::query()->find($worn->item_instance_id));
        $this->assertSame(1, ItemInstance::query()->where('owner_account_id', $player['account_id'])->count());
    }

    public function test_tool_routes_need_the_realtime_server(): void
    {
        $player = $this->register();
        $this->grant($player['account_id'], 'tool_hammer');
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer '.$player['token']];

        $this->postJson('/api/tools/hold', ['code' => 'tool_hammer'], $headers)->assertForbidden();
        $this->postJson('/api/tools/wear', ['code' => 'tool_hammer'], $headers)->assertForbidden();
        $this->assertSame(300, (int) ItemInstance::query()->where('owner_account_id', $player['account_id'])->value('uses_left'));
    }

    /** @return array<string, string> */
    private function realtime(string $token): array
    {
        $this->app['auth']->forgetGuards();

        return ['Authorization' => 'Bearer '.$token, 'X-Realtime-Secret' => self::SECRET];
    }

    private function grant(int $accountId, string $code, int $quantity = 1): void
    {
        app(AccountInventoryService::class)->grantItem($accountId, ItemDef::query()->where('code', $code)->firstOrFail(), $quantity);
    }

    /** @return array{token: string, account_id: int} */
    private function register(): array
    {
        $username = 'u'.substr(str_replace('.', '', uniqid('', true)), 0, 10);
        $reg = $this->postJson('/api/register', [
            'email' => $username.'@test.com',
            'username' => $username,
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
            'accepted_terms' => true,
            'age_confirmed' => true,
        ])->assertCreated();

        return ['token' => (string) $reg->json('token'), 'account_id' => (int) $reg->json('user.account_id')];
    }
}
