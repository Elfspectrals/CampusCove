<?php

namespace App\Console\Commands;

use App\Services\SportsBoardService;
use Illuminate\Console\Command;

class CloseSportsBoards extends Command
{
    protected $signature = 'sports:close-boards';

    protected $description = 'Crown the first of each weekly sports board once its week is over';

    public function handle(SportsBoardService $boards): int
    {
        $count = $boards->closePastWeek();
        $this->info("Crowned {$count} champion(s).");

        return self::SUCCESS;
    }
}
