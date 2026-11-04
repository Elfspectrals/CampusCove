<?php

namespace Tests\Feature;

use App\Models\IpBan;
use App\Models\SecurityEvent;
use App\Services\IpBanService;
use App\Support\ClientOrigin;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class IpBanApiTest extends TestCase
{
    use RefreshDatabase;

    private const IP = '203.0.113.7';

    private function events(string $type, int $count, ?int $hoursAgo = null): void
    {
        for ($i = 0; $i < $count; $i++) {
            $event = SecurityEvent::create(['ip' => self::IP, 'type' => $type, 'method' => 'GET', 'path' => '/']);
            if ($hoursAgo !== null) {
                $event->forceFill(['created_at' => now()->subHours($hoursAgo)])->save();
            }
        }
    }

    private function score(): int
    {
        return app(IpBanService::class)->score(self::IP);
    }

    private function fromIp(): array
    {
        return ['X-Forwarded-For' => self::IP];
    }

    public function test_a_few_password_typos_score_low(): void
    {
        $this->events(SecurityEvent::TYPE_LOGIN_FAILED, 3);

        $this->assertSame(12, $this->score());
    }

    public function test_a_throttled_login_burst_is_suspect(): void
    {
        $this->events(SecurityEvent::TYPE_LOGIN_FAILED, 10);
        $this->events(SecurityEvent::TYPE_RATE_LIMITED, 1);

        $this->assertSame(50, $this->score());
    }

    public function test_login_failures_alone_stay_below_the_ban_score(): void
    {
        $this->events(SecurityEvent::TYPE_LOGIN_FAILED, 30);

        $this->assertSame(IpBanService::AUTO_BAN_SCORE - 1, $this->score());
    }

    public function test_a_burst_of_unknown_paths_is_suspect_but_never_banned(): void
    {
        $this->events(SecurityEvent::TYPE_NOT_FOUND, 25);
        $this->assertSame(IpBanService::SUSPECT_SCORE, $this->score());

        for ($i = 0; $i < 45; $i++) {
            $this->get("/scan-{$i}", $this->fromIp());
        }

        $this->assertSame(IpBanService::AUTO_BAN_SCORE - 1, $this->score());
        $this->assertFalse(IpBan::exists());
    }

    public function test_one_bot_signal_lifts_the_cap(): void
    {
        $this->events(SecurityEvent::TYPE_LOGIN_FAILED, 19);
        $this->events(SecurityEvent::TYPE_PROBE_PATH, 1);

        $this->assertSame(96, $this->score());
    }

    public function test_score_is_capped_at_one_hundred(): void
    {
        $this->events(SecurityEvent::TYPE_SCANNER_AGENT, 3);

        $this->assertSame(100, $this->score());
    }

    public function test_events_leave_the_score_after_twenty_four_hours(): void
    {
        $this->events(SecurityEvent::TYPE_PROBE_PATH, 3, hoursAgo: 25);
        $this->events(SecurityEvent::TYPE_PROBE_PATH, 1, hoursAgo: 24);
        $this->events(SecurityEvent::TYPE_PROBE_PATH, 1);

        $this->assertSame(20, $this->score());
    }

    public function test_the_fourth_probe_bans_for_twenty_four_hours(): void
    {
        $this->freezeSecond();
        foreach (['/.env', '/.git/config', '/wp-login.php'] as $path) {
            $this->get($path, $this->fromIp())->assertNotFound();
        }
        $this->assertFalse(IpBan::exists());

        $this->get('/phpmyadmin', $this->fromIp())->assertNotFound();

        $ban = IpBan::sole();
        $this->assertSame([self::IP, IpBan::REASON_AUTO, 80], [$ban->ip, $ban->reason, $ban->score]);
        $this->assertTrue($ban->expires_at->equalTo(now()->addHours(24)));
    }

    public function test_a_scanner_with_an_injection_is_banned_on_its_next_request(): void
    {
        $headers = $this->fromIp() + ['User-Agent' => 'sqlmap/1.7.2'];

        $this->getJson('/api/health?q=1%20UNION%20SELECT%20password', $headers)->assertOk();
        $this->assertSame(75, $this->score());
        $this->assertFalse(IpBan::exists());

        $this->getJson('/api/health', $headers)->assertOk();
        $this->assertTrue(IpBan::where('ip', self::IP)->exists());
    }

    public function test_a_banned_ip_is_refused_and_not_logged_until_the_ban_expires(): void
    {
        $this->freezeTime();
        IpBan::create(['ip' => self::IP, 'reason' => IpBan::REASON_AUTO, 'score' => 80, 'expires_at' => now()->addHours(24)]);

        $this->travel(24)->hours();
        $this->travel(-1)->seconds();
        $this->getJson('/.env', $this->fromIp())->assertForbidden()->assertJsonPath('code', 'ip_banned');
        $this->assertSame(0, SecurityEvent::count());

        $this->travel(1)->seconds();
        $this->getJson('/api/health', $this->fromIp())->assertOk();
    }

    public function test_other_ips_are_not_affected_by_a_ban(): void
    {
        IpBan::create(['ip' => self::IP, 'reason' => IpBan::REASON_AUTO, 'expires_at' => now()->addHours(24)]);

        $this->getJson('/api/health', ['X-Forwarded-For' => '198.51.100.1'])->assertOk();
    }

    public function test_unban_command_lifts_the_active_ban(): void
    {
        IpBan::create(['ip' => self::IP, 'reason' => IpBan::REASON_MANUAL]);

        $this->artisan('security:unban', ['ip' => self::IP])->assertSuccessful();

        $this->assertNotNull(IpBan::sole()->lifted_at);
        $this->getJson('/api/health', $this->fromIp())->assertOk();
    }

    public function test_unban_command_rejects_what_is_not_an_ip(): void
    {
        $this->artisan('security:unban', ['ip' => 'not-an-ip'])->assertFailed();
    }

    public function test_the_socket_passes_the_player_ip_and_is_never_banned_itself(): void
    {
        config(['services.realtime.secret' => 'realtime-secret']);
        IpBan::create(['ip' => self::IP, 'reason' => IpBan::REASON_MANUAL]);
        $socket = ['X-Realtime-Secret' => 'realtime-secret', 'X-Forwarded-For' => self::IP];

        $this->getJson('/api/health', $socket + [ClientOrigin::REALTIME_CLIENT_IP_HEADER => self::IP])->assertForbidden();
        $this->getJson('/api/health', $socket + [ClientOrigin::REALTIME_CLIENT_IP_HEADER => '198.51.100.1'])->assertOk();
        $this->getJson('/.env', $socket)->assertNotFound();

        $this->assertSame(0, SecurityEvent::count());
    }

    public function test_the_player_ip_header_is_ignored_without_the_realtime_secret(): void
    {
        config(['services.realtime.secret' => 'realtime-secret']);
        IpBan::create(['ip' => self::IP, 'reason' => IpBan::REASON_MANUAL]);

        $this->getJson('/api/health', $this->fromIp() + [ClientOrigin::REALTIME_CLIENT_IP_HEADER => '198.51.100.1'])->assertForbidden();
    }

    public function test_an_auto_ban_tells_the_socket_to_kick_the_ip(): void
    {
        config(['services.realtime.secret' => 'realtime-secret', 'services.realtime.url' => 'http://socket.test']);
        Http::fake(['socket.test/*' => Http::response(['ok' => true])]);
        $this->events(SecurityEvent::TYPE_PROBE_PATH, 3);

        $this->get('/.env', $this->fromIp());

        Http::assertSent(fn (HttpRequest $request) => $request->url() === 'http://socket.test/internal/ip-banned'
            && $request['ip'] === self::IP
            && $request->header('X-Realtime-Secret') === ['realtime-secret']);
    }
}
