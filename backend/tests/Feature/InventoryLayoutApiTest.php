<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class InventoryLayoutApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_layout_requires_authentication(): void
    {
        $this->getJson('/api/inventory/layout')->assertUnauthorized();
    }

    public function test_layout_returns_defaults_only_when_no_saved_layout_exists(): void
    {
        $token = $this->registerAccount();

        $this->getJson('/api/inventory/layout', [
            'Authorization' => 'Bearer '.$token,
        ])
            ->assertOk()
            ->assertJsonPath('layout.selected_hotbar_index', 0)
            ->assertJsonCount(36, 'layout.slots');
    }

    public function test_layout_read_failure_is_not_reported_as_an_empty_layout(): void
    {
        $token = $this->registerAccount();
        Schema::drop('account_inventory_layout');

        $this->getJson('/api/inventory/layout', [
            'Authorization' => 'Bearer '.$token,
        ])
            ->assertStatus(503)
            ->assertJson([
                'message' => 'Inventory layout is temporarily unavailable.',
            ])
            ->assertJsonMissingPath('layout');
    }

    private function registerAccount(): string
    {
        $suffix = substr(str_replace('.', '', uniqid('', true)), 0, 10);
        $response = $this->postJson('/api/register', [
            'email' => 'layout-'.$suffix.'@test.com',
            'username' => 'layout'.$suffix,
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
        ]);

        $response->assertCreated();

        return (string) $response->json('token');
    }
}
