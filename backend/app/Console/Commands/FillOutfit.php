<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\FindsAccount;
use App\Models\ItemDef;
use App\Services\AccountCosmeticService;
use App\Services\StarterCosmeticGrantService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class FillOutfit extends Command
{
    use FindsAccount;

    protected $signature = 'fillOutfit {account}';

    protected $description = 'Grant starter wearable stacks and equip the default Campus outfit (account_id or email)';

    public function handle(StarterCosmeticGrantService $grant, AccountCosmeticService $cosmetic): int
    {
        $account = $this->findAccount((string) $this->argument('account'));
        if (! $account) {
            return self::FAILURE;
        }
        $accountId = (int) $account->account_id;

        $known = ItemDef::query()->whereIn('code', StarterCosmeticGrantService::STARTER_CODES)->pluck('code')->all();
        if (array_diff(StarterCosmeticGrantService::STARTER_CODES, $known) !== []) {
            $this->error('Wearable item definitions are missing. Seed the shop first, e.g.:');
            $this->line('  make seed-shop');

            return self::FAILURE;
        }

        try {
            DB::transaction(function () use ($grant, $cosmetic, $accountId): void {
                $grant->ensureStarterCosmeticsForAccount($accountId);
                $cosmetic->equipDefaultStarterLook($accountId);
            });
        } catch (InvalidArgumentException $e) {
            $this->error('Could not equip outfit: '.$e->getMessage());

            return self::FAILURE;
        }

        $this->info("Locker filled for account_id={$accountId}: starter wearables in inventory + default outfit equipped.");

        return self::SUCCESS;
    }
}
