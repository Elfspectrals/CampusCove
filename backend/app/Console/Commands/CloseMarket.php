<?php

namespace App\Console\Commands;

use App\Services\MarketService;
use Illuminate\Console\Command;

class CloseMarket extends Command
{
    protected $signature = 'market:close';

    protected $description = 'Give the unsold lots of a market that is no longer open back to their sellers';

    public function handle(MarketService $market): int
    {
        $count = $market->closePastMarkets();
        $this->info("Returned {$count} lot(s).");

        return self::SUCCESS;
    }
}
