<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PrivacyApiTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{id: int, token: string, email: string} */
    private function registerPlayer(array $overrides = []): array
    {
        $email = 'u'.uniqid('', true).'@test.com';
        $res = $this->postJson('/api/register', array_merge([
            'email' => $email,
            'username' => 'u'.substr(str_replace('.', '', uniqid('', true)), 0, 10),
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
            'accepted_terms' => true,
            'age_confirmed' => true,
        ], $overrides));
        $res->assertCreated();

        return ['id' => (int) $res->json('user.account_id'), 'token' => $res->json('token'), 'email' => $email];
    }

    public function test_register_requires_terms_and_age_and_records_consent(): void
    {
        $this->postJson('/api/register', [
            'email' => 'noconsent@test.com',
            'username' => 'noconsent',
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
        ])->assertStatus(422)->assertJsonValidationErrors(['accepted_terms', 'age_confirmed']);

        $player = $this->registerPlayer();
        $row = DB::table('accounts')->where('account_id', $player['id'])->first();
        $this->assertSame('2026-10-28', $row->terms_version);
        $this->assertNotNull($row->terms_accepted_at);
        $this->assertNotNull($row->age_confirmed_at);
    }

    public function test_export_contains_account_rows_without_secrets(): void
    {
        $player = $this->registerPlayer();

        $res = $this->getJson('/api/account/export', ['Authorization' => 'Bearer '.$player['token']]);

        $res->assertOk();
        $res->assertJsonPath('account_id', $player['id']);
        $res->assertJsonPath('tables.account_auth_local.0.email', $player['email']);
        $this->assertArrayNotHasKey('password_hash', $res->json('tables.account_auth_local.0'));
        $this->assertStringNotContainsString('password_hash', $res->getContent());
        $this->assertNotEmpty($res->json('tables.wallet_ledger'), 'welcome bonus ledger entry is exported');
    }

    public function test_delete_account_requires_password_and_anonymizes(): void
    {
        $player = $this->registerPlayer();
        $auth = ['Authorization' => 'Bearer '.$player['token']];

        $this->deleteJson('/api/account', ['password' => 'wrong-password'], $auth)->assertStatus(422);
        $this->deleteJson('/api/account', ['password' => 'password1x'], $auth)->assertOk();

        $this->assertDatabaseMissing('account_auth_local', ['email' => $player['email']]);
        $this->assertDatabaseHas('account_handles', ['account_id' => $player['id'], 'username' => 'deleted_'.$player['id']]);
        $this->assertDatabaseHas('accounts', ['account_id' => $player['id'], 'status' => 'deleted']);
        $this->assertSame(0, DB::table('personal_access_tokens')->where('tokenable_id', $player['id'])->count());
        $this->postJson('/api/login', ['email' => $player['email'], 'password' => 'password1x'])->assertStatus(422);
    }

    public function test_player_can_report_another_player_once_while_open(): void
    {
        $reporter = $this->registerPlayer();
        $target = $this->registerPlayer();
        $auth = ['Authorization' => 'Bearer '.$reporter['token']];

        $this->postJson('/api/reports', ['target_account_id' => $target['id'], 'reason' => 'harassment', 'details' => 'Rude.'], $auth)->assertCreated();
        $this->postJson('/api/reports', ['target_account_id' => $target['id'], 'reason' => 'harassment'], $auth)->assertCreated();
        $this->postJson('/api/reports', ['target_account_id' => $reporter['id'], 'reason' => 'other'], $auth)->assertStatus(422);
        $this->postJson('/api/reports', ['target_account_id' => $target['id'], 'reason' => 'not-a-reason'], $auth)->assertStatus(422);

        $this->assertSame(1, DB::table('player_reports')->where('target_account_id', $target['id'])->count());
    }

    /** Bearer headers for a player; forgets the cached guard user so requests can switch players. */
    private function authAs(array $player): array
    {
        $this->app['auth']->forgetGuards();

        return ['Authorization' => 'Bearer '.$player['token']];
    }

    /** @return list<string> recipients of the e-mails sent so far (MAIL_MAILER=array in phpunit.xml) */
    private function sentTo(): array
    {
        return app('mailer')->getSymfonyTransport()->messages()
            ->flatMap(fn ($m) => array_map(fn ($a) => $a->getAddress(), $m->getEnvelope()->getRecipients()))
            ->values()
            ->all();
    }

    public function test_purge_inactive_warns_first_then_anonymizes_old_accounts_only(): void
    {
        $old = $this->registerPlayer();
        $recent = $this->registerPlayer();
        DB::table('accounts')->where('account_id', $old['id'])->update(['last_login_at' => now()->subMonths(40)]);

        // first run: notice e-mail only, nothing erased yet
        $this->artisan('accounts:purge-inactive')->assertSuccessful();
        $this->assertDatabaseHas('accounts', ['account_id' => $old['id'], 'status' => 'active']);
        $this->assertNotNull(DB::table('accounts')->where('account_id', $old['id'])->value('inactivity_warned_at'));
        $this->assertSame([$old['email']], $this->sentTo());

        // notice period over
        DB::table('accounts')->where('account_id', $old['id'])->update(['inactivity_warned_at' => now()->subDays(31)]);
        $this->artisan('accounts:purge-inactive')->assertSuccessful();

        $this->assertDatabaseHas('accounts', ['account_id' => $old['id'], 'status' => 'deleted']);
        $this->assertDatabaseHas('accounts', ['account_id' => $recent['id'], 'status' => 'active']);
        $this->assertNull(DB::table('accounts')->where('account_id', $recent['id'])->value('inactivity_warned_at'));
    }

    public function test_login_cancels_inactivity_notice(): void
    {
        $player = $this->registerPlayer();
        DB::table('accounts')->where('account_id', $player['id'])->update(['inactivity_warned_at' => now()->subDays(40), 'last_login_at' => now()->subMonths(40)]);

        $this->postJson('/api/login', ['email' => $player['email'], 'password' => 'password1x'])->assertOk();
        $this->artisan('accounts:purge-inactive')->assertSuccessful();

        $this->assertDatabaseHas('accounts', ['account_id' => $player['id'], 'status' => 'active', 'inactivity_warned_at' => null]);
    }

    public function test_purge_deletes_reports_resolved_over_a_year_ago(): void
    {
        $a = $this->registerPlayer();
        $b = $this->registerPlayer();
        $old = DB::table('player_reports')->insertGetId(['reporter_account_id' => $a['id'], 'target_account_id' => $b['id'], 'reason' => 'other', 'status' => 'dismissed', 'resolved_at' => now()->subMonths(13)]);
        $fresh = DB::table('player_reports')->insertGetId(['reporter_account_id' => $b['id'], 'target_account_id' => $a['id'], 'reason' => 'other', 'status' => 'dismissed', 'resolved_at' => now()->subMonth()]);

        $this->artisan('accounts:purge-inactive')->assertSuccessful();

        $this->assertDatabaseMissing('player_reports', ['id' => $old]);
        $this->assertDatabaseHas('player_reports', ['id' => $fresh]);
    }

    public function test_export_of_reported_player_hides_the_reporter(): void
    {
        $reporter = $this->registerPlayer();
        $target = $this->registerPlayer();
        $this->postJson('/api/reports', ['target_account_id' => $target['id'], 'reason' => 'harassment', 'details' => 'Secret details.'], $this->authAs($reporter))->assertCreated();

        $targetExport = $this->getJson('/api/account/export', $this->authAs($target))->assertOk();
        $received = $targetExport->json('tables.player_reports.received.0');
        $this->assertSame('harassment', $received['reason']);
        $this->assertArrayNotHasKey('reporter_account_id', $received);
        $this->assertStringNotContainsString('Secret details.', $targetExport->getContent());

        $this->getJson('/api/account/export', $this->authAs($reporter))
            ->assertOk()
            ->assertJsonPath('tables.player_reports.filed.0.details', 'Secret details.');
    }

    public function test_deleting_account_erases_report_details_written(): void
    {
        $reporter = $this->registerPlayer();
        $target = $this->registerPlayer();
        $auth = $this->authAs($reporter);
        $this->postJson('/api/reports', ['target_account_id' => $target['id'], 'reason' => 'scam', 'details' => 'Text.'], $auth)->assertCreated();

        $this->deleteJson('/api/account', ['password' => 'password1x'], $auth)->assertOk();

        $this->assertDatabaseHas('player_reports', ['reporter_account_id' => $reporter['id'], 'reason' => 'scam', 'details' => null]);
    }

    public function test_outdated_terms_are_flagged_and_can_be_accepted_again(): void
    {
        $player = $this->registerPlayer();
        $this->getJson('/api/user', $this->authAs($player))->assertJsonPath('user.terms_current', true);

        DB::table('accounts')->where('account_id', $player['id'])->update(['terms_version' => '2000-01-01']);
        $this->getJson('/api/user', $this->authAs($player))->assertJsonPath('user.terms_current', false);

        $this->postJson('/api/account/terms', [], $this->authAs($player))->assertStatus(422);
        $this->postJson('/api/account/terms', ['accepted_terms' => true], $this->authAs($player))->assertOk();
        $this->getJson('/api/user', $this->authAs($player))->assertJsonPath('user.terms_current', true);
    }

    public function test_report_decision_is_emailed_to_reporter_and_target(): void
    {
        $reporter = $this->registerPlayer();
        $target = $this->registerPlayer();
        $this->postJson('/api/reports', ['target_account_id' => $target['id'], 'reason' => 'username'], $this->authAs($reporter))->assertCreated();
        $reportId = (int) DB::table('player_reports')->value('id');
        $admin = $this->registerPlayer();
        DB::table('accounts')->where('account_id', $admin['id'])->update(['is_admin' => true]);

        $this->patchJson("/api/admin/reports/{$reportId}", ['status' => 'actioned', 'decision_note' => 'Pseudonyme injurieux.'], $this->authAs($admin))->assertOk();

        $this->assertDatabaseHas('player_reports', ['id' => $reportId, 'status' => 'actioned', 'decision_note' => 'Pseudonyme injurieux.']);
        $this->assertEqualsCanonicalizing([$reporter['email'], $target['email']], $this->sentTo());
    }
}
