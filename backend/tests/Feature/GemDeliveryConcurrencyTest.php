<?php

namespace Tests\Feature;

use App\Models\GemOrder;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\BuysGems;
use Tests\Concerns\RacesProcesses;
use Tests\TestCase;

/**
 * Webhook workers delivering the same paid order at the same time, each in its own PHP process
 * (tests/Scripts/apply-checkout-session.php). The test holds the order row lock until all of them wait on it,
 * then releases it so they race.
 */
class GemDeliveryConcurrencyTest extends TestCase
{
    use BuysGems, RacesProcesses;

    private const WORKERS = 3;

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

    public function test_workers_racing_on_the_same_payment_credit_it_once(): void
    {
        $player = $this->registerPlayer();
        [$publicId, $sessionId] = $this->openCheckout($player, 'gems_650');
        $this->stripe->pay($sessionId);
        $snapshot = tempnam(sys_get_temp_dir(), 'gem-session-');
        file_put_contents($snapshot, json_encode($this->stripe->retrieveCheckoutSession($sessionId), JSON_THROW_ON_ERROR));

        $results = $this->race(
            fn () => DB::table('gem_orders')->where('public_id', $publicId)->lockForUpdate()->first(),
            array_fill(0, self::WORKERS, ['tests/Scripts/apply-checkout-session.php', $snapshot]),
        );
        @unlink($snapshot);

        $order = GemOrder::query()->where('public_id', $publicId)->sole();
        $this->assertSame('paid', $order->status);
        // every worker ends on the same delivery, made once
        foreach ($results as $result) {
            $this->assertSame('paid', $result['status']);
            $this->assertSame($order->delivery_tx_id, $result['delivery_tx_id']);
        }
        $this->assertSame(1, DB::table('transactions')->where('type', 'premium_purchase')->whereRaw("meta_json->>'gem_order' = ?", [$publicId])->count());
        $this->assertSame(1, DB::table('wallet_ledger')->where('reason', 'gem_purchase')->count());
        $this->assertSame(650, $this->wallet($player['id'])['premium']);
    }
}
