<?php

namespace Tests\Feature;

use App\Models\Account;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class PasswordResetApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_forgot_password_stores_a_hashed_token_without_revealing_account_existence(): void
    {
        Mail::fake();
        $account = $this->registerAccount('reset-request@test.com', 'reset_request');

        $existing = $this->postJson('/api/forgot-password', [
            'email' => $account['email'],
        ]);
        $missing = $this->postJson('/api/forgot-password', [
            'email' => 'missing-reset@test.com',
        ]);

        $existing->assertOk();
        $missing->assertOk();
        $this->assertSame($existing->json('message'), $missing->json('message'));

        $row = DB::table('password_reset_tokens')->where('email', $account['email'])->first();
        $this->assertNotNull($row);
        $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', (string) $row->token);
        $this->assertDatabaseMissing('password_reset_tokens', [
            'email' => 'missing-reset@test.com',
        ]);
    }

    public function test_valid_reset_changes_password_revokes_tokens_and_consumes_reset_token(): void
    {
        $account = $this->registerAccount('reset-valid@test.com', 'reset_valid');
        $rawToken = str_repeat('a', 64);
        DB::table('password_reset_tokens')->insert([
            'email' => $account['email'],
            'token' => hash('sha256', $rawToken),
            'created_at' => now(),
        ]);

        $this->postJson('/api/reset-password', [
            'email' => $account['email'],
            'token' => $rawToken,
            'password' => 'new-password1x',
            'password_confirmation' => 'new-password1x',
        ])->assertOk();

        $this->assertDatabaseMissing('password_reset_tokens', [
            'email' => $account['email'],
        ]);
        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_type' => Account::class,
            'tokenable_id' => $account['account_id'],
        ]);
        $this->getJson('/api/user', [
            'Authorization' => 'Bearer '.$account['token'],
        ])->assertUnauthorized();
        $this->postJson('/api/login', [
            'email' => $account['email'],
            'password' => 'password1x',
        ])->assertUnprocessable();
        $this->postJson('/api/login', [
            'email' => $account['email'],
            'password' => 'new-password1x',
        ])->assertOk();
    }

    public function test_expired_reset_token_is_rejected_without_changing_password(): void
    {
        $account = $this->registerAccount('reset-expired@test.com', 'reset_expired');
        $rawToken = str_repeat('b', 64);
        DB::table('password_reset_tokens')->insert([
            'email' => $account['email'],
            'token' => hash('sha256', $rawToken),
            'created_at' => now()->subMinutes(61),
        ]);

        $this->postJson('/api/reset-password', [
            'email' => $account['email'],
            'token' => $rawToken,
            'password' => 'new-password1x',
            'password_confirmation' => 'new-password1x',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('token');

        $this->postJson('/api/login', [
            'email' => $account['email'],
            'password' => 'password1x',
        ])->assertOk();
    }

    /**
     * @return array{email:string,account_id:int,token:string}
     */
    private function registerAccount(string $email, string $username): array
    {
        $response = $this->postJson('/api/register', [
            'email' => $email,
            'username' => $username,
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
        ]);
        $response->assertCreated();

        return [
            'email' => $email,
            'account_id' => (int) $response->json('user.account_id'),
            'token' => (string) $response->json('token'),
        ];
    }
}
