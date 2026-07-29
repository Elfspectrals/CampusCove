<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FriendApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_pending_requests_have_the_correct_direction_for_each_account(): void
    {
        $requester = $this->registerAccount();
        $recipient = $this->registerAccount();
        $this->sendFriendRequest($requester, $recipient);

        $this->getJson('/api/friends/pending', [
            'Authorization' => 'Bearer '.$requester['token'],
        ])
            ->assertOk()
            ->assertJsonPath('pending.0.account_id', $recipient['account_id'])
            ->assertJsonPath('pending.0.incoming', false);

        $this->getJson('/api/friends/pending', [
            'Authorization' => 'Bearer '.$recipient['token'],
        ])
            ->assertOk()
            ->assertJsonPath('pending.0.account_id', $requester['account_id'])
            ->assertJsonPath('pending.0.incoming', true);
    }

    public function test_blocking_an_unknown_account_returns_validation_error(): void
    {
        $account = $this->registerAccount();

        $this->postJson('/api/friends/block/999999999', [], [
            'Authorization' => 'Bearer '.$account['token'],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('account_id');
    }

    public function test_only_the_blocker_can_remove_a_blocked_relationship(): void
    {
        $blocker = $this->registerAccount();
        $blocked = $this->registerAccount();

        $this->postJson('/api/friends/block/'.$blocked['account_id'], [], [
            'Authorization' => 'Bearer '.$blocker['token'],
        ])->assertOk();

        $this->postJson('/api/friends/block/'.$blocker['account_id'], [], [
            'Authorization' => 'Bearer '.$blocked['token'],
        ])
            ->assertForbidden()
            ->assertJsonPath('code', 'block_change_forbidden');

        $this->deleteJson('/api/friends/'.$blocker['account_id'], [], [
            'Authorization' => 'Bearer '.$blocked['token'],
        ])
            ->assertForbidden()
            ->assertJsonPath('code', 'block_removal_forbidden');

        $this->assertDatabaseHas('friendships', [
            'account_id_a' => min($blocker['account_id'], $blocked['account_id']),
            'account_id_b' => max($blocker['account_id'], $blocked['account_id']),
            'status' => 'blocked',
            'requested_by' => $blocker['account_id'],
        ]);

        $this->deleteJson('/api/friends/'.$blocked['account_id'], [], [
            'Authorization' => 'Bearer '.$blocker['token'],
        ])->assertOk();

        $this->assertDatabaseMissing('friendships', [
            'account_id_a' => min($blocker['account_id'], $blocked['account_id']),
            'account_id_b' => max($blocker['account_id'], $blocked['account_id']),
        ]);
    }

    public function test_voice_policy_excludes_blocked_accounts_in_both_directions(): void
    {
        $blocker = $this->registerAccount();
        $blocked = $this->registerAccount();
        $unrelated = $this->registerAccount();

        $this->postJson('/api/friends/block/'.$blocked['account_id'], [], [
            'Authorization' => 'Bearer '.$blocker['token'],
        ])->assertOk();

        $this->getJson('/api/voice/policy', [
            'Authorization' => 'Bearer '.$blocker['token'],
        ])
            ->assertOk()
            ->assertJsonPath('blocked_account_ids.0', $blocked['account_id'])
            ->assertJsonStructure(['blocked_account_ids', 'refreshed_at']);

        $this->getJson('/api/voice/policy', [
            'Authorization' => 'Bearer '.$blocked['token'],
        ])
            ->assertOk()
            ->assertJsonPath('blocked_account_ids.0', $blocker['account_id']);

        $this->getJson('/api/voice/policy', [
            'Authorization' => 'Bearer '.$unrelated['token'],
        ])
            ->assertOk()
            ->assertJsonPath('blocked_account_ids', []);
    }

    public function test_either_party_can_remove_pending_and_accepted_relationships(): void
    {
        $requester = $this->registerAccount();
        $recipient = $this->registerAccount();

        $this->sendFriendRequest($requester, $recipient);
        $this->deleteJson('/api/friends/'.$requester['account_id'], [], [
            'Authorization' => 'Bearer '.$recipient['token'],
        ])->assertOk();

        $this->assertDatabaseMissing('friendships', [
            'account_id_a' => min($requester['account_id'], $recipient['account_id']),
            'account_id_b' => max($requester['account_id'], $recipient['account_id']),
        ]);

        $this->sendFriendRequest($requester, $recipient);
        $this->postJson('/api/friends/accept/'.$requester['account_id'], [], [
            'Authorization' => 'Bearer '.$recipient['token'],
        ])->assertOk();

        $this->deleteJson('/api/friends/'.$recipient['account_id'], [], [
            'Authorization' => 'Bearer '.$requester['token'],
        ])->assertOk();

        $this->assertDatabaseMissing('friendships', [
            'account_id_a' => min($requester['account_id'], $recipient['account_id']),
            'account_id_b' => max($requester['account_id'], $recipient['account_id']),
        ]);
    }

    /**
     * @param array{token:string} $requester
     * @param array{username:string,tag:int} $recipient
     */
    private function sendFriendRequest(array $requester, array $recipient): void
    {
        $this->postJson('/api/friends/request', [
            'username' => $recipient['username'],
            'tag' => $recipient['tag'],
        ], [
            'Authorization' => 'Bearer '.$requester['token'],
        ])->assertOk();
    }

    /**
     * @return array{token:string,account_id:int,username:string,tag:int}
     */
    private function registerAccount(): array
    {
        $suffix = substr(str_replace('.', '', uniqid('', true)), 0, 10);
        $username = 'friend_'.$suffix;

        $response = $this->postJson('/api/register', [
            'email' => $username.'@test.com',
            'username' => $username,
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
        ]);
        $response->assertCreated();

        return [
            'token' => (string) $response->json('token'),
            'account_id' => (int) $response->json('user.account_id'),
            'username' => (string) $response->json('user.username'),
            'tag' => (int) $response->json('user.tag'),
        ];
    }
}
