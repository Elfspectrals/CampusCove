<?php

namespace Tests\Feature;

use App\Models\Wallet;
use App\Services\PoliceLicenceService;
use App\Services\TradeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class PoliceBountyApiTest extends TestCase
{
    use RefreshDatabase;
    use SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_only_the_realtime_server_asks_for_a_bounty(): void
    {
        $officer = $this->officer();
        $suspect = $this->veteran();

        $this->postJson('/api/police/bounty', $this->body($suspect, 3), $this->auth($officer['token']))->assertForbidden();
        $this->assertSame(0, $this->paid($officer));
    }

    public function test_the_officer_gets_15_coins_a_star_in_cash(): void
    {
        $officer = $this->officer();
        $suspect = $this->veteran();
        $stranger = $this->veteran();
        $this->crime($suspect, 'murder', 3, $stranger);

        $this->postJson('/api/police/bounty', $this->body($suspect, 3), $this->auth($officer['token'], self::SECRET))
            ->assertOk()
            ->assertJsonPath('bounty.paid', 45)
            ->assertJsonPath('bounty.stars', 3)
            ->assertJsonPath('bounty.reason', null)
            ->assertJsonPath('bounty.cash', 45);

        $this->assertSame(45, $this->paid($officer));
        $entry = DB::table('wallet_ledger')->where('reason', 'police_bounty')->sole();
        $this->assertSame(Wallet::lockForAccount($officer['account_id'], Wallet::CASH)->wallet_id, (int) $entry->wallet_id);
    }

    public function test_the_stars_paid_never_exceed_the_crimes_on_record(): void
    {
        $officer = $this->officer();
        $suspect = $this->veteran();
        $this->crime($suspect, 'assault', 1, $this->veteran());

        $this->postJson('/api/police/bounty', $this->body($suspect, 5), $this->auth($officer['token'], self::SECRET))
            ->assertJsonPath('bounty.paid', 15)
            ->assertJsonPath('bounty.stars', 1);
    }

    public function test_crimes_older_than_a_day_are_not_paid(): void
    {
        $officer = $this->officer();
        $suspect = $this->veteran();
        $this->crime($suspect, 'murder', 3, $this->veteran());
        DB::table('crime_records')->update(['created_at' => now()->subHours(25)]);

        $this->postJson('/api/police/bounty', $this->body($suspect, 3), $this->auth($officer['token'], self::SECRET))
            ->assertJsonPath('bounty.paid', 0)
            ->assertJsonPath('bounty.reason', 'no_crime_stars');
    }

    public function test_an_officer_earns_150_coins_a_day_at_most(): void
    {
        $officer = $this->officer();
        foreach (range(1, 3) as $i) {
            $suspect = $this->veteran();
            $this->crime($suspect, 'murder', 3, $this->veteran());
            $this->crime($suspect, 'bag_theft', 2, $this->veteran());
            $answer = $this->postJson('/api/police/bounty', $this->body($suspect, 5, "arrest-$i"), $this->auth($officer['token'], self::SECRET))->assertOk();
            $this->assertSame([75, 75, 0][$i - 1], $answer->json('bounty.paid'));
            $this->assertSame($i === 3 ? 'daily_cap' : null, $answer->json('bounty.reason'));
        }
        $this->assertSame(150, $this->paid($officer));

        DB::table('transactions')->where('type', 'reward')->update(['committed_at' => now()->subHours(25), 'created_at' => now()->subHours(25)]);
        $suspect = $this->veteran();
        $this->crime($suspect, 'assault', 1, $this->veteran());
        $this->postJson('/api/police/bounty', $this->body($suspect, 1), $this->auth($officer['token'], self::SECRET))->assertJsonPath('bounty.paid', 15);
    }

    public function test_the_cap_cuts_the_last_bounty_of_the_day(): void
    {
        $officer = $this->officer();
        $first = $this->veteran();
        $this->crime($first, 'murder', 3, $this->veteran());
        $this->crime($first, 'bag_theft', 2, $this->veteran());
        $this->postJson('/api/police/bounty', $this->body($first, 5, 'a'), $this->auth($officer['token'], self::SECRET))->assertJsonPath('bounty.paid', 75);
        $second = $this->veteran();
        $this->crime($second, 'murder', 3, $this->veteran());
        $this->postJson('/api/police/bounty', $this->body($second, 3, 'b'), $this->auth($officer['token'], self::SECRET))->assertJsonPath('bounty.paid', 45);
        $third = $this->veteran();
        $this->crime($third, 'murder', 3, $this->veteran());

        $this->postJson('/api/police/bounty', $this->body($third, 3, 'c'), $this->auth($officer['token'], self::SECRET))
            ->assertJsonPath('bounty.paid', 30)
            ->assertJsonPath('bounty.reason', 'daily_cap');
        $this->assertSame(150, $this->paid($officer));
    }

    public function test_the_same_suspect_pays_once_a_day_per_officer(): void
    {
        $officer = $this->officer();
        $suspect = $this->veteran();
        $this->crime($suspect, 'murder', 3, $this->veteran());
        $this->postJson('/api/police/bounty', $this->body($suspect, 3, 'first'), $this->auth($officer['token'], self::SECRET))->assertJsonPath('bounty.paid', 45);
        $this->crime($suspect, 'murder', 3, $this->veteran());

        $this->postJson('/api/police/bounty', $this->body($suspect, 3, 'second'), $this->auth($officer['token'], self::SECRET))
            ->assertJsonPath('bounty.paid', 0)
            ->assertJsonPath('bounty.reason', 'suspect_already_paid');

        $other = $this->officer();
        $this->postJson('/api/police/bounty', $this->body($suspect, 3, 'other'), $this->auth($other['token'], self::SECRET))->assertJsonPath('bounty.paid', 45);
        $this->assertSame(45, $this->paid($officer));
    }

    public function test_friends_get_no_bounty(): void
    {
        $officer = $this->officer();
        $suspect = $this->veteran();
        $this->crime($suspect, 'murder', 3, $this->veteran());
        DB::table('friendships')->insert([
            'account_id_a' => min($officer['account_id'], $suspect['account_id']),
            'account_id_b' => max($officer['account_id'], $suspect['account_id']),
            'status' => 'accepted',
            'requested_by' => $officer['account_id'],
        ]);

        $this->postJson('/api/police/bounty', $this->body($suspect, 3), $this->auth($officer['token'], self::SECRET))
            ->assertJsonPath('bounty.paid', 0)
            ->assertJsonPath('bounty.reason', 'friends');
    }

    public function test_a_pending_friend_request_does_not_block_the_bounty(): void
    {
        $officer = $this->officer();
        $suspect = $this->veteran();
        $this->crime($suspect, 'murder', 3, $this->veteran());
        DB::table('friendships')->insert([
            'account_id_a' => min($officer['account_id'], $suspect['account_id']),
            'account_id_b' => max($officer['account_id'], $suspect['account_id']),
            'status' => 'pending',
            'requested_by' => $suspect['account_id'],
        ]);

        $this->postJson('/api/police/bounty', $this->body($suspect, 3), $this->auth($officer['token'], self::SECRET))->assertJsonPath('bounty.paid', 45);
    }

    public function test_a_trade_in_the_last_7_days_blocks_the_bounty(): void
    {
        $officer = $this->officer();
        $suspect = $this->veteran();
        $this->crime($suspect, 'murder', 3, $this->veteran());
        $this->exchange('trade', $suspect, $officer, now()->subDays(6));

        $this->postJson('/api/police/bounty', $this->body($suspect, 3), $this->auth($officer['token'], self::SECRET))
            ->assertJsonPath('bounty.paid', 0)
            ->assertJsonPath('bounty.reason', 'recent_exchange');
    }

    public function test_a_bank_transfer_in_the_last_7_days_blocks_the_bounty(): void
    {
        $officer = $this->officer();
        $suspect = $this->veteran();
        $this->crime($suspect, 'murder', 3, $this->veteran());
        $this->exchange('bank_transfer', $officer, $suspect, now()->subDays(6));

        $this->postJson('/api/police/bounty', $this->body($suspect, 3), $this->auth($officer['token'], self::SECRET))
            ->assertJsonPath('bounty.paid', 0)
            ->assertJsonPath('bounty.reason', 'recent_exchange');
    }

    public function test_older_exchanges_and_exchanges_with_others_do_not_count(): void
    {
        $officer = $this->officer();
        $suspect = $this->veteran();
        $third = $this->veteran();
        $this->crime($suspect, 'murder', 3, $this->veteran());
        $this->exchange('trade', $suspect, $officer, now()->subDays(8));
        $this->exchange('bank_transfer', $officer, $suspect, now()->subDays(8));
        $this->exchange('trade', $suspect, $third, now()->subDay());
        $this->exchange('bank_transfer', $officer, $third, now()->subDay());

        $this->postJson('/api/police/bounty', $this->body($suspect, 3), $this->auth($officer['token'], self::SECRET))->assertJsonPath('bounty.paid', 45);
    }

    public function test_a_suspect_younger_than_72_hours_pays_nothing(): void
    {
        $officer = $this->officer();
        $suspect = $this->player();
        $this->crime($suspect, 'murder', 3, $this->veteran());

        $this->postJson('/api/police/bounty', $this->body($suspect, 3), $this->auth($officer['token'], self::SECRET))
            ->assertJsonPath('bounty.paid', 0)
            ->assertJsonPath('bounty.reason', 'suspect_too_new');
    }

    public function test_stars_from_crimes_against_the_officer_or_a_friend_are_not_paid(): void
    {
        $officer = $this->officer();
        $friend = $this->veteran();
        DB::table('friendships')->insert([
            'account_id_a' => min($officer['account_id'], $friend['account_id']),
            'account_id_b' => max($officer['account_id'], $friend['account_id']),
            'status' => 'accepted',
            'requested_by' => $friend['account_id'],
        ]);
        $suspect = $this->veteran();
        $this->crime($suspect, 'murder', 3, $this->veteran());
        $this->crime($suspect, 'assault', 1, $officer);
        $this->crime($suspect, 'assault', 1, $friend);

        $this->postJson('/api/police/bounty', $this->body($suspect, 2), $this->auth($officer['token'], self::SECRET))
            ->assertJsonPath('bounty.paid', 0)
            ->assertJsonPath('bounty.reason', 'no_crime_stars');

        $this->postJson('/api/police/bounty', $this->body($suspect, 5, 'all'), $this->auth($officer['token'], self::SECRET))
            ->assertJsonPath('bounty.paid', 45)
            ->assertJsonPath('bounty.stars', 3);
    }

    public function test_a_crime_without_victim_is_paid(): void
    {
        $officer = $this->officer();
        $suspect = $this->veteran();
        $this->crime($suspect, 'alarm', 2, null);

        $this->postJson('/api/police/bounty', $this->body($suspect, 2), $this->auth($officer['token'], self::SECRET))->assertJsonPath('bounty.paid', 30);
    }

    public function test_the_same_arrest_sent_twice_pays_once_and_answers_the_same(): void
    {
        $officer = $this->officer();
        $suspect = $this->veteran();
        $this->crime($suspect, 'murder', 3, $this->veteran());

        foreach (range(1, 2) as $_) {
            $this->postJson('/api/police/bounty', $this->body($suspect, 3, 'arrest-1'), $this->auth($officer['token'], self::SECRET))
                ->assertOk()
                ->assertJsonPath('bounty.paid', 45)
                ->assertJsonPath('bounty.stars', 3)
                ->assertJsonPath('bounty.reason', null);
        }

        $this->assertSame(45, $this->paid($officer));
        $this->assertSame(1, DB::table('wallet_ledger')->where('reason', 'police_bounty')->count());
    }

    public function test_a_broken_request_is_refused(): void
    {
        $officer = $this->officer();
        $suspect = $this->veteran();
        $auth = $this->auth($officer['token'], self::SECRET);

        $this->postJson('/api/police/bounty', $this->body($suspect, 0), $auth)->assertUnprocessable();
        $this->postJson('/api/police/bounty', $this->body($suspect, 6), $auth)->assertUnprocessable();
        $this->postJson('/api/police/bounty', ['suspect_account_id' => 999999, 'stars' => 1, 'ref' => 'x'], $auth)->assertUnprocessable();
        $this->postJson('/api/police/bounty', $this->body($officer, 1), $this->auth($officer['token'], self::SECRET))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'police_bounty_self');
        $unlicensed = $this->veteran();
        $this->postJson('/api/police/bounty', $this->body($suspect, 1), $this->auth($unlicensed['token'], self::SECRET))
            ->assertStatus(409)
            ->assertJsonPath('code', 'police_no_licence');
    }

    /** @param array{account_id: int} $suspect */
    private function body(array $suspect, int $stars, string $ref = 'arrest'): array
    {
        return ['suspect_account_id' => $suspect['account_id'], 'stars' => $stars, 'ref' => $ref];
    }

    /**
     * @param  array{token: string}  $suspect
     * @param  array{account_id: int}|null  $victim
     */
    private function crime(array $suspect, string $kind, int $stars, ?array $victim): void
    {
        $this->postJson('/api/crimes', ['kind' => $kind, 'stars' => $stars, 'victim_account_id' => $victim['account_id'] ?? null], $this->auth($suspect['token'], self::SECRET))
            ->assertCreated();
    }

    /**
     * @param  array{account_id: int}  $from
     * @param  array{account_id: int}  $to
     */
    private function exchange(string $type, array $from, array $to, \DateTimeInterface $at): void
    {
        $meta = $type === 'trade' ? ['trade_ref' => uniqid(), 'accounts' => [$from['account_id'], $to['account_id']]] : ['amount' => 10, 'ref' => uniqid()];
        $txId = DB::table('transactions')->insertGetId([
            'type' => $type,
            'status' => 'committed',
            'created_by_account_id' => $from['account_id'],
            'created_at' => $at,
            'committed_at' => $at,
            'meta_json' => json_encode($meta),
        ], 'tx_id');
        if ($type === 'bank_transfer') {
            foreach ([[$from, -10], [$to, 10]] as [$side, $delta]) {
                DB::table('wallet_ledger')->insert([
                    'wallet_id' => Wallet::lockForAccount($side['account_id'], Wallet::BANK)->wallet_id,
                    'tx_id' => $txId,
                    'delta' => $delta,
                    'reason' => $delta < 0 ? 'bank_transfer_out' : 'bank_transfer_in',
                ]);
            }
        }
    }

    /** @param array{account_id: int} $officer */
    private function paid(array $officer): int
    {
        return (int) DB::table('wallet_ledger')
            ->where('wallet_id', Wallet::lockForAccount($officer['account_id'], Wallet::CASH)->wallet_id)
            ->where('reason', 'police_bounty')
            ->sum('delta');
    }

    /** @return array{token: string, account_id: int} */
    private function officer(): array
    {
        $player = $this->veteran();
        $this->setWalletBalance($player['account_id'], 'coins', PoliceLicenceService::PRICE);
        $this->postJson('/api/police/licence', [], $this->auth($player['token'], self::SECRET))->assertOk();

        return $player;
    }

    /** @return array{token: string, account_id: int} */
    private function veteran(): array
    {
        $player = $this->player();
        DB::table('accounts')->where('account_id', $player['account_id'])->update(['created_at' => now()->subHours(TradeService::MIN_GIVER_AGE_HOURS + 1)]);

        return $player;
    }

    /** @return array{token: string, account_id: int} */
    private function player(): array
    {
        $reg = $this->postJson('/api/register', [
            'email' => 'u'.uniqid('', true).'@test.com',
            'username' => 'u'.substr(str_replace('.', '', uniqid('', true)), 0, 10),
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
            'accepted_terms' => true,
            'age_confirmed' => true,
        ]);
        $reg->assertCreated();

        return ['token' => (string) $reg->json('token'), 'account_id' => (int) $reg->json('user.account_id')];
    }

    /** @return array<string, string> */
    private function auth(string $token, ?string $secret = null): array
    {
        $this->app['auth']->forgetGuards();

        return array_filter(['Authorization' => 'Bearer '.$token, 'X-Realtime-Secret' => $secret]);
    }
}
