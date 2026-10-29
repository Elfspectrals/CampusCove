<?php

namespace App\Services;

use App\Exceptions\PubRejectedException;
use App\Models\EconomyTransaction;
use App\Models\ItemDef;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use App\Support\FoodCatalog;
use Illuminate\Support\Facades\DB;

final class PubService
{
    /** @var array<string, array{fee: int, alcohol: int}> */
    public const GAMES = [
        'drink_fast' => ['fee' => 20, 'alcohol' => 24],
        'meter_shot' => ['fee' => 35, 'alcohol' => 50],
        'darts' => ['fee' => 10, 'alcohol' => 0],
    ];

    public const REWARD_COOLDOWN_SECONDS = 60;

    public function __construct(
        private readonly AccountInventoryService $inventory,
        private readonly CoinRewardService $coinRewards,
    ) {}

    /** @return array{code: string, price: int, balance_after: int} */
    public function order(int $accountId, string $code): array
    {
        $drink = collect(FoodCatalog::items())
            ->first(fn (array $item): bool => $item['code'] === $code && $item['group'] === 'drinks' && $item['price'] !== null);
        if ($drink === null) {
            throw new PubRejectedException('unknown_drink', 'The bar does not serve this.', 404);
        }
        $def = ItemDef::query()->where('code', $code)->firstOrFail();
        $price = (int) $drink['price'];

        return DB::transaction(function () use ($accountId, $def, $price): array {
            $balance = $this->debit($accountId, $price, 'pub_order', ['code' => $def->code]);
            $this->inventory->grantItem($accountId, $def, 1);

            return ['code' => (string) $def->code, 'price' => $price, 'balance_after' => $balance];
        });
    }

    /** @return array{game: string, fee: int, alcohol: int, balance_after: int} */
    public function play(int $accountId, string $game): array
    {
        $rules = self::GAMES[$game] ?? throw new PubRejectedException('unknown_game', 'There is no such game at the pub.');

        return DB::transaction(function () use ($accountId, $game, $rules): array {
            $balance = $this->debit($accountId, $rules['fee'], 'pub_play', ['game' => $game]);

            return ['game' => $game, 'fee' => $rules['fee'], 'alcohol' => $rules['alcohol'], 'balance_after' => $balance];
        });
    }

    /** @return array{coins: int, cooldown: bool, balance_after: int} */
    public function reward(int $accountId, string $game, int $placement, int $score): array
    {
        if (! array_key_exists($game, self::GAMES)) {
            throw new PubRejectedException('unknown_game', 'There is no such game at the pub.');
        }
        $coins = self::rewardCoins($game, $placement, $score);
        $reason = 'pub_reward_'.$game;

        return DB::transaction(function () use ($accountId, $game, $placement, $score, $coins, $reason): array {
            $wallet = Wallet::lockForAccount($accountId, 'coins');
            $rewardedRecently = WalletLedgerEntry::query()
                ->where('wallet_id', $wallet->wallet_id)
                ->where('reason', $reason)
                ->where('created_at', '>=', now()->subSeconds(self::REWARD_COOLDOWN_SECONDS))
                ->exists();
            if ($rewardedRecently) {
                return ['coins' => 0, 'cooldown' => true, 'balance_after' => $wallet->balance()];
            }
            if ($coins > 0) {
                $this->coinRewards->credit($accountId, $reason, $coins, ['game' => $game, 'placement' => $placement, 'score' => $score]);
            }

            return ['coins' => $coins, 'cooldown' => false, 'balance_after' => $wallet->balance()];
        });
    }

    public static function rewardCoins(string $game, int $placement, int $score): int
    {
        return match ($game) {
            'drink_fast' => match ($placement) {
                1 => 40,
                2 => 15,
                0 => $score < 20000 ? 15 : 0,
                default => 0,
            },
            'meter_shot' => $score < 6000 ? 30 : ($score < 9000 ? 15 : 0),
            'darts' => match ($placement) {
                1 => 30 + ($score >= 100 ? 20 : 0),
                0 => $score >= 60 ? 10 : 0,
                default => 0,
            },
        };
    }

    /**
     * @param  array<string, mixed>  $meta
     */
    private function debit(int $accountId, int $amount, string $type, array $meta): int
    {
        $wallet = Wallet::lockForAccount($accountId, 'coins');
        $balance = $wallet->balance();
        if ($balance < $amount) {
            throw new PubRejectedException('insufficient_funds', 'Insufficient wallet balance.');
        }
        $tx = EconomyTransaction::query()->create([
            'server_id' => null,
            'type' => $type,
            'status' => 'committed',
            'created_by_account_id' => $accountId,
            'committed_at' => now(),
            'meta_json' => array_merge(['amount' => $amount], $meta),
        ]);
        WalletLedgerEntry::query()->create([
            'wallet_id' => $wallet->wallet_id,
            'tx_id' => $tx->tx_id,
            'delta' => -$amount,
            'reason' => $type,
        ]);

        return $balance - $amount;
    }
}
