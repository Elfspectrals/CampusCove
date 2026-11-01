<?php

namespace Tests\Feature;

use App\Http\Controllers\AuthController;
use App\Models\GemOrder;
use App\Services\AccountPrivacyService;
use App\Services\Stripe\StripeGatewayException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\BuysGems;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

/** Gem packs, order creation, Checkout Session parameters, order status and history (docs/STRIPE.md). */
class GemShopApiTest extends TestCase
{
    use BuysGems, RefreshDatabase, SetsWalletBalance;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpGemShop();
    }

    public function test_gem_routes_require_authentication(): void
    {
        $this->getJson('/api/gems/packs')->assertUnauthorized();
        $this->postJson('/api/gems/orders', ['pack' => 'gems_100'])->assertUnauthorized();
        $this->getJson('/api/gems/orders')->assertUnauthorized();
        $this->assertSame(0, GemOrder::query()->count());
    }

    public function test_packs_come_from_the_server_catalogue(): void
    {
        $player = $this->registerPlayer();

        $this->getJson('/api/gems/packs', $this->authAs($player))
            ->assertOk()
            ->assertJsonPath('available', true)
            ->assertJsonPath('demo', true)
            ->assertJsonPath('packs', [
                ['code' => 'gems_100', 'gems' => 100, 'amount_cents' => 199, 'currency' => 'eur'],
                ['code' => 'gems_300', 'gems' => 300, 'amount_cents' => 499, 'currency' => 'eur'],
                ['code' => 'gems_650', 'gems' => 650, 'amount_cents' => 999, 'currency' => 'eur'],
                ['code' => 'gems_1400', 'gems' => 1400, 'amount_cents' => 1999, 'currency' => 'eur'],
            ]);
    }

    public function test_shop_stays_closed_without_test_mode_and_test_keys(): void
    {
        $player = $this->registerPlayer();

        foreach ([
            ['off', 'sk_test_campuscove_fake', self::WEBHOOK_SECRET],
            // there is no production mode: anything but "test" is off
            ['live', 'sk_test_campuscove_fake', self::WEBHOOK_SECRET],
            ['test', 'sk_live_campuscove_fake', self::WEBHOOK_SECRET],
            ['test', 'rk_live_campuscove_fake', self::WEBHOOK_SECRET],
            ['test', '', self::WEBHOOK_SECRET],
            ['test', 'sk_test_campuscove_fake', ''],
        ] as [$mode, $key, $webhookSecret]) {
            config(['services.stripe.checkout_mode' => $mode, 'services.stripe.secret' => $key, 'services.stripe.webhook_secret' => $webhookSecret]);

            $this->getJson('/api/gems/packs', $this->authAs($player))->assertOk()->assertJsonPath('available', false)->assertJsonPath('demo', true);
            $this->orderPack($player)->assertStatus(503)->assertJsonPath('code', 'gems_unavailable');
        }
        $this->assertSame(0, GemOrder::query()->count());
        $this->assertSame([], $this->stripe->createCalls);
    }

    public function test_production_keys_are_refused_everywhere(): void
    {
        config(['services.stripe.secret' => 'sk_live_campuscove_fake']);

        $this->postSignedPayload('{}', self::WEBHOOK_SECRET)->assertStatus(503)->assertJsonPath('code', 'live_key_refused');
        $this->artisan('gems:reconcile')->assertFailed();

        // the real SDK gateway refuses before any HTTP request
        $gateway = new \App\Services\Stripe\StripeSdkGateway(app(\App\Support\GemCheckoutConfig::class));
        $this->expectException(StripeGatewayException::class);
        $this->expectExceptionMessage('Only Stripe test keys');
        $gateway->retrieveCheckoutSession('cs_live_x');
    }

    public function test_the_database_refuses_a_production_order(): void
    {
        $player = $this->registerPlayer();
        [$publicId] = $this->openCheckout($player);

        $this->expectException(\Illuminate\Database\QueryException::class);
        DB::table('gem_orders')->where('public_id', $publicId)->update(['livemode' => true]);
    }

    public function test_order_amount_gems_and_beneficiary_are_decided_by_the_server(): void
    {
        $player = $this->registerPlayer();
        $other = $this->registerPlayer();

        $res = $this->orderPack($player, 'gems_650', [
            'amount_cents' => 1,
            'gems' => 999999,
            'currency' => 'usd',
            'account_id' => $other['id'],
            'success_url' => 'https://evil.example/steal',
        ])->assertCreated();

        $res->assertJsonPath('order.gems', 650)
            ->assertJsonPath('order.amount_cents', 999)
            ->assertJsonPath('order.currency', 'eur')
            ->assertJsonPath('order.status', 'open')
            ->assertJsonPath('order.livemode', false);
        $this->assertStringStartsWith('https://checkout.stripe.com/', (string) $res->json('checkout_url'));

        $order = GemOrder::query()->sole();
        $this->assertSame($player['id'], $order->account_id);
        $this->assertSame(AuthController::TERMS_VERSION, $order->terms_version);
        $this->assertFalse($order->livemode);

        $call = $this->stripe->createCalls[0];
        $params = $call['params'];
        $this->assertSame("gem-order-{$order->public_id}", $call['key']);
        $this->assertSame('payment', $params['mode']);
        $this->assertSame(['card'], $params['payment_method_types']);
        $this->assertSame((string) $order->public_id, $params['client_reference_id']);
        $this->assertSame(999, $params['line_items'][0]['price_data']['unit_amount']);
        $this->assertSame('eur', $params['line_items'][0]['price_data']['currency']);
        $this->assertSame(1, $params['line_items'][0]['quantity']);
        // nothing about the player goes to Stripe
        $this->assertArrayNotHasKey('customer_email', $params);
        $this->assertStringNotContainsString($player['email'], json_encode($params));
        $this->assertStringContainsString('aucun argent débité', $params['custom_text']['submit']['message']);
        $this->assertSame('fr', $params['locale']);
        $this->assertSame("https://campuscove.test/gems/return?order={$order->public_id}&result=success", $params['success_url']);
        $this->assertSame("https://campuscove.test/gems/return?order={$order->public_id}&result=cancel", $params['cancel_url']);
        $this->assertArrayNotHasKey('automatic_tax', $params);
        $this->assertArrayNotHasKey('invoice_creation', $params);
    }

    public function test_order_requires_a_known_pack(): void
    {
        $player = $this->registerPlayer();

        $this->orderPack($player, 'gems_9999')->assertStatus(422)->assertJsonValidationErrors('pack');
        $this->postJson('/api/gems/orders', [], $this->authAs($player))->assertStatus(422)->assertJsonValidationErrors('pack');
        $this->assertSame(0, GemOrder::query()->count());
    }

    public function test_order_requires_the_current_terms(): void
    {
        $player = $this->registerPlayer();
        DB::table('accounts')->where('account_id', $player['id'])->update(['terms_version' => '2020-01-01']);

        $this->orderPack($player)->assertStatus(409)->assertJsonPath('code', 'terms_outdated');
    }

    public function test_double_click_hands_back_the_same_order_and_session(): void
    {
        $player = $this->registerPlayer();

        $first = $this->orderPack($player)->assertCreated();
        $second = $this->orderPack($player)->assertOk();

        $this->assertSame($first->json('order.public_id'), $second->json('order.public_id'));
        $this->assertSame($first->json('checkout_url'), $second->json('checkout_url'));
        $this->assertCount(1, $this->stripe->createCalls);
        $this->assertSame(1, GemOrder::query()->count());

        // another pack is another order
        $this->orderPack($player, 'gems_100')->assertCreated();
        $this->assertSame(2, GemOrder::query()->count());
    }

    public function test_network_failure_keeps_the_order_and_retries_with_the_same_idempotency_key(): void
    {
        $player = $this->registerPlayer();
        $this->stripe->failNextCreate = [new StripeGatewayException('timeout', false)];

        $this->orderPack($player)->assertStatus(502)->assertJsonPath('code', 'payment_provider_unavailable');
        $order = GemOrder::query()->sole();
        $this->assertSame('creating', $order->status);
        $this->assertSame('stripe_unreachable', $order->last_error);

        $this->orderPack($player)->assertOk()->assertJsonPath('order.public_id', (string) $order->public_id)->assertJsonPath('order.status', 'open');
        $this->assertCount(2, $this->stripe->createCalls);
        $this->assertSame($this->stripe->createCalls[0]['key'], $this->stripe->createCalls[1]['key']);
        $this->assertSame($this->stripe->createCalls[0]['params'], $this->stripe->createCalls[1]['params']);
        $this->assertNull($order->refresh()->last_error);
    }

    public function test_stripe_refusal_closes_the_order_and_the_next_click_starts_a_new_one(): void
    {
        $player = $this->registerPlayer();
        $this->stripe->failNextCreate = [new StripeGatewayException('invalid_request_error', true)];

        $this->orderPack($player)->assertStatus(502);
        $this->assertSame('canceled', GemOrder::query()->sole()->status);

        $this->orderPack($player)->assertCreated();
        $this->assertSame(2, GemOrder::query()->count());
        $this->assertNotSame($this->stripe->createCalls[0]['key'], $this->stripe->createCalls[1]['key']);
    }

    public function test_pending_orders_per_player_are_capped(): void
    {
        $player = $this->registerPlayer();
        foreach (['gems_100', 'gems_300', 'gems_650', 'gems_1400'] as $pack) {
            $this->orderPack($player, $pack)->assertCreated();
        }
        // the 5th one: an older open order of the same pack, outside the reuse window
        GemOrder::query()->where('pack_code', 'gems_100')->update(['created_at' => now()->subMinutes(30)]);
        $this->orderPack($player, 'gems_100')->assertCreated();

        GemOrder::query()->where('pack_code', 'gems_300')->update(['created_at' => now()->subMinutes(30)]);
        $this->orderPack($player, 'gems_300')->assertStatus(429)->assertJsonPath('code', 'too_many_pending_orders');
    }

    public function test_order_creation_is_rate_limited(): void
    {
        $player = $this->registerPlayer();
        for ($i = 0; $i < 10; $i++) {
            $this->orderPack($player)->assertSuccessful();
        }
        $this->orderPack($player)->assertStatus(429);
    }

    public function test_players_only_see_their_own_orders(): void
    {
        $owner = $this->registerPlayer();
        $other = $this->registerPlayer();
        [$publicId] = $this->openCheckout($owner);

        $this->getJson("/api/gems/orders/{$publicId}", $this->authAs($other))->assertNotFound()->assertJsonPath('code', 'order_not_found');
        $this->getJson('/api/gems/orders/not-a-uuid', $this->authAs($other))->assertNotFound();
        $this->getJson('/api/gems/orders', $this->authAs($other))->assertOk()->assertJsonPath('orders', []);

        $this->getJson("/api/gems/orders/{$publicId}", $this->authAs($owner))->assertOk()->assertJsonPath('order.public_id', $publicId);
        $this->getJson('/api/gems/orders', $this->authAs($owner))->assertOk()->assertJsonCount(1, 'orders');
    }

    public function test_banned_player_cannot_order(): void
    {
        $player = $this->registerPlayer();
        DB::table('accounts')->where('account_id', $player['id'])->update(['banned_at' => now()]);

        $this->orderPack($player)->assertForbidden()->assertJsonPath('code', 'account_banned');
    }

    public function test_return_page_never_credits_on_its_own_and_resyncs_the_wallet_from_the_api(): void
    {
        $player = $this->registerPlayer();
        [$publicId, $sessionId] = $this->openCheckout($player);

        // the player comes back on the success URL without paying: still open, nothing credited
        $this->getJson("/api/gems/orders/{$publicId}", $this->authAs($player))
            ->assertOk()
            ->assertJsonPath('order.status', 'open')
            ->assertJsonPath('wallet_summary.premium', 0);

        // paid on Stripe, webhook late: the status lookup asks Stripe itself and delivers
        $this->stripe->pay($sessionId);
        $this->travel(5)->seconds();
        $this->getJson("/api/gems/orders/{$publicId}", $this->authAs($player))
            ->assertOk()
            ->assertJsonPath('order.status', 'paid')
            ->assertJsonPath('order.delivered', true)
            ->assertJsonPath('wallet_summary.premium', 650)
            ->assertJsonPath('wallet_summary.coins', $this->wallet($player['id'])['coins']);
        $this->assertSame(650, $this->wallet($player['id'])['premium']);
        $this->getJson('/api/user', $this->authAs($player))->assertJsonPath('user.wallet_summary.premium', 650);
    }

    public function test_status_lookups_hit_stripe_at_most_every_few_seconds(): void
    {
        $player = $this->registerPlayer();
        [$publicId] = $this->openCheckout($player);

        for ($i = 0; $i < 5; $i++) {
            $this->getJson("/api/gems/orders/{$publicId}", $this->authAs($player))->assertOk();
        }
        $this->assertSame(1, $this->stripe->retrieveCalls);
    }

    public function test_stripe_down_on_the_return_page_still_answers_with_the_known_state(): void
    {
        $player = $this->registerPlayer();
        [$publicId] = $this->openCheckout($player);
        $this->stripe->failNextRetrieves = 1;

        $this->getJson("/api/gems/orders/{$publicId}", $this->authAs($player))->assertOk()->assertJsonPath('order.status', 'open');
    }

    public function test_spending_gems_with_a_negative_balance_is_refused_but_buying_a_pack_is_not(): void
    {
        $this->seed(\Database\Seeders\ShopSeeder::class);
        $player = $this->registerPlayer();
        $this->setWalletBalance($player['id'], 'premium', -200);
        $premiumItem = DB::table('shop_catalog_items')->where('allow_premium', true)->where('is_active', true)->where('is_published', true)->first();
        $this->assertNotNull($premiumItem);

        $this->postJson('/api/shop/purchase', ['shop_catalog_item_id' => $premiumItem->shop_catalog_item_id, 'currency' => 'premium'], $this->authAs($player))
            ->assertStatus(422)
            ->assertJsonPath('code', 'premium_debt');

        $this->orderPack($player, 'gems_300')->assertCreated();
    }

    public function test_orders_are_exported_and_kept_when_the_account_is_deleted(): void
    {
        $player = $this->registerPlayer();
        [$publicId] = $this->openCheckout($player);

        $export = $this->getJson('/api/account/export', $this->authAs($player))->assertOk();
        $this->assertSame($publicId, $export->json('tables.gem_orders.0.public_id'));
        $this->assertSame(999, $export->json('tables.gem_orders.0.amount_cents'));

        app(AccountPrivacyService::class)->anonymize(\App\Models\Account::query()->findOrFail($player['id']));
        $order = GemOrder::query()->where('public_id', $publicId)->sole();
        $this->assertSame($player['id'], $order->account_id);
        $this->assertNotContains($player['email'], array_map('strval', $order->getAttributes()));
    }

    public function test_reconcile_closes_orders_whose_session_was_never_created(): void
    {
        $player = $this->registerPlayer();
        $this->stripe->failNextCreate = [new StripeGatewayException('timeout', false)];
        $this->orderPack($player)->assertStatus(502);
        GemOrder::query()->update(['created_at' => now()->subHour()]);

        $this->artisan('gems:reconcile')->assertSuccessful();

        $order = GemOrder::query()->sole();
        $this->assertSame('canceled', $order->status);
        $this->assertSame('session_not_created', $order->last_error);
    }

    public function test_reconcile_does_nothing_without_stripe(): void
    {
        config(['services.stripe.secret' => '']);
        $this->artisan('gems:reconcile')->expectsOutput('Stripe is not configured: nothing to reconcile.')->assertSuccessful();
    }
}
