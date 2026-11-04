<?php

/**
 * One "Buy" click for GemCheckoutConcurrencyTest, in its own PHP process (own database connection).
 * Arguments: account id, pack code, call log file, Stripe delay in ms. Stripe is tests/Fakes/SlowStripeGateway.
 */

use App\Exceptions\ApiRejectedException;
use App\Models\Account;
use App\Services\GemCheckoutService;
use App\Services\Stripe\StripeGateway;
use Illuminate\Contracts\Console\Kernel;
use Tests\Fakes\SlowStripeGateway;

require __DIR__.'/../../vendor/autoload.php';

$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

[, $accountId, $pack, $callLog, $delayMs] = $argv;
config([
    'services.stripe.checkout_mode' => 'test',
    'services.stripe.secret' => 'sk_test_campuscove_fake',
    'services.stripe.webhook_secret' => 'whsec_test_campuscove',
    'app.frontend_url' => 'https://campuscove.test',
]);
$app->instance(StripeGateway::class, new SlowStripeGateway($callLog, (int) $delayMs));

try {
    $result = $app->make(GemCheckoutService::class)->start(Account::query()->findOrFail((int) $accountId), $pack, 'fr');
    echo json_encode([
        'result' => $result['preparing'] ? 'preparing' : ($result['reused'] ? 'reused' : 'created'),
        'order' => (string) $result['order']->public_id,
        'checkout_url' => $result['checkout_url'],
    ]);
} catch (ApiRejectedException $e) {
    echo json_encode(['result' => 'rejected', 'code' => $e->errorCode]);
}
