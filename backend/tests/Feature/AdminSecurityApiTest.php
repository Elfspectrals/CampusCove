<?php

namespace Tests\Feature;

use App\Models\IpBan;
use App\Models\IpReputation;
use App\Models\SecurityEvent;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AdminSecurityApiTest extends TestCase
{
    use RefreshDatabase;

    private const IP = '45.95.147.10';

    private array $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->register(admin: true);
    }

    private function register(bool $admin = false): array
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
        $accountId = (int) $reg->json('user.account_id');
        if ($admin) {
            DB::table('accounts')->where('account_id', $accountId)->update(['is_admin' => true]);
        }

        return ['account_id' => $accountId, 'headers' => ['Authorization' => 'Bearer '.$reg->json('token')]];
    }

    private function event(string $type, CarbonImmutable $at, string $ip = self::IP, string $path = '/', ?string $country = null): void
    {
        SecurityEvent::create(['ip' => $ip, 'type' => $type, 'method' => 'GET', 'path' => $path, 'country' => $country])
            ->forceFill(['created_at' => $at])
            ->save();
    }

    public function test_security_routes_are_admin_only(): void
    {
        $player = $this->register();
        $routes = [
            ['GET', '/api/admin/security/overview'],
            ['GET', '/api/admin/security/events'],
            ['GET', '/api/admin/security/bans'],
            ['GET', '/api/admin/security/ips/'.self::IP],
            ['POST', '/api/admin/security/ips/'.self::IP.'/ban'],
            ['POST', '/api/admin/security/ips/'.self::IP.'/unban'],
        ];

        foreach ($routes as [$method, $path]) {
            $this->app['auth']->forgetGuards();
            $this->json($method, $path)->assertUnauthorized();
            $this->json($method, $path, [], $player['headers'])->assertForbidden()->assertJsonPath('code', 'admin_required');
        }
    }

    public function test_overview_counts_live_ips_hours_and_the_day(): void
    {
        $now = CarbonImmutable::parse('2026-11-04 14:20:00', 'UTC');
        $this->travelTo($now);
        $this->event(SecurityEvent::TYPE_PROBE_PATH, $now->subMinutes(10)->addSecond(), '198.51.100.1');
        $this->event(SecurityEvent::TYPE_PROBE_PATH, $now->subMinutes(10), '198.51.100.2');
        $this->event(SecurityEvent::TYPE_LOGIN_FAILED, $now->setTime(13, 59, 59), '198.51.100.3');
        $this->event(SecurityEvent::TYPE_LOGIN_FAILED, $now->setTime(14, 0), '198.51.100.3');
        $this->event(SecurityEvent::TYPE_LOGIN_FAILED, $now->subDay()->setTime(14, 30), '198.51.100.3');
        $this->event(SecurityEvent::TYPE_LOGIN_FAILED, $now->subDay()->setTime(14, 20), '198.51.100.3');

        $overview = $this->getJson('/api/admin/security/overview', $this->admin['headers'])->assertOk();

        $overview->assertJsonPath('live_ips', 1)
            ->assertJsonPath('events_24h', 5)
            ->assertJsonPath('login_failed_24h', 3)
            ->assertJsonPath('by_type_24h.probe_path', 2)
            ->assertJsonPath('by_type_24h.injection', 0);
        $hourly = $overview->json('hourly');
        $this->assertCount(24, $hourly);
        $this->assertSame('2026-11-03T15:00:00+00:00', $hourly[0]['hour']);
        $this->assertSame(['2026-11-04T13:00:00+00:00', 1], [$hourly[22]['hour'], $hourly[22]['events']]);
        $this->assertSame(['2026-11-04T14:00:00+00:00', 3], [$hourly[23]['hour'], $hourly[23]['events']]);
        $this->assertSame(5, array_sum(array_column($hourly, 'events')) + 1);
    }

    public function test_overview_ranks_ips_with_their_status(): void
    {
        $now = CarbonImmutable::now();
        foreach ([SecurityEvent::TYPE_INJECTION, SecurityEvent::TYPE_PROBE_PATH, SecurityEvent::TYPE_LOGIN_FAILED] as $type) {
            $this->event($type, $now, '198.51.100.49');
        }
        foreach ([SecurityEvent::TYPE_PROBE_PATH, SecurityEvent::TYPE_PROBE_PATH, SecurityEvent::TYPE_RATE_LIMITED] as $type) {
            $this->event($type, $now, '198.51.100.50', country: 'DE');
        }
        $this->event(SecurityEvent::TYPE_LOGIN_FAILED, $now, self::IP);
        IpBan::create(['ip' => self::IP, 'reason' => IpBan::REASON_MANUAL]);
        IpReputation::create(['ip' => self::IP, 'abuse_confidence' => 0, 'country' => 'NL', 'is_tor' => false, 'total_reports' => 0, 'checked_at' => $now]);

        $overview = $this->getJson('/api/admin/security/overview', $this->admin['headers'])->assertOk();

        $this->assertSame([
            ['ip' => '198.51.100.50', 'score' => 50, 'status' => 'suspect', 'country' => 'DE'],
            ['ip' => '198.51.100.49', 'score' => 49, 'status' => 'normal', 'country' => null],
            ['ip' => self::IP, 'score' => 4, 'status' => 'banned', 'country' => 'NL'],
        ], $overview->json('top_ips'));
        $overview->assertJsonPath('suspect_ips', 1)->assertJsonPath('active_bans', 1);
        $this->assertSame([
            ['country' => null, 'events' => 3],
            ['country' => 'DE', 'events' => 3],
            ['country' => 'NL', 'events' => 1],
        ], collect($overview->json('top_countries'))->sortBy([['events', 'desc'], ['country', 'asc']])->values()->all());
    }

    public function test_overview_top_paths_drop_query_strings(): void
    {
        $now = CarbonImmutable::now();
        $this->event(SecurityEvent::TYPE_PROBE_PATH, $now, path: '/.env?token=abc');
        $this->event(SecurityEvent::TYPE_PROBE_PATH, $now, path: '/.env');
        $this->event(SecurityEvent::TYPE_PROBE_PATH, $now, path: '/wp-login.php');
        $this->event(SecurityEvent::TYPE_LOGIN_FAILED, $now, path: '/api/login');

        $this->getJson('/api/admin/security/overview', $this->admin['headers'])
            ->assertJsonPath('top_paths', [['path' => '/.env', 'events' => 2], ['path' => '/wp-login.php', 'events' => 1]]);
    }

    public function test_events_are_paged_newest_first_and_filtered(): void
    {
        $now = CarbonImmutable::now();
        for ($i = 0; $i < 51; $i++) {
            $this->event(SecurityEvent::TYPE_PROBE_PATH, $now);
        }
        $this->event(SecurityEvent::TYPE_LOGIN_FAILED, $now, '198.51.100.7');

        $first = $this->getJson('/api/admin/security/events?type=probe_path', $this->admin['headers'])->assertOk();
        $this->assertCount(50, $first->json('events'));
        $this->assertGreaterThan($first->json('events.1.id'), $first->json('events.0.id'));
        $second = $this->getJson('/api/admin/security/events?type=probe_path&before_id='.$first->json('next_before_id'), $this->admin['headers']);
        $this->assertCount(1, $second->json('events'));
        $second->assertJsonPath('next_before_id', null);

        $this->getJson('/api/admin/security/events?ip=198.51.100.7', $this->admin['headers'])->assertJsonCount(1, 'events');
        $this->getJson('/api/admin/security/events?type=nope', $this->admin['headers'])->assertUnprocessable();
    }

    public function test_ip_detail_shows_score_reputation_events_and_bans(): void
    {
        $this->event(SecurityEvent::TYPE_PROBE_PATH, CarbonImmutable::now(), path: '/.env');
        IpReputation::create(['ip' => self::IP, 'abuse_confidence' => 100, 'country' => 'NL', 'isp' => 'Example Hosting', 'is_tor' => true, 'total_reports' => 9, 'checked_at' => now()]);

        $this->getJson('/api/admin/security/ips/'.self::IP, $this->admin['headers'])->assertOk()
            ->assertJsonPath('score', 50)
            ->assertJsonPath('status', 'suspect')
            ->assertJsonPath('reputation.abuse_confidence', 100)
            ->assertJsonPath('reputation.is_tor', true)
            ->assertJsonPath('events.events.0.path', '/.env')
            ->assertJsonPath('events.events.0.country', 'NL')
            ->assertJsonPath('events.next_before_id', null)
            ->assertJsonPath('bans', []);
        $this->getJson('/api/admin/security/ips/not-an-ip', $this->admin['headers'])->assertUnprocessable();
    }

    public function test_a_manual_permanent_ban_replaces_the_auto_ban_and_kicks(): void
    {
        config(['services.realtime.secret' => 'realtime-secret', 'services.realtime.url' => 'http://socket.test', 'services.abuseipdb.key' => 'abuse-key']);
        Http::fake();
        $auto = IpBan::create(['ip' => self::IP, 'reason' => IpBan::REASON_AUTO, 'score' => 80, 'expires_at' => now()->addHours(24)]);

        $this->postJson('/api/admin/security/ips/'.self::IP.'/ban', ['duration' => 'permanent', 'report' => false], $this->admin['headers'])
            ->assertCreated()
            ->assertJsonPath('ban.reason', 'manual')
            ->assertJsonPath('ban.expires_at', null)
            ->assertJsonPath('ban.banned_by_account_id', $this->admin['account_id']);

        $this->assertSame($this->admin['account_id'], $auto->fresh()->lifted_by_account_id);
        $this->assertSame(1, IpBan::active()->where('ip', self::IP)->count());
        Http::assertSent(fn (HttpRequest $request) => $request->url() === 'http://socket.test/internal/ip-banned');
        Http::assertNotSent(fn (HttpRequest $request) => str_contains($request->url(), 'abuseipdb'));
    }

    public function test_a_manual_ban_is_reported_only_when_asked(): void
    {
        config(['services.abuseipdb.key' => 'abuse-key']);
        Http::fake();
        $this->event(SecurityEvent::TYPE_PROBE_PATH, CarbonImmutable::now(), path: '/.env');

        $this->postJson('/api/admin/security/ips/'.self::IP.'/ban', ['duration' => '24h', 'report' => true], $this->admin['headers'])
            ->assertCreated();

        $this->assertTrue(IpBan::sole()->expires_at->between(now()->addHours(24)->subSecond(), now()->addHours(24)));
        Http::assertSent(fn (HttpRequest $request) => $request->url() === 'https://api.abuseipdb.com/api/v2/report' && $request['ip'] === self::IP);
    }

    public function test_an_admin_cannot_ban_their_own_ip(): void
    {
        $this->postJson('/api/admin/security/ips/127.0.0.1/ban', ['duration' => '24h', 'report' => false], $this->admin['headers'])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'own_ip');

        $this->assertFalse(IpBan::exists());
    }

    public function test_ban_rejects_bad_input(): void
    {
        $this->postJson('/api/admin/security/ips/not-an-ip/ban', ['duration' => '24h', 'report' => false], $this->admin['headers'])->assertUnprocessable();
        $this->postJson('/api/admin/security/ips/'.self::IP.'/ban', ['duration' => 'forever', 'report' => false], $this->admin['headers'])->assertUnprocessable();
    }

    public function test_unban_lifts_the_ban_then_reports_not_banned(): void
    {
        IpBan::create(['ip' => self::IP, 'reason' => IpBan::REASON_MANUAL]);

        $this->postJson('/api/admin/security/ips/'.self::IP.'/unban', [], $this->admin['headers'])
            ->assertOk()
            ->assertJsonPath('ip.status', 'normal')
            ->assertJsonPath('ip.bans.0.lifted_by_account_id', $this->admin['account_id']);
        $this->postJson('/api/admin/security/ips/'.self::IP.'/unban', [], $this->admin['headers'])
            ->assertNotFound()
            ->assertJsonPath('code', 'not_banned');
    }

    public function test_bans_lists_only_active_ones(): void
    {
        IpBan::create(['ip' => self::IP, 'reason' => IpBan::REASON_MANUAL]);
        IpBan::create(['ip' => '198.51.100.8', 'reason' => IpBan::REASON_AUTO, 'expires_at' => now()->subMinute()]);
        IpBan::create(['ip' => '198.51.100.9', 'reason' => IpBan::REASON_MANUAL, 'lifted_at' => now()]);

        $this->getJson('/api/admin/security/bans', $this->admin['headers'])
            ->assertOk()
            ->assertJsonCount(1, 'bans')
            ->assertJsonPath('bans.0.ip', self::IP);
    }
}
