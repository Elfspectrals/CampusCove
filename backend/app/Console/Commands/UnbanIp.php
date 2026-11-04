<?php

namespace App\Console\Commands;

use App\Services\IpBanService;
use Illuminate\Console\Command;

class UnbanIp extends Command
{
    protected $signature = 'security:unban {ip}';

    protected $description = 'Lift every active ban on an IP address';

    public function handle(IpBanService $bans): int
    {
        $ip = trim((string) $this->argument('ip'));
        if (filter_var($ip, FILTER_VALIDATE_IP) === false) {
            $this->error("'{$ip}' is not an IP address.");

            return self::FAILURE;
        }

        $lifted = $bans->unban($ip);
        if ($lifted === 0) {
            $this->warn("No active ban on {$ip}.");

            return self::SUCCESS;
        }

        $this->info("Lifted {$lifted} active ban(s) on {$ip}.");

        return self::SUCCESS;
    }
}
