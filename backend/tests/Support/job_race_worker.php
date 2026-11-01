<?php

/*
 * One racer of JobConcurrencyTest: boots the app in its own process (its own database connection), waits for the
 * shared start time, then calls JobService once and prints the outcome as JSON.
 *
 * php tests/Support/job_race_worker.php <pay|start> <accountId> <shiftId|-> <period|-> <startAtUnixFloat>
 */

use App\Exceptions\ApiRejectedException;
use App\Services\JobService;
use Illuminate\Contracts\Console\Kernel;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

[, $action, $accountId, $shiftId, $period, $startAt] = $argv;
$jobs = $app->make(JobService::class);
// warm the connection up so every racer only has the query left to run at the start time
$app->make('db')->select('SELECT 1');

while (microtime(true) < (float) $startAt) {
    usleep(100);
}

try {
    $result = $action === 'pay'
        ? $jobs->paySalary((int) $accountId, (int) $shiftId, (int) $period)
        : $jobs->start((int) $accountId, 'dev', 'tech_hub', 'station_dev_01');
    echo json_encode(['ok' => true, 'result' => $result, 'at' => microtime(true)]);
} catch (ApiRejectedException $e) {
    echo json_encode(['ok' => false, 'code' => $e->errorCode, 'at' => microtime(true)]);
}
