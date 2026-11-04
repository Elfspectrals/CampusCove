<?php

namespace Tests\Feature;

use App\Models\SecurityScan;
use App\Models\SecurityVulnerability;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SecurityScanApiTest extends TestCase
{
    use RefreshDatabase;

    private const TOKEN = 'scan-token';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.security_scan.token' => self::TOKEN]);
    }

    private function vulnerability(string $target, string $id, string $severity, ?string $fixed = '1.2.3'): array
    {
        return [
            'target' => $target,
            'package' => 'axios',
            'installed_version' => '1.0.0',
            'fixed_version' => $fixed,
            'vulnerability_id' => $id,
            'severity' => $severity,
            'title' => "axios: {$id}",
        ];
    }

    private function scan(array $vulnerabilities, ?string $token = self::TOKEN): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/security/scans', [
            'commit_sha' => str_repeat('a', 40),
            'ref' => 'refs/heads/main',
            'vulnerabilities' => $vulnerabilities,
        ], $token === null ? [] : ['X-Scan-Token' => $token]);
    }

    private function adminHeaders(): array
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
        DB::table('accounts')->where('account_id', $reg->json('user.account_id'))->update(['is_admin' => true]);

        return ['Authorization' => 'Bearer '.$reg->json('token')];
    }

    public function test_a_scan_needs_the_token(): void
    {
        $this->scan([], token: null)->assertForbidden()->assertJsonPath('code', 'scan_token_required');
        $this->scan([], token: 'wrong')->assertForbidden();
        config(['services.security_scan.token' => '']);
        $this->scan([], token: '')->assertForbidden();

        $this->assertFalse(SecurityScan::exists());
    }

    public function test_the_same_cve_in_two_lockfiles_counts_twice(): void
    {
        $this->scan([
            $this->vulnerability('front/package-lock.json', 'CVE-2026-1111', 'HIGH'),
            $this->vulnerability('socket/package-lock.json', 'CVE-2026-1111', 'HIGH'),
        ])->assertCreated()->assertJsonPath('vulnerabilities', 2);

        $this->assertSame(2, SecurityVulnerability::count());
    }

    public function test_a_new_scan_replaces_the_previous_one(): void
    {
        $this->scan([$this->vulnerability('front/package-lock.json', 'CVE-2026-1111', 'HIGH')])->assertCreated();

        $this->scan([])->assertCreated();

        $this->assertSame(1, SecurityScan::count());
        $this->assertSame(0, SecurityVulnerability::count());
    }

    public function test_a_malformed_scan_is_rejected(): void
    {
        $this->scan([$this->vulnerability('front/package-lock.json', 'CVE-2026-1111', 'SEVERE')])->assertUnprocessable();
        $this->postJson('/api/security/scans', ['commit_sha' => 'nope', 'ref' => 'main', 'vulnerabilities' => []], ['X-Scan-Token' => self::TOKEN])
            ->assertUnprocessable();

        $this->assertFalse(SecurityScan::exists());
    }

    public function test_the_dashboard_summarises_the_latest_scan(): void
    {
        $headers = $this->adminHeaders();
        $this->getJson('/api/admin/security/overview', $headers)->assertJsonPath('cves', null);

        $this->scan([
            $this->vulnerability('front/package-lock.json', 'CVE-2026-1111', 'HIGH'),
            $this->vulnerability('backend/composer.lock', 'CVE-2026-2222', 'CRITICAL'),
            $this->vulnerability('socket/package-lock.json', 'CVE-2026-3333', 'LOW', fixed: null),
        ]);

        $this->getJson('/api/admin/security/overview', $headers)
            ->assertJsonPath('cves.total', 3)
            ->assertJsonPath('cves.by_severity', ['CRITICAL' => 1, 'HIGH' => 1, 'MEDIUM' => 0, 'LOW' => 1, 'UNKNOWN' => 0])
            ->assertJsonPath('cves.commit_sha', str_repeat('a', 40));
    }

    public function test_the_cve_list_is_admin_only_and_sorted_by_severity(): void
    {
        $this->scan([
            $this->vulnerability('socket/package-lock.json', 'CVE-2026-3333', 'LOW', fixed: null),
            $this->vulnerability('backend/composer.lock', 'CVE-2026-2222', 'CRITICAL'),
            $this->vulnerability('front/package-lock.json', 'CVE-2026-1111', 'HIGH'),
        ]);
        $this->getJson('/api/admin/security/cves')->assertUnauthorized();

        $list = $this->getJson('/api/admin/security/cves', $this->adminHeaders())->assertOk();

        $this->assertSame(['CVE-2026-2222', 'CVE-2026-1111', 'CVE-2026-3333'], array_column($list->json('vulnerabilities'), 'vulnerability_id'));
        $list->assertJsonPath('vulnerabilities.2.fixed_version', null)->assertJsonPath('scan.ref', 'refs/heads/main');
    }
}
