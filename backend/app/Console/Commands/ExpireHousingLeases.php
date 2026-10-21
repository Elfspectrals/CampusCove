<?php

namespace App\Console\Commands;

use App\Services\HousingService;
use Illuminate\Console\Command;

/** Scheduled every minute (bootstrap/app.php). */
class ExpireHousingLeases extends Command
{
    protected $signature = 'housing:expire-leases';

    protected $description = 'Reset housing units whose rent lease has expired';

    public function handle(HousingService $housing): int
    {
        $count = $housing->expireDueLeases();
        $this->info("Expired {$count} housing lease(s).");

        return self::SUCCESS;
    }
}
