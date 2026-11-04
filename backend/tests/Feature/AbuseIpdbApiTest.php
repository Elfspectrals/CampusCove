<?php

namespace Tests\Feature;

use App\Models\IpBan;
use App\Models\IpReputation;
use App\Models\SecurityEvent;
use App\Services\IpBanService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AbuseIpdbApiTest extends TestCase
{
    use RefreshDatabase;

    private const IP = '45.95.147.10';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.abuseipdb.key' => 'abuse-key']);
    }

    private function fakeAbuseIpdb(int $confidence, int $checkStatus = 200): void
    {
        Http::fake([
            'api.abuseipdb.com/api/v2/check*' => Http::response(['data' => [
                'ipAddress' => self::IP,
                'abuseConfidenceScore' => $confidence,
                'countryCode' => 'NL',
                'isp' => 'Example Hosting',
                'usageType' => 'Data Center/Web Hosting/Transit',
                'isTor' => false,
                'totalReports' => 42,
            ]], $checkStatus),
            'api.abuseipdb.com/api/v2/report' => Http::response(['data' => ['ipAddress' => self::IP]]),
        ]);
    }

    private function reputation(int $confidence, int $hoursAgo = 0): void
    {
        IpReputation::create([
            'ip' => self::IP,
            'abuse_confidence' => $confidence,
            'is_tor' => false,
            'total_reports' => 0,
            'checked_at' => now()->subHours($hoursAgo),
        ]);
    }

    private function probe(string $path = '/.env', string $ip = self::IP): void
    {
        $this->get($path, ['X-Forwarded-For' => $ip]);
    }

    private function checks(): int
    {
        return count(Http::recorded(fn (HttpRequest $request) => str_contains($request->url(), '/check')));
    }

    private function reports(): array
    {
        return Http::recorded(fn (HttpRequest $request) => str_ends_with($request->url(), '/report'))
            ->map(fn (array $pair) => $pair[0])
            ->values()
            ->all();
    }

    public static function reputationPointsProvider(): array
    {
        return [
            'clean' => [0, 0],
            'a third' => [33, 9],
            'half' => [50, 15],
            'worst' => [100, 30],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('reputationPointsProvider')]
    public function test_reputation_adds_thirty_percent_of_the_confidence(int $confidence, int $points): void
    {
        $this->reputation($confidence);

        $this->assertSame($points, app(IpBanService::class)->reputationPoints(self::IP));
    }

    public function test_a_bad_reputation_bans_one_probe_earlier(): void
    {
        $this->fakeAbuseIpdb(100);

        $this->probe('/.env');
        $this->probe('/.git/config');
        $this->assertSame(70, app(IpBanService::class)->score(self::IP));
        $this->assertFalse(IpBan::exists());

        $this->probe('/wp-login.php');
        $this->assertSame(90, IpBan::sole()->score);
    }

    public function test_a_bad_reputation_alone_never_lifts_the_login_cap(): void
    {
        $this->reputation(100);
        for ($i = 0; $i < 20; $i++) {
            SecurityEvent::create(['ip' => self::IP, 'type' => SecurityEvent::TYPE_LOGIN_FAILED, 'method' => 'POST', 'path' => '/api/login']);
        }

        $this->assertSame(IpBanService::SCORE_CAP_WITHOUT_BOT_SIGNAL, app(IpBanService::class)->score(self::IP));
    }

    public function test_the_check_is_stored_with_the_country(): void
    {
        $this->fakeAbuseIpdb(64);

        $this->probe();

        $reputation = IpReputation::sole();
        $this->assertSame([self::IP, 64, 'NL', false, 42], [$reputation->ip, $reputation->abuse_confidence, $reputation->country, $reputation->is_tor, $reputation->total_reports]);
        Http::assertSent(fn (HttpRequest $request) => $request->url() === 'https://api.abuseipdb.com/api/v2/check?ipAddress='.self::IP
            && $request->header('Key') === ['abuse-key']);
    }

    public function test_a_reputation_younger_than_twenty_four_hours_is_not_checked_again(): void
    {
        $this->fakeAbuseIpdb(10);
        $this->reputation(10, hoursAgo: 23);

        $this->probe();

        $this->assertSame(0, $this->checks());
    }

    public function test_a_reputation_twenty_four_hours_old_is_checked_again(): void
    {
        $this->freezeSecond();
        $this->fakeAbuseIpdb(80);
        $this->reputation(10, hoursAgo: 24);

        $this->probe();

        $this->assertSame(1, $this->checks());
        $this->assertSame(80, IpReputation::sole()->abuse_confidence);
    }

    public function test_private_ips_are_never_sent(): void
    {
        $this->fakeAbuseIpdb(100);

        foreach (['127.0.0.1', '10.0.0.5', '192.168.1.2'] as $ip) {
            for ($i = 0; $i < 4; $i++) {
                $this->probe('/.env', $ip);
            }
        }

        $this->assertSame(3, IpBan::count());
        Http::assertNothingSent();
    }

    public function test_nothing_is_sent_without_an_api_key(): void
    {
        config(['services.abuseipdb.key' => '']);
        $this->fakeAbuseIpdb(100);

        for ($i = 0; $i < 4; $i++) {
            $this->probe();
        }

        $this->assertTrue(IpBan::where('ip', self::IP)->exists());
        Http::assertNothingSent();
    }

    public function test_a_failed_check_scores_without_reputation(): void
    {
        $this->fakeAbuseIpdb(100, checkStatus: 429);

        $this->probe();

        $this->assertFalse(IpReputation::exists());
        $this->assertSame(20, app(IpBanService::class)->score(self::IP));
    }

    public function test_an_auto_ban_reports_the_probes_without_query_strings(): void
    {
        $this->fakeAbuseIpdb(0);

        foreach (['/.env?token=abc', '/.git/config', '/wp-login.php', '/phpmyadmin'] as $path) {
            $this->probe($path);
        }

        $reports = $this->reports();
        $this->assertCount(1, $reports);
        $this->assertSame(self::IP, $reports[0]['ip']);
        $this->assertSame('19,21', $reports[0]['categories']);
        $this->assertSame('CampusCove: 4 probe_path in 24h (/.env, /.git/config, /wp-login.php)', $reports[0]['comment']);
    }

    public function test_a_scanner_with_sql_injection_is_reported_as_such(): void
    {
        $this->fakeAbuseIpdb(0);
        $headers = ['X-Forwarded-For' => self::IP, 'User-Agent' => 'sqlmap/1.7.2'];

        $this->getJson('/api/health?q=1%20UNION%20SELECT%20password', $headers);
        $this->getJson('/api/health', $headers);

        $reports = $this->reports();
        $this->assertCount(1, $reports);
        $this->assertSame('16,19,21', $reports[0]['categories']);
        $this->assertSame('CampusCove: 1 injection, 2 scanner_agent in 24h', $reports[0]['comment']);
    }

    public function test_brute_force_is_reported_without_the_attempted_emails(): void
    {
        $this->fakeAbuseIpdb(0);
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/login', ['email' => "victim{$i}@test.com", 'password' => 'guess1234'], ['X-Forwarded-For' => self::IP]);
        }
        foreach (['/.env', '/.git/config', '/wp-login.php'] as $path) {
            $this->probe($path);
        }

        $reports = $this->reports();
        $this->assertCount(1, $reports);
        $this->assertSame('18,19,21', $reports[0]['categories']);
        $this->assertSame('CampusCove: 5 login_failed, 3 probe_path in 24h (/.env, /.git/config, /wp-login.php)', $reports[0]['comment']);
    }
}
