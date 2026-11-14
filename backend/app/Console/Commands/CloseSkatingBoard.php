<?php

namespace App\Console\Commands;

use App\Services\SkatingBoardService;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;

class CloseSkatingBoard extends Command
{
    protected $signature = 'sports:skating-board-close';

    protected $description = 'Record the fastest skater of each lap count for the week that just ended and give them the champion badge';

    public function handle(SkatingBoardService $boards): int
    {
        $lastWeek = $boards->weekStart(CarbonImmutable::now())->subWeek();
        $count = $boards->closeWeek($lastWeek);
        $this->info("Skating week {$boards->weekKey($lastWeek)}: {$count} champion(s).");

        return self::SUCCESS;
    }
}
