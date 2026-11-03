<?php

namespace Tests\Concerns;

use App\Services\Stripe\StripeGateway;
use App\Services\WalletSummaryService;
use Illuminate\Testing\TestResponse;
use Tests\Fakes\FakeStripeGateway;

/** Gem shop tests: Stripe test mode with fake keys, the in-memory Stripe, signed webhook calls. */
trait BuysGems
{
    protected FakeStripeGateway $stripe;

    private const WEBHOOK_SECRET = 'whsec_test_campuscove';

    protected function setUpGemShop(): void
    {
        config([
            'services.stripe.checkout_mode' => 'test',
            'services.stripe.secret' => 'sk_test_campuscove_fake',
            'services.stripe.webhook_secret' => self::WEBHOOK_SECRET,
            'app.frontend_url' => 'https://campuscove.test',
        ]);
        $this->stripe = new FakeStripeGateway;
        $this->app->instance(StripeGateway::class, $this->stripe);
    }

    /** @return array{id: int, token: string, email: string} */
    protected function registerPlayer(): array
    {
        $email = 'u'.uniqid('', true).'@test.com';
        $res = $this->postJson('/api/register', [
            'email' => $email,
            'username' => 'u'.substr(str_replace('.', '', uniqid('', true)), 0, 10),
            'password' => 'password1x',
            'accepted_terms' => true,
            'age_confirmed' => true,
        ]);
        $res->assertCreated();

        return ['id' => (int) $res->json('user.account_id'), 'token' => $res->json('token'), 'email' => $email];
    }

    /** @return array<string, string> */
    protected function authAs(array $player): array
    {
        $this->app['auth']->forgetGuards();

        return ['Authorization' => 'Bearer '.$player['token']];
    }

    protected function orderPack(array $player, string $pack = 'gems_650', array $extra = []): TestResponse
    {
        return $this->postJson('/api/gems/orders', array_merge([
            'pack' => $pack,
            'locale' => 'fr',
        ], $extra), $this->authAs($player));
    }

    /** Orders a pack and returns [order public id, Checkout Session id]. */
    protected function openCheckout(array $player, string $pack = 'gems_650'): array
    {
        $res = $this->orderPack($player, $pack)->assertCreated();
        $publicId = (string) $res->json('order.public_id');
        $sessionId = (string) \App\Models\GemOrder::query()->where('public_id', $publicId)->value('stripe_checkout_session_id');

        return [$publicId, $sessionId];
    }

    /** Posts a Stripe event signed like Stripe does (t=..., v1=HMAC-SHA256 of "t.payload"). */
    protected function sendStripeEvent(string $type, array $object, array $overrides = [], ?string $secret = null): TestResponse
    {
        $payload = json_encode(array_merge([
            'id' => 'evt_'.bin2hex(random_bytes(8)),
            'object' => 'event',
            'type' => $type,
            'livemode' => false,
            'created' => time(),
            'api_version' => '2026-10-28.endive',
            'data' => ['object' => $object],
        ], $overrides), JSON_THROW_ON_ERROR);

        return $this->postSignedPayload($payload, $secret ?? self::WEBHOOK_SECRET);
    }

    protected function postSignedPayload(string $payload, string $secret, ?int $timestamp = null): TestResponse
    {
        $t = $timestamp ?? time();
        $signature = hash_hmac('sha256', "{$t}.{$payload}", $secret);

        return $this->call('POST', '/api/stripe/webhook', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_STRIPE_SIGNATURE' => "t={$t},v1={$signature}",
        ], $payload);
    }

    /** checkout.session.* event body: Stripe sends the session, the code fetches it again. */
    protected function sessionEvent(string $type, string $sessionId, array $overrides = []): TestResponse
    {
        return $this->sendStripeEvent($type, $this->stripe->sessions[$sessionId], $overrides);
    }

    protected function refundEvent(string $type, string $paymentIntentId): TestResponse
    {
        return $this->sendStripeEvent($type, ['id' => 're_evt', 'object' => 'refund', 'payment_intent' => $paymentIntentId, 'status' => 'succeeded']);
    }

    /** @return array{coins: int, premium: int} */
    protected function wallet(int $accountId): array
    {
        return app(WalletSummaryService::class)->forAccountId($accountId);
    }
}
