<?php

namespace App\Console\Commands;

use App\Services\JobService;
use Illuminate\Console\Command;

/** Scheduled every minute (bootstrap/app.php). */
class CloseStaleJobShifts extends Command
{
    protected $signature = 'jobs:close-stale';

    protected $description = 'Close the job shifts the realtime server stopped paying (crash, restart)';

    public function handle(JobService $jobs): int
    {
        $count = $jobs->closeStaleShifts();
        $this->info("Closed {$count} stale shift(s).");

        return self::SUCCESS;
    }
}
