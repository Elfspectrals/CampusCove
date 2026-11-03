<?php

namespace Tests\Feature;

use App\Models\GemOrder;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\BuysGems;
use Tests\Concerns\RacesProcesses;
use Tests\TestCase;

/**
 * Two "Buy" clicks for the same pack at the same time, each in its own PHP process
 * (tests/Scripts/start-gem-checkout.php) with a slow Stripe shared through a call log (tests/Fakes/SlowStripeGateway).
 * The test holds the account row lock until both wait on it, then releases it so they race.
 */
class GemCheckoutConcurrencyTest extends TestCase
{
    use BuysGems, RacesProcesses;

    /** Longer than the hand-over of the account lock: the second click arrives while Stripe is still answering. */
    private const STRIPE_DELAY_MS = 1500;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpRace();
        $this->setUpGemShop();
    }

    protected function tearDown(): void
    {
        $this->tearDownRace();
        parent::tearDown();
    }

    public function test_simultaneous_clicks_make_one_order_and_one_stripe_creation(): void
    {
        $player = $this->registerPlayer();
        $callLog = (string) tempnam(sys_get_temp_dir(), 'gem-create-');

        $results = $this->race(
            fn () => DB::table('accounts')->where('account_id', $player['id'])->lockForUpdate()->first(),
            array_fill(0, 2, ['tests/Scripts/start-gem-checkout.php', (string) $player['id'], 'gems_650', $callLog, (string) self::STRIPE_DELAY_MS]),
        );
        $calls = file($callLog, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        @unlink($callLog);

        // one click created the session, the other was told to wait, not shown an error
        usort($results, fn (array $a, array $b) => strcmp($a['result'], $b['result']));
        $this->assertSame(['created', 'preparing'], array_column($results, 'result'));
        $this->assertSame($results[0]['order'], $results[1]['order']);
        $this->assertNull($results[1]['checkout_url']);

        // one order, one Stripe call while both were in flight
        $order = GemOrder::query()->sole();
        $this->assertSame(["gem-order-{$order->public_id}"], $calls);
        $this->assertSame('open', $order->status);
        $this->assertSame($results[0]['checkout_url'], $order->checkout_url);
        $this->assertNull($order->checkout_lease_until);

        // the waiting browser polls the order and finds the same payment page; a later click gets it too
        $this->getJson("/api/gems/orders/{$order->public_id}", $this->authAs($player))->assertOk()->assertJsonPath('checkout_url', $order->checkout_url);
        $this->orderPack($player)->assertOk()->assertJsonPath('checkout_url', $order->checkout_url);
        $this->assertSame([], $this->stripe->createCalls);
        $this->assertSame(1, GemOrder::query()->count());
    }
}
