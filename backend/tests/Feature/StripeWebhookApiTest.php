<?php

namespace Tests\Feature;

use App\Models\GemOrder;
use App\Models\StripeWebhookEvent;
use App\Services\GemOrderFulfillmentService;
use App\Services\PremiumGemLedgerService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\BuysGems;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

/** Stripe webhook: signature, payment confirmation, exactly-once credit, refunds and disputes (docs/STRIPE.md). */
class StripeWebhookApiTest extends TestCase
{
    use BuysGems, RefreshDatabase, SetsWalletBalance;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpGemShop();
    }

    /** A player with an order for the 650-gem pack (999 cents) paid on Stripe, webhook not received yet. */
    private function paidOrder(): array
    {
        $player = $this->registerPlayer();
        [$publicId, $sessionId] = $this->openCheckout($player, 'gems_650');
        $paymentIntentId = $this->stripe->pay($sessionId);

        return [$player, $publicId, $sessionId, $paymentIntentId];
    }

    private function order(string $publicId): GemOrder
    {
        return GemOrder::query()->where('public_id', $publicId)->sole();
    }

    private function sentMessages(): int
    {
        return app('mailer')->getSymfonyTransport()->messages()->count();
    }

    public function test_invalid_or_missing_signature_is_rejected_before_anything_else(): void
    {
        [, $publicId, $sessionId] = $this->paidOrder();
        $payload = json_encode(['id' => 'evt_forged', 'object' => 'event', 'type' => 'checkout.session.completed', 'livemode' => false, 'data' => ['object' => $this->stripe->sessions[$sessionId]]]);

        $this->postSignedPayload($payload, 'whsec_wrong_secret')->assertStatus(400)->assertJsonPath('code', 'invalid_signature');
        $this->postSignedPayload($payload, self::WEBHOOK_SECRET, time() - 3600)->assertStatus(400);
        $this->call('POST', '/api/stripe/webhook', [], [], [], ['CONTENT_TYPE' => 'application/json'], $payload)->assertStatus(400);

        $this->assertSame('open', $this->order($publicId)->status);
        $this->assertSame(0, StripeWebhookEvent::query()->count());
        $this->assertSame(0, $this->stripe->retrieveCalls);
    }

    public function test_webhook_answers_503_while_stripe_is_not_configured(): void
    {
        config(['services.stripe.webhook_secret' => '']);
        $this->postSignedPayload('{}', self::WEBHOOK_SECRET)->assertStatus(503);
    }

    public function test_paid_checkout_credits_exactly_the_pack_once_without_the_browser(): void
    {
        [$player, $publicId, $sessionId, $paymentIntentId] = $this->paidOrder();
        $coinsBefore = $this->wallet($player['id'])['coins'];

        // the player closed the tab after paying: only Stripe calls back
        $this->sessionEvent('checkout.session.completed', $sessionId)->assertOk()->assertJsonPath('outcome', 'processed');

        $this->assertSame(['coins' => $coinsBefore, 'premium' => 650], $this->wallet($player['id']));
        $order = $this->order($publicId);
        $this->assertSame('paid', $order->status);
        $this->assertNotNull($order->paid_at);
        $this->assertNotNull($order->delivered_at);
        $this->assertSame($paymentIntentId, $order->stripe_payment_intent_id);
        $this->assertNull($order->checkout_url);

        $tx = DB::table('transactions')->where('tx_id', $order->delivery_tx_id)->first();
        $this->assertSame('premium_purchase', $tx->type);
        $this->assertSame($publicId, json_decode($tx->meta_json, true)['gem_order']);
        $this->assertDatabaseHas('wallet_ledger', ['tx_id' => $order->delivery_tx_id, 'delta' => 650, 'reason' => 'gem_purchase']);

        // confirmation e-mail, once
        $this->assertNotNull($order->confirmation_email_sent_at);
        $this->assertSame(1, $this->sentMessages());
    }

    public function test_repeated_and_different_events_of_one_payment_credit_once(): void
    {
        [$player, $publicId, $sessionId] = $this->paidOrder();

        $event = ['id' => 'evt_repeated'];
        $this->sessionEvent('checkout.session.completed', $sessionId, $event)->assertOk()->assertJsonPath('outcome', 'processed');
        $this->sessionEvent('checkout.session.completed', $sessionId, $event)->assertOk()->assertJsonPath('outcome', 'duplicate');
        // another event of the same payment, and the return page polling on top
        $this->sessionEvent('checkout.session.async_payment_succeeded', $sessionId)->assertOk()->assertJsonPath('outcome', 'processed');
        $this->travel(5)->seconds();
        $this->getJson("/api/gems/orders/{$publicId}", $this->authAs($player))->assertOk();
        $this->artisan('gems:reconcile', ['--order' => $publicId])->assertSuccessful();

        $this->assertSame(650, $this->wallet($player['id'])['premium']);
        $this->assertSame(1, DB::table('transactions')->where('type', 'premium_purchase')->count());
        $this->assertSame(1, $this->sentMessages());
        $this->assertSame(1, StripeWebhookEvent::query()->where('event_id', 'evt_repeated')->count());
    }

    /**
     * Sequential: the same snapshot applied twice in one process. The real race between processes is in
     * GemDeliveryConcurrencyTest.
     */
    public function test_applying_the_same_payment_twice_credits_once(): void
    {
        [$player, $publicId, $sessionId] = $this->paidOrder();
        $session = app(\App\Services\Stripe\StripeGateway::class)->retrieveCheckoutSession($sessionId);
        $fulfillment = app(GemOrderFulfillmentService::class);

        // a second worker with the same Stripe snapshot, after the first: it sees the delivery and adds nothing
        $fulfillment->applyCheckoutSession($session);
        $fulfillment->applyCheckoutSession($session);
        $this->assertSame(650, $this->wallet($player['id'])['premium']);

        // and the database refuses a second credit even if a code path skipped the lock
        $order = $this->order($publicId);
        $this->expectException(QueryException::class);
        app(PremiumGemLedgerService::class)->creditOrder($order);
    }

    public function test_a_paid_order_cannot_exist_without_its_delivery(): void
    {
        $player = $this->registerPlayer();
        [$publicId] = $this->openCheckout($player);

        $this->expectException(QueryException::class);
        DB::table('gem_orders')->where('public_id', $publicId)->update(['status' => 'paid', 'paid_at' => now()]);
    }

    public function test_payment_that_does_not_match_the_order_is_not_delivered(): void
    {
        foreach ([
            'amount_mismatch' => [['amount_received' => 1], ['amount_total' => 1]],
            'payment_not_succeeded' => [['status' => 'processing'], []],
            'livemode_mismatch' => [[], ['livemode' => true]],
            'reference_mismatch' => [[], ['client_reference_id' => '00000000-0000-4000-8000-000000000000']],
        ] as $reason => [$paymentIntent, $session]) {
            $player = $this->registerPlayer();
            [$publicId, $sessionId] = $this->openCheckout($player);
            $this->stripe->pay($sessionId, $paymentIntent, $session);

            $this->sendStripeEvent('checkout.session.completed', ['id' => $sessionId, 'object' => 'checkout.session', 'client_reference_id' => $publicId])->assertOk();

            $order = $this->order($publicId);
            $this->assertFalse($order->isDelivered(), $reason);
            $this->assertSame($reason, $order->last_error);
            $this->assertSame(0, $this->wallet($player['id'])['premium'], $reason);
        }
    }

    public function test_event_from_the_other_stripe_environment_is_ignored(): void
    {
        [$player, , $sessionId] = $this->paidOrder();

        $this->sessionEvent('checkout.session.completed', $sessionId, ['livemode' => true])->assertOk()->assertJsonPath('outcome', 'ignored');
        $this->assertSame(0, $this->wallet($player['id'])['premium']);
    }

    public function test_unrelated_events_are_acknowledged_without_effect(): void
    {
        $this->sendStripeEvent('customer.created', ['id' => 'cus_1', 'object' => 'customer'])->assertOk()->assertJsonPath('outcome', 'ignored');
        // a Checkout Session of another integration on the same Stripe account
        $this->sendStripeEvent('checkout.session.completed', ['id' => 'cs_other', 'object' => 'checkout.session', 'client_reference_id' => 'shop-42'])->assertOk()->assertJsonPath('outcome', 'processed');
        $this->assertSame(0, $this->stripe->retrieveCalls);
        $this->assertSame(0, GemOrder::query()->count());
    }

    public function test_temporary_failure_is_retried_and_only_marked_processed_once_applied(): void
    {
        [$player, $publicId, $sessionId] = $this->paidOrder();
        $this->stripe->failNextRetrieves = 1;

        $this->sessionEvent('checkout.session.completed', $sessionId, ['id' => 'evt_retry'])->assertStatus(500)->assertJsonPath('code', 'webhook_retry');
        $row = StripeWebhookEvent::query()->where('event_id', 'evt_retry')->sole();
        $this->assertNull($row->processed_at);
        $this->assertSame(1, $row->attempts);
        $this->assertSame(0, $this->wallet($player['id'])['premium']);

        // Stripe retries the same event
        $this->sessionEvent('checkout.session.completed', $sessionId, ['id' => 'evt_retry'])->assertOk()->assertJsonPath('outcome', 'processed');
        $this->assertNotNull($row->refresh()->processed_at);
        $this->assertSame(650, $this->wallet($player['id'])['premium']);
        $this->assertSame('paid', $this->order($publicId)->status);
    }

    public function test_session_id_lost_after_stripe_answered_is_recovered_from_the_reference(): void
    {
        [$player, $publicId, $sessionId] = $this->paidOrder();
        GemOrder::query()->where('public_id', $publicId)->update(['stripe_checkout_session_id' => null, 'status' => 'creating', 'checkout_url' => null]);

        $this->sessionEvent('checkout.session.completed', $sessionId)->assertOk();

        $order = $this->order($publicId);
        $this->assertSame($sessionId, $order->stripe_checkout_session_id);
        $this->assertSame('paid', $order->status);
        $this->assertSame(650, $this->wallet($player['id'])['premium']);
    }

    public function test_mail_failure_never_undoes_the_credit(): void
    {
        [$player, $publicId, $sessionId] = $this->paidOrder();
        DB::table('account_auth_local')->where('account_id', $player['id'])->update(['email' => "deleted-{$player['id']}@invalid.campuscove"]);

        $this->sessionEvent('checkout.session.completed', $sessionId)->assertOk();

        $this->assertSame(650, $this->wallet($player['id'])['premium']);
        $this->assertNull($this->order($publicId)->confirmation_email_sent_at);
    }

    public function test_cancel_return_expiry_and_out_of_order_events(): void
    {
        $player = $this->registerPlayer();
        [$publicId, $sessionId] = $this->openCheckout($player);

        // back from "cancel": nothing changes, the session stays usable until it expires
        $this->getJson("/api/gems/orders/{$publicId}", $this->authAs($player))->assertJsonPath('order.status', 'open');

        $this->stripe->expire($sessionId);
        $this->sessionEvent('checkout.session.expired', $sessionId)->assertOk();
        $this->assertSame('expired', $this->order($publicId)->status);
        $this->assertNotNull($this->order($publicId)->expired_at);

        // a stale "still open" snapshot afterwards never reopens it
        app(GemOrderFulfillmentService::class)->applyCheckoutSession(['id' => $sessionId, 'status' => 'open', 'client_reference_id' => $publicId, 'livemode' => false]);
        $this->assertSame('expired', $this->order($publicId)->status);
        $this->assertSame(0, $this->wallet($player['id'])['premium']);
    }

    public function test_a_confirmed_payment_wins_over_an_earlier_expiry_and_is_never_downgraded(): void
    {
        [$player, $publicId, $sessionId] = $this->paidOrder();
        GemOrder::query()->where('public_id', $publicId)->update(['status' => 'expired', 'expired_at' => now()]);

        $this->sessionEvent('checkout.session.completed', $sessionId)->assertOk();
        $this->assertSame('paid', $this->order($publicId)->status);

        // a late expired event (or a stale snapshot) does not touch a paid order
        $this->sendStripeEvent('checkout.session.expired', ['id' => $sessionId, 'object' => 'checkout.session']);
        app(GemOrderFulfillmentService::class)->applyCheckoutSession(['id' => $sessionId, 'status' => 'expired', 'client_reference_id' => $publicId, 'livemode' => false]);
        $this->assertSame('paid', $this->order($publicId)->status);
        $this->assertSame(650, $this->wallet($player['id'])['premium']);
    }

    public function test_delayed_payment_is_pending_then_failed_without_any_credit(): void
    {
        $player = $this->registerPlayer();
        [$publicId, $sessionId] = $this->openCheckout($player);
        $paymentIntentId = $this->stripe->pay($sessionId, ['status' => 'processing', 'amount_received' => 0], ['payment_status' => 'unpaid']);

        $this->sessionEvent('checkout.session.completed', $sessionId)->assertOk();
        $this->assertSame('processing', $this->order($publicId)->status);

        $this->stripe->paymentIntents[$paymentIntentId]['status'] = 'requires_payment_method';
        $this->sessionEvent('checkout.session.async_payment_failed', $sessionId)->assertOk();
        $this->assertSame('failed', $this->order($publicId)->status);
        $this->assertSame(0, $this->wallet($player['id'])['premium']);
    }

    public function test_delayed_payment_that_succeeds_is_credited(): void
    {
        $player = $this->registerPlayer();
        [$publicId, $sessionId] = $this->openCheckout($player);
        $paymentIntentId = $this->stripe->pay($sessionId, ['status' => 'processing', 'amount_received' => 0], ['payment_status' => 'unpaid']);
        $this->sessionEvent('checkout.session.completed', $sessionId)->assertOk();

        $this->stripe->paymentIntents[$paymentIntentId] = array_merge($this->stripe->paymentIntents[$paymentIntentId], ['status' => 'succeeded', 'amount_received' => 999]);
        $this->stripe->sessions[$sessionId]['payment_status'] = 'paid';
        $this->sessionEvent('checkout.session.async_payment_succeeded', $sessionId)->assertOk();

        $this->assertSame('paid', $this->order($publicId)->status);
        $this->assertSame(650, $this->wallet($player['id'])['premium']);
    }

    public function test_full_refund_takes_the_pack_back_once(): void
    {
        [$player, $publicId, $sessionId, $paymentIntentId] = $this->paidOrder();
        $this->sessionEvent('checkout.session.completed', $sessionId)->assertOk();
        $this->setWalletBalance($player['id'], 'premium', 650 + 50);

        $this->stripe->refund($paymentIntentId, 999);
        $this->refundEvent('refund.created', $paymentIntentId)->assertOk();
        $this->refundEvent('charge.refunded', $paymentIntentId)->assertOk();
        $this->refundEvent('refund.updated', $paymentIntentId)->assertOk();

        $order = $this->order($publicId);
        $this->assertSame(999, $order->refunded_cents);
        $this->assertSame(650, $order->gems_reversed);
        $this->assertSame('full', $order->refundStatus());
        $this->assertNotNull($order->refunded_at);
        $this->assertSame(50, $this->wallet($player['id'])['premium']);
        $this->assertSame(1, DB::table('wallet_ledger')->where('reason', 'gem_refund')->count());
        $this->assertDatabaseHas('wallet_ledger', ['reason' => 'gem_refund', 'delta' => -650]);
        // the purchase entries are still there
        $this->assertDatabaseHas('wallet_ledger', ['tx_id' => $order->delivery_tx_id, 'delta' => 650]);
        $this->getJson('/api/gems/orders', $this->authAs($player))->assertJsonPath('orders.0.refund.status', 'full');
    }

    public function test_partial_refunds_take_back_the_rounded_down_share_then_the_rest(): void
    {
        [$player, $publicId, $sessionId, $paymentIntentId] = $this->paidOrder();
        $this->sessionEvent('checkout.session.completed', $sessionId)->assertOk();

        $this->stripe->refund($paymentIntentId, 500);
        $this->refundEvent('charge.refunded', $paymentIntentId)->assertOk();
        // 650 * 500 / 999 = 325.3 -> 325
        $this->assertSame(325, $this->order($publicId)->gems_reversed);
        $this->assertSame(325, $this->wallet($player['id'])['premium']);
        $this->assertSame('partial', $this->order($publicId)->refundStatus());

        // the rest of the amount: the whole pack, whatever the rounding
        $this->stripe->refund($paymentIntentId, 499);
        $this->refundEvent('charge.refunded', $paymentIntentId)->assertOk();
        $this->refundEvent('charge.refunded', $paymentIntentId)->assertOk();
        $this->assertSame(650, $this->order($publicId)->gems_reversed);
        $this->assertSame(0, $this->wallet($player['id'])['premium']);
        $this->assertSame([-325, -325], DB::table('wallet_ledger')->where('reason', 'gem_refund')->orderBy('entry_id')->pluck('delta')->map(fn ($d) => (int) $d)->all());
    }

    public function test_pending_refund_takes_nothing_and_a_failed_refund_gives_the_gems_back(): void
    {
        [$player, $publicId, $sessionId, $paymentIntentId] = $this->paidOrder();
        $this->sessionEvent('checkout.session.completed', $sessionId)->assertOk();

        $refundId = $this->stripe->refund($paymentIntentId, 999, 'pending');
        $this->refundEvent('refund.created', $paymentIntentId)->assertOk();
        $this->assertSame(0, $this->order($publicId)->gems_reversed);
        $this->assertSame(650, $this->wallet($player['id'])['premium']);

        $this->stripe->setRefundStatus($paymentIntentId, $refundId, 'succeeded');
        $this->refundEvent('refund.updated', $paymentIntentId)->assertOk();
        $this->assertSame(0, $this->wallet($player['id'])['premium']);

        // the bank sends the refund back: the counted refund is compensated, nothing deleted
        $this->stripe->setRefundStatus($paymentIntentId, $refundId, 'failed');
        $this->refundEvent('refund.failed', $paymentIntentId)->assertOk();
        $this->assertSame(0, $this->order($publicId)->gems_reversed);
        $this->assertSame(650, $this->wallet($player['id'])['premium']);
        $this->assertDatabaseHas('wallet_ledger', ['reason' => 'gem_refund', 'delta' => -650]);
        $this->assertDatabaseHas('wallet_ledger', ['reason' => 'gem_refund_reversal', 'delta' => 650]);
        $this->assertSame('none', $this->order($publicId)->refundStatus());
    }

    public function test_refund_after_spending_leaves_a_debt_that_blocks_gem_spending_only(): void
    {
        $this->seed(\Database\Seeders\ShopSeeder::class);
        [$player, $publicId, $sessionId, $paymentIntentId] = $this->paidOrder();
        $this->sessionEvent('checkout.session.completed', $sessionId)->assertOk();

        // spends 600 of the 650 gems on a skin (kept after the refund)
        $this->setWalletBalance($player['id'], 'premium', 50);
        $this->stripe->refund($paymentIntentId, 999);
        $this->refundEvent('charge.refunded', $paymentIntentId)->assertOk();

        $this->assertSame(-600, $this->wallet($player['id'])['premium']);
        $item = DB::table('shop_catalog_items')->where('allow_premium', true)->where('is_active', true)->where('is_published', true)->first();
        $this->postJson('/api/shop/purchase', ['shop_catalog_item_id' => $item->shop_catalog_item_id, 'currency' => 'premium'], $this->authAs($player))
            ->assertStatus(422)->assertJsonPath('code', 'premium_debt');
        $this->getJson('/api/user', $this->authAs($player))->assertJsonPath('user.wallet_summary.premium', -600);

        // a new pack pays the debt back
        [, $secondSession] = $this->openCheckout($player, 'gems_1400');
        $this->stripe->pay($secondSession);
        $this->sessionEvent('checkout.session.completed', $secondSession)->assertOk();
        $this->assertSame(800, $this->wallet($player['id'])['premium']);
    }

    public function test_refund_event_before_the_checkout_event_delivers_then_takes_back(): void
    {
        [$player, $publicId, , $paymentIntentId] = $this->paidOrder();
        $this->stripe->refund($paymentIntentId, 999);

        // charge.refunded arrives first: the order is found through the PaymentIntent metadata
        $this->refundEvent('charge.refunded', $paymentIntentId)->assertOk();

        $order = $this->order($publicId);
        $this->assertSame('paid', $order->status);
        $this->assertSame(650, $order->gems_reversed);
        $this->assertSame(0, $this->wallet($player['id'])['premium']);
        $this->assertSame(2, DB::table('wallet_ledger')->whereIn('reason', ['gem_purchase', 'gem_refund'])->count());
    }

    public function test_dispute_is_recorded_and_never_takes_more_than_the_pack_with_a_refund(): void
    {
        [$player, $publicId, $sessionId, $paymentIntentId] = $this->paidOrder();
        $this->sessionEvent('checkout.session.completed', $sessionId)->assertOk();

        $this->stripe->refund($paymentIntentId, 300);
        $this->refundEvent('charge.refunded', $paymentIntentId)->assertOk();
        $this->assertSame(195, $this->order($publicId)->gems_reversed);

        // open dispute: recorded for manual handling, the gems stay
        $this->stripe->dispute($paymentIntentId, 999, 'needs_response');
        $this->sendStripeEvent('charge.dispute.created', ['id' => 'dp', 'object' => 'dispute', 'payment_intent' => $paymentIntentId])->assertOk();
        $order = $this->order($publicId);
        $this->assertSame('needs_response', $order->dispute_status);
        $this->assertNotNull($order->dispute_id);
        $this->assertSame(195, $order->gems_reversed);

        // lost: refund + dispute capped at the price -> exactly the pack, not 650 + 195
        $this->stripe->dispute($paymentIntentId, 999, 'lost');
        $this->sendStripeEvent('charge.dispute.closed', ['id' => 'dp', 'object' => 'dispute', 'payment_intent' => $paymentIntentId])->assertOk();
        $this->sendStripeEvent('charge.dispute.funds_withdrawn', ['id' => 'dp', 'object' => 'dispute', 'payment_intent' => $paymentIntentId])->assertOk();
        $order = $this->order($publicId);
        $this->assertSame('lost', $order->dispute_status);
        $this->assertSame(650, $order->gems_reversed);
        $this->assertSame(0, $this->wallet($player['id'])['premium']);
    }

    public function test_won_dispute_takes_nothing(): void
    {
        [$player, $publicId, $sessionId, $paymentIntentId] = $this->paidOrder();
        $this->sessionEvent('checkout.session.completed', $sessionId)->assertOk();

        $this->stripe->dispute($paymentIntentId, 999, 'won');
        $this->sendStripeEvent('charge.dispute.closed', ['id' => 'dp', 'object' => 'dispute', 'payment_intent' => $paymentIntentId])->assertOk();

        $this->assertSame('won', $this->order($publicId)->dispute_status);
        $this->assertSame(650, $this->wallet($player['id'])['premium']);
    }

    public function test_stale_refund_snapshot_does_not_overwrite_a_newer_one(): void
    {
        [$player, $publicId, $sessionId, $paymentIntentId] = $this->paidOrder();
        $this->sessionEvent('checkout.session.completed', $sessionId)->assertOk();
        $this->stripe->refund($paymentIntentId, 999);
        $this->refundEvent('charge.refunded', $paymentIntentId)->assertOk();

        // a slower worker that fetched before the refund applies its (older) snapshot afterwards
        GemOrder::query()->where('public_id', $publicId)->update(['stripe_state_version' => PHP_INT_MAX]);
        $this->stripe->refunds = [];
        app(GemOrderFulfillmentService::class)->syncPaymentState($this->order($publicId), 'stale');

        $this->assertSame(650, $this->order($publicId)->gems_reversed);
        $this->assertSame(0, $this->wallet($player['id'])['premium']);
    }

    public function test_reconcile_delivers_a_paid_order_whose_webhook_never_came(): void
    {
        [$player, $publicId] = $this->paidOrder();
        GemOrder::query()->where('public_id', $publicId)->update(['created_at' => now()->subMinutes(20)]);

        $this->artisan('gems:reconcile')->assertSuccessful();

        $this->assertSame('paid', $this->order($publicId)->status);
        $this->assertSame(650, $this->wallet($player['id'])['premium']);
    }

    public function test_gems_to_reverse_is_a_deterministic_rounded_down_share(): void
    {
        $this->assertSame(0, PremiumGemLedgerService::gemsToReverse(650, 999, 0));
        $this->assertSame(0, PremiumGemLedgerService::gemsToReverse(100, 199, 1));
        $this->assertSame(50, PremiumGemLedgerService::gemsToReverse(100, 199, 100));
        $this->assertSame(1399, PremiumGemLedgerService::gemsToReverse(1400, 1999, 1998));
        $this->assertSame(1400, PremiumGemLedgerService::gemsToReverse(1400, 1999, 1999));
        $this->assertSame(1400, PremiumGemLedgerService::gemsToReverse(1400, 1999, 5000));
    }
}
