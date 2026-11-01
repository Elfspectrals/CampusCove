<?php

/**
 * One webhook worker for GemDeliveryConcurrencyTest: boots the app in its own PHP process (own database connection)
 * and applies the Checkout Session snapshot stored in the JSON file given as first argument.
 */

use App\Services\GemOrderFulfillmentService;
use Illuminate\Contracts\Console\Kernel;

require __DIR__.'/../../vendor/autoload.php';

$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$session = json_decode((string) file_get_contents($argv[1]), true, flags: JSON_THROW_ON_ERROR);
$order = $app->make(GemOrderFulfillmentService::class)->applyCheckoutSession($session);

echo json_encode(['status' => $order?->status, 'delivery_tx_id' => $order?->delivery_tx_id]);
