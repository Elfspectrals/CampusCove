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
        $accountId = $this->registerAccount();
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

    private function registerAccount(): int
    {
        $username = 'u'.substr(str_replace('.', '', uniqid('', true)), 0, 10);

        return (int) $this->postJson('/api/register', [
            'email' => $username.'@test.com',
            'username' => $username,
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
            'accepted_terms' => true,
            'age_confirmed' => true,
        ])->assertCreated()->json('user.account_id');
    }
}
