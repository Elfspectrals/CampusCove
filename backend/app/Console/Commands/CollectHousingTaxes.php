<?php

namespace App\Console\Commands;

use App\Services\HousingService;
use Illuminate\Console\Command;

/** Scheduled every minute (bootstrap/app.php). */
class CollectHousingTaxes extends Command
{
    protected $signature = 'housing:collect-taxes';

    protected $description = 'Collect the daily property tax of owned houses and seize those whose owner cannot pay';

    public function handle(HousingService $housing): int
    {
        $count = $housing->collectDueTaxes();
        $this->info("Seized {$count} house(s).");

        return self::SUCCESS;
    }
}
