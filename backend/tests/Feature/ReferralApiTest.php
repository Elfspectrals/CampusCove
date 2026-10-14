<?php

namespace Tests\Feature;

use App\Services\ReferralService;
use App\Services\WelcomeBonusService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class ReferralApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\ShopSeeder::class);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_referral_code_is_stable_and_links_new_accounts(): void
    {
        $referrer = $this->register();
        $code = $this->getJson('/api/referrals', $this->auth($referrer))->assertOk()->json('code');
        $this->assertSame($code, $this->getJson('/api/referrals', $this->auth($referrer))->json('code'));

        $referee = $this->register(strtolower($code));
        $this->register('UNKNOWN1'); // unknown codes never block sign-up

        $summary = $this->getJson('/api/referrals', $this->auth($referrer))->assertOk();
        $summary->assertJsonCount(1, 'referees');
        $summary->assertJsonPath('referees.0.account_id', $referee['account_id']);
        $summary->assertJsonPath('referees.0.qualified', false);
        $summary->assertJsonPath('referees.0.progress.other_friends', 0);
    }

    public function test_both_players_are_paid_once_the_referee_qualifies(): void
    {
        $referrer = $this->register();
        $referee = $this->register($this->codeOf($referrer));

        // friendship with the referrer does not count
        $this->befriend($referee, $referrer);
        $this->befriend($referee, $this->register());
        $this->buySomethingWithCoins($referee);
        $this->assertNotPaid($referee);

        // second friend, but account still too young
        $this->befriend($referee, $this->register());
        $this->assertNotPaid($referee);

        Carbon::setTestNow(now()->addHours(ReferralService::MIN_ACCOUNT_AGE_HOURS + 1));
        $this->postJson('/api/login', ['email' => $referee['email'], 'password' => 'password1x'])->assertOk();

        $this->assertDatabaseHas('wallet_ledger', ['reason' => 'referral_referee', 'delta' => ReferralService::REFEREE_REWARD]);
        $this->assertDatabaseHas('wallet_ledger', ['reason' => 'referral_referrer', 'delta' => ReferralService::REFERRER_REWARD]);
        $this->getJson('/api/referrals', $this->auth($referrer))->assertJsonPath('referees.0.qualified', true);

        // paid only once
        $this->postJson('/api/login', ['email' => $referee['email'], 'password' => 'password1x'])->assertOk();
        $this->assertSame(1, DB::table('wallet_ledger')->where('reason', 'referral_referrer')->count());
    }

    public function test_referrer_reward_is_capped_per_month(): void
    {
        $referrer = $this->register();
        $code = $this->codeOf($referrer);
        $friends = [$this->register(), $this->register()];

        $referees = [];
        for ($i = 0; $i <= ReferralService::MAX_REWARDED_PER_MONTH; $i++) {
            $referee = $this->register($code);
            DB::table('accounts')->where('account_id', $referee['account_id'])->update(['created_at' => now()->subDays(4)]);
            foreach ($friends as $friend) {
                $this->befriend($referee, $friend);
            }
            $referees[] = $referee;
        }
        foreach ($referees as $referee) {
            $this->buySomethingWithCoins($referee);
        }

        $this->assertSame(ReferralService::MAX_REWARDED_PER_MONTH, DB::table('wallet_ledger')->where('reason', 'referral_referrer')->count());
        $this->assertSame(ReferralService::MAX_REWARDED_PER_MONTH + 1, DB::table('wallet_ledger')->where('reason', 'referral_referee')->count());
    }

    /** @return array{token: string, account_id: int, email: string} */
    private function register(?string $referralCode = null): array
    {
        $email = 'u'.uniqid('', true).'@test.com';
        $payload = [
            'email' => $email,
            'username' => 'u'.Str::lower(Str::random(12)),
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
        ];
        if ($referralCode !== null) {
            $payload['referral_code'] = $referralCode;
        }
        $reg = $this->postJson('/api/register', $payload)->assertCreated();

        return ['token' => (string) $reg->json('token'), 'account_id' => (int) $reg->json('user.account_id'), 'email' => $email];
    }

    private function codeOf(array $account): string
    {
        return (string) $this->getJson('/api/referrals', $this->auth($account))->json('code');
    }

    private function befriend(array $from, array $to): void
    {
        $handle = DB::table('account_handles')->where('account_id', $to['account_id'])->first();
        $this->postJson('/api/friends/request', ['username' => $handle->username, 'tag' => $handle->tag], $this->auth($from))->assertSuccessful();
        $this->postJson('/api/friends/accept/'.$from['account_id'], [], $this->auth($to))->assertSuccessful();
    }

    private function buySomethingWithCoins(array $account): void
    {
        $this->setWalletBalance($account['account_id'], 'coins', 1000);
        $plant = DB::table('shop_catalog_items')
            ->join('item_defs', 'item_defs.item_def_id', '=', 'shop_catalog_items.item_def_id')
            ->where('item_defs.code', 'decor_potted_plant')
            ->value('shop_catalog_items.public_id');
        $this->postJson('/api/shop/purchase', ['shop_item_public_id' => $plant, 'quantity' => 1], $this->auth($account))->assertOk();
    }

    private function assertNotPaid(array $referee): void
    {
        $this->assertNull(DB::table('referrals')->where('referee_account_id', $referee['account_id'])->value('qualified_at'));
        $this->assertSame(0, DB::table('wallet_ledger')->where('reason', 'referral_referee')->count());
    }

    /** @return array<string, string> */
    private function auth(array $account): array
    {
        // the auth guard caches the first resolved user across requests of a test
        $this->app['auth']->forgetGuards();

        return ['Authorization' => 'Bearer '.$account['token']];
    }
}
