<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PasswordResetApiTest extends TestCase
{
    use RefreshDatabase;

    private function registerPlayer(): string
    {
        $email = 'r'.uniqid('', true).'@test.com';
        $this->postJson('/api/register', [
            'email' => $email,
            'username' => 'r'.substr(str_replace('.', '', uniqid('', true)), 0, 10),
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
            'accepted_terms' => true,
            'age_confirmed' => true,
        ])->assertCreated();

        return $email;
    }

    /** Token from the last reset e-mail (MAIL_MAILER=array in phpunit.xml). */
    private function tokenFromLastEmail(): string
    {
        $message = app('mailer')->getSymfonyTransport()->messages()->last();
        $this->assertNotNull($message, 'a reset e-mail was sent');
        preg_match('/reset-password\?token=([A-Za-z0-9]{64})/', (string) $message->getOriginalMessage()->getTextBody(), $m);
        $this->assertNotEmpty($m, 'the e-mail holds a reset link');

        return $m[1];
    }

    public function test_reset_link_sets_a_new_password_once(): void
    {
        $email = $this->registerPlayer();

        $this->postJson('/api/forgot-password', ['email' => $email])->assertOk();
        $token = $this->tokenFromLastEmail();
        $this->assertSame(hash('sha256', $token), DB::table('password_reset_tokens')->where('email', $email)->value('token'), 'only the hash is stored');

        $this->postJson('/api/reset-password', ['token' => $token, 'password' => 'newpass12', 'password_confirmation' => 'newpass12'])->assertOk();

        $this->postJson('/api/login', ['email' => $email, 'password' => 'password1x'])->assertStatus(422);
        $this->postJson('/api/login', ['email' => $email, 'password' => 'newpass12'])->assertOk();
        // single use
        $this->postJson('/api/reset-password', ['token' => $token, 'password' => 'other1234', 'password_confirmation' => 'other1234'])->assertStatus(422);
    }

    public function test_expired_link_is_refused(): void
    {
        $email = $this->registerPlayer();
        $this->postJson('/api/forgot-password', ['email' => $email])->assertOk();
        $token = $this->tokenFromLastEmail();
        DB::table('password_reset_tokens')->where('email', $email)->update(['created_at' => now()->subMinutes(61)]);

        $this->postJson('/api/reset-password', ['token' => $token, 'password' => 'newpass12', 'password_confirmation' => 'newpass12'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['token']);
    }

    public function test_unknown_email_gets_the_same_answer_and_no_email(): void
    {
        $this->postJson('/api/forgot-password', ['email' => 'nobody@test.com'])
            ->assertOk()
            ->assertJsonPath('message', 'If an account exists with that email, you will receive a reset link.');

        $this->assertCount(0, app('mailer')->getSymfonyTransport()->messages());
    }
}
