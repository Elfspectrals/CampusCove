<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RegisterUsernameApiTest extends TestCase
{
    use RefreshDatabase;

    private function register(string $username, string $email): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/register', [
            'email' => $email,
            'username' => $username,
            'password' => 'password1x',
            'accepted_terms' => true,
            'age_confirmed' => true,
        ]);
    }

    public function test_any_visible_username_is_accepted_without_password_confirmation(): void
    {
        $this->register('  Léa-Marie   la Pro ✨ ', 'lea@test.com')
            ->assertCreated()
            ->assertJsonPath('user.username', 'Léa-Marie la Pro ✨');
    }

    public function test_usernames_stay_unique_case_insensitively(): void
    {
        $this->register('Café Crème', 'a@test.com')->assertCreated();
        $this->register('café crème', 'b@test.com')->assertStatus(422)->assertJsonValidationErrors(['username']);
    }

    public function test_invisible_characters_and_bad_lengths_are_refused(): void
    {
        $this->register("ab\u{200B}cd", 'c@test.com')->assertStatus(422)->assertJsonValidationErrors(['username']);
        $this->register('ab', 'd@test.com')->assertStatus(422)->assertJsonValidationErrors(['username']);
        $this->register(str_repeat('x', 256), 'e@test.com')->assertStatus(422)->assertJsonValidationErrors(['username']);
    }

    public function test_long_usernames_are_accepted(): void
    {
        $this->register('Le Grand Pêcheur du Lac de Cove Pond', 'f@test.com')->assertCreated();
    }
}
