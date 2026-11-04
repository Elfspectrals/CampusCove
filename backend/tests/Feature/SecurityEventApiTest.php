<?php

namespace Tests\Feature;

use App\Models\SecurityEvent;
use App\Support\ClientOrigin;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SecurityEventApiTest extends TestCase
{
    use RefreshDatabase;

    private const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

    public static function probePathProvider(): array
    {
        return [
            'dotenv' => ['/.env', true],
            'dotenv variant' => ['/.env.prod', true],
            'git config' => ['/.git/config', true],
            'nested dotenv' => ['/api/.env', true],
            'wordpress admin' => ['/wp-admin/install.php', true],
            'wordpress login' => ['/wp-login.php', true],
            'phpmyadmin any case' => ['/phpMyAdmin/', true],
            'php shell' => ['/shell.php', true],
            'cgi-bin' => ['/cgi-bin/luci', true],
            'front controller' => ['/index.php', false],
            'well-known' => ['/.well-known/security.txt', false],
            'admin page' => ['/admin', false],
            'api route' => ['/api/health', false],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('probePathProvider')]
    public function test_probe_paths_are_logged(string $path, bool $logged): void
    {
        $this->get($path, ['User-Agent' => self::CHROME]);

        $this->assertSame($logged, SecurityEvent::where('type', SecurityEvent::TYPE_PROBE_PATH)->exists());
    }

    public static function scannerAgentProvider(): array
    {
        return [
            'sqlmap' => ['sqlmap/1.7.2#stable (https://sqlmap.org)', 'sqlmap'],
            'nikto' => ['Mozilla/5.00 (Nikto/2.5.0)', 'nikto'],
            'chrome' => [self::CHROME, null],
            'curl' => ['curl/8.0.1', null],
            'empty' => ['', null],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('scannerAgentProvider')]
    public function test_scanner_agents_are_logged(string $agent, ?string $detail): void
    {
        $this->getJson('/api/health', ['User-Agent' => $agent])->assertOk();

        $this->assertSame($detail, SecurityEvent::where('type', SecurityEvent::TYPE_SCANNER_AGENT)->value('detail'));
    }

    public static function injectionProvider(): array
    {
        return [
            'union select' => ['/api/health?q=1%20UNION%20SELECT%20password', true],
            'tautology' => ['/api/health?q=%27%20or%201%3D1', true],
            'script tag' => ['/api/health?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E', true],
            'path traversal' => ['/api/health?f=..%2F..%2Fetc%2Fpasswd', true],
            'apostrophe in a name' => ['/api/health?name=O%27Brien', false],
            'select as a word' => ['/api/health?q=select+a+shirt', false],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('injectionProvider')]
    public function test_injections_in_the_url_are_logged(string $uri, bool $logged): void
    {
        $this->getJson($uri, ['User-Agent' => self::CHROME])->assertOk();

        $this->assertSame($logged, SecurityEvent::where('type', SecurityEvent::TYPE_INJECTION)->exists());
    }

    public function test_failed_login_is_logged_with_the_attempted_email(): void
    {
        $this->postJson('/api/login', ['email' => 'victim@test.com', 'password' => 'guess1234'])->assertStatus(422);

        $event = SecurityEvent::sole();
        $this->assertSame(SecurityEvent::TYPE_LOGIN_FAILED, $event->type);
        $this->assertSame('victim@test.com', $event->detail);
        $this->assertSame('POST', $event->method);
        $this->assertSame('/api/login', $event->path);
    }

    public function test_throttled_request_is_logged(): void
    {
        for ($attempt = 1; $attempt <= 10; $attempt++) {
            $this->postJson('/api/login', ['email' => 'victim@test.com', 'password' => 'guess1234'])->assertStatus(422);
        }
        $this->postJson('/api/login', ['email' => 'victim@test.com', 'password' => 'guess1234'])->assertStatus(429);

        $this->assertSame(10, SecurityEvent::where('type', SecurityEvent::TYPE_LOGIN_FAILED)->count());
        $this->assertSame(1, SecurityEvent::where('type', SecurityEvent::TYPE_RATE_LIMITED)->count());
    }

    public function test_cloudflare_headers_are_used_only_with_the_origin_secret(): void
    {
        config(['services.cloudflare.origin_secret' => 'origin-secret']);
        $headers = [
            'CF-Connecting-IP' => '1.2.3.4',
            'CF-IPCountry' => 'FR',
            'X-Forwarded-For' => '1.2.3.4, 172.70.0.1',
        ];

        $this->get('/.env', $headers + [ClientOrigin::CLOUDFLARE_SECRET_HEADER => 'origin-secret']);
        $this->get('/.env', $headers + [ClientOrigin::CLOUDFLARE_SECRET_HEADER => 'wrong']);
        $this->get('/.env', $headers);

        $this->assertSame(
            [['1.2.3.4', 'FR'], ['172.70.0.1', null], ['172.70.0.1', null]],
            SecurityEvent::orderBy('id')->get()->map(fn (SecurityEvent $e) => [$e->ip, $e->country])->all(),
        );
    }

    public function test_client_ip_is_the_last_forwarded_hop_or_the_peer(): void
    {
        $this->get('/.env', ['X-Forwarded-For' => '9.9.9.9, 5.5.5.5', 'CF-Connecting-IP' => '6.6.6.6']);
        $this->get('/.env');

        $this->assertSame(['5.5.5.5', '127.0.0.1'], SecurityEvent::orderBy('id')->pluck('ip')->all());
    }

    public function test_events_older_than_thirty_days_are_pruned(): void
    {
        $pruneAt = now()->startOfSecond();
        $this->travelTo($pruneAt->copy()->subDays(30)->subMinute());
        $this->get('/.env', ['User-Agent' => 'older']);
        $this->travelTo($pruneAt->copy()->subDays(30));
        $this->get('/.env', ['User-Agent' => 'exactly thirty days']);
        $this->travelTo($pruneAt->copy()->subDays(30)->addMinute());
        $this->get('/.env', ['User-Agent' => 'younger']);
        $this->travelTo($pruneAt);

        $this->artisan('model:prune', ['--model' => [SecurityEvent::class]])->assertSuccessful();

        $this->assertSame(['exactly thirty days', 'younger'], SecurityEvent::orderBy('id')->pluck('user_agent')->all());
    }

    public static function notFoundProvider(): array
    {
        return [
            'admin page' => ['/admin', true],
            'unknown api route' => ['/api/v1/users', true],
            'backup archive' => ['/backup.zip', true],
            'known route' => ['/api/health', false],
            'probe is not counted twice' => ['/.env', false],
            'favicon' => ['/favicon.ico', false],
            'apple touch icon' => ['/apple-touch-icon-precomposed.png', false],
            'sitemap' => ['/sitemap.xml', false],
            'well-known' => ['/.well-known/security.txt', false],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('notFoundProvider')]
    public function test_unknown_paths_are_logged(string $path, bool $logged): void
    {
        $this->get($path, ['User-Agent' => self::CHROME]);

        $this->assertSame($logged, SecurityEvent::where('type', SecurityEvent::TYPE_NOT_FOUND)->exists());
    }

    public function test_a_404_from_a_real_route_is_not_logged(): void
    {
        \Illuminate\Support\Facades\Route::get('/api/test-missing-model', fn () => abort(404));

        $this->getJson('/api/test-missing-model')->assertNotFound();

        $this->assertFalse(SecurityEvent::exists());
    }
}
