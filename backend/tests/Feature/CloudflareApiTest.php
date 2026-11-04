<?php

namespace Tests\Feature;

use App\Models\IpBan;
use App\Models\SecurityEvent;
use App\Services\IpBanService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CloudflareApiTest extends TestCase
{
    use RefreshDatabase;

    private const IP = '45.95.147.10';

    private const RULES_URL = 'https://api.cloudflare.com/client/v4/zones/zone-1/firewall/access_rules/rules';

    private function enableBanSync(int $createStatus = 200, int $deleteStatus = 200): void
    {
        config(['services.cloudflare.api_token' => 'cf-token', 'services.cloudflare.zone_id' => 'zone-1']);
        Http::fake([
            self::RULES_URL => Http::response(['success' => $createStatus === 200, 'result' => ['id' => 'rule-'.uniqid()]], $createStatus),
            self::RULES_URL.'/*' => Http::response(['success' => $deleteStatus === 200], $deleteStatus),
        ]);
    }

    private function probes(int $count, string $ip = self::IP): void
    {
        foreach (array_slice(['/.env', '/.git/config', '/wp-login.php', '/phpmyadmin', '/shell.php'], 0, $count) as $path) {
            $this->get($path, ['X-Forwarded-For' => $ip]);
        }
    }

    private function creates(): array
    {
        return Http::recorded(fn (HttpRequest $request) => $request->method() === 'POST' && $request->url() === self::RULES_URL)
            ->map(fn (array $pair) => $pair[0])->values()->all();
    }

    private function deletes(): array
    {
        return Http::recorded(fn (HttpRequest $request) => $request->method() === 'DELETE')
            ->map(fn (array $pair) => $pair[0]->url())->values()->all();
    }

    public function test_direct_requests_pass_while_enforcement_is_off(): void
    {
        config(['services.cloudflare.origin_secret' => 'origin-secret']);

        $this->getJson('/api/health')->assertOk();
    }

    public function test_enforcement_refuses_requests_that_skip_cloudflare(): void
    {
        config(['services.cloudflare.origin_secret' => 'origin-secret', 'services.cloudflare.enforce_origin' => true, 'services.realtime.secret' => 'realtime-secret']);
        $cloudflare = ['CF-Connecting-IP' => '1.2.3.4'];

        $this->getJson('/api/health')->assertForbidden()->assertJsonPath('code', 'direct_origin');
        $this->getJson('/api/health', $cloudflare + ['X-Origin-Secret' => 'guess'])->assertForbidden();
        $this->getJson('/api/health', $cloudflare + ['X-Origin-Secret' => 'origin-secret'])->assertOk();
        $this->getJson('/api/health', ['X-Realtime-Secret' => 'realtime-secret'])->assertOk();
        $this->assertSame(0, SecurityEvent::count());
    }

    public function test_enforcement_without_a_secret_fails_loudly(): void
    {
        config(['services.cloudflare.origin_secret' => '', 'services.cloudflare.enforce_origin' => true]);

        $this->getJson('/api/health')->assertServerError();
    }

    public function test_an_auto_ban_blocks_the_ip_in_cloudflare(): void
    {
        $this->enableBanSync();

        $this->probes(4);

        $creates = $this->creates();
        $this->assertCount(1, $creates);
        $this->assertSame('block', $creates[0]['mode']);
        $this->assertSame(['target' => 'ip', 'value' => self::IP], $creates[0]['configuration']);
        $this->assertSame(['Bearer cf-token'], $creates[0]->header('Authorization'));
        $this->assertNotNull(IpBan::sole()->cloudflare_rule_id);
    }

    public function test_an_ipv6_ban_uses_the_ip6_target(): void
    {
        $this->enableBanSync();

        $this->probes(4, '2a01:4f8:c17:1::1');

        $this->assertSame('ip6', $this->creates()[0]['configuration']['target']);
    }

    public function test_a_failed_block_is_retried_by_the_sync_command(): void
    {
        config(['services.cloudflare.api_token' => 'cf-token', 'services.cloudflare.zone_id' => 'zone-1']);
        Http::fake([self::RULES_URL => Http::sequence()
            ->push(['success' => false], 500)
            ->push(['success' => true, 'result' => ['id' => 'rule-retried']])]);
        $this->probes(4);
        $this->assertNull(IpBan::sole()->cloudflare_rule_id);

        $this->artisan('security:sync-cloudflare')->assertSuccessful();

        $this->assertSame('rule-retried', IpBan::sole()->cloudflare_rule_id);
    }

    public function test_an_expired_ban_is_unblocked_by_the_sync_command(): void
    {
        $this->enableBanSync();
        $this->probes(4);
        $ruleId = IpBan::sole()->cloudflare_rule_id;

        $this->travel(24)->hours();
        $this->travel(-1)->seconds();
        $this->artisan('security:sync-cloudflare')->assertSuccessful();
        $this->assertSame([], $this->deletes());

        $this->travel(1)->seconds();
        $this->artisan('security:sync-cloudflare')->assertSuccessful();

        $this->assertSame([self::RULES_URL.'/'.$ruleId], $this->deletes());
        $this->assertNull(IpBan::sole()->cloudflare_rule_id);
    }

    public function test_a_rule_already_gone_from_cloudflare_is_forgotten(): void
    {
        $this->enableBanSync(deleteStatus: 404);
        IpBan::create(['ip' => self::IP, 'reason' => IpBan::REASON_AUTO, 'expires_at' => now()->subMinute(), 'cloudflare_rule_id' => 'rule-gone']);

        $this->artisan('security:sync-cloudflare')->assertSuccessful();

        $this->assertNull(IpBan::sole()->cloudflare_rule_id);
    }

    public function test_a_failed_unblock_keeps_the_rule_for_the_next_sync(): void
    {
        $this->enableBanSync(deleteStatus: 500);
        IpBan::create(['ip' => self::IP, 'reason' => IpBan::REASON_AUTO, 'expires_at' => now()->subMinute(), 'cloudflare_rule_id' => 'rule-1']);

        $this->artisan('security:sync-cloudflare')->assertSuccessful();

        $this->assertSame('rule-1', IpBan::sole()->cloudflare_rule_id);
    }

    public function test_unban_unblocks_at_once(): void
    {
        $this->enableBanSync();
        IpBan::create(['ip' => self::IP, 'reason' => IpBan::REASON_MANUAL, 'cloudflare_rule_id' => 'rule-1']);

        $this->artisan('security:unban', ['ip' => self::IP])->assertSuccessful();

        $this->assertSame([self::RULES_URL.'/rule-1'], $this->deletes());
    }

    public function test_a_manual_ban_replaces_the_auto_rule(): void
    {
        $this->enableBanSync();
        IpBan::create(['ip' => self::IP, 'reason' => IpBan::REASON_AUTO, 'expires_at' => now()->addHours(24), 'cloudflare_rule_id' => 'rule-auto']);

        $adminId = (int) $this->postJson('/api/register', [
            'email' => 'cfadmin@test.com',
            'username' => 'cfadmin',
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
            'accepted_terms' => true,
            'age_confirmed' => true,
        ])->assertCreated()->json('user.account_id');

        app(IpBanService::class)->banManually(self::IP, permanent: true, adminId: $adminId, report: false);

        $this->assertSame([self::RULES_URL.'/rule-auto'], $this->deletes());
        $this->assertCount(1, $this->creates());
        $this->assertNotNull(IpBan::active()->sole()->cloudflare_rule_id);
    }

    public function test_nothing_is_sent_without_a_token_or_for_private_ips(): void
    {
        $this->probes(4);
        $this->enableBanSync();
        $this->probes(4, '10.0.0.5');

        Http::assertNothingSent();
        $this->assertSame(2, IpBan::count());
    }
}
