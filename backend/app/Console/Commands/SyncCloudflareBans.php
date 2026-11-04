<?php

namespace App\Console\Commands;

use App\Services\CloudflareBanSync;
use Illuminate\Console\Command;

class SyncCloudflareBans extends Command
{
    protected $signature = 'security:sync-cloudflare';

    protected $description = 'Block active bans and unblock lifted or expired ones in Cloudflare';

    public function handle(CloudflareBanSync $cloudflare): int
    {
        $cloudflare->syncAll();

        return self::SUCCESS;
    }
}
