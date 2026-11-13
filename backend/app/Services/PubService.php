<?php

namespace App\Services;

use App\Enums\ActionCounter;
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

    public const DARTS_BONUS_SCORE = 80;

    public function __construct(
        private readonly AccountInventoryService $inventory,
        private readonly CoinRewardService $coinRewards,
        private readonly ActionCounterService $counters,
        private readonly PlayerActivityService $activity,
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
            $this->activity->basketPaid($accountId, 'pub', []);
            $this->activity->pubOrder($accountId);

            return ['code' => (string) $def->code, 'price' => $price, 'balance_after' => $balance];
        });
    }

    /** @return array{game: string, fee: int, alcohol: int, balance_after: int} */
    public function play(int $accountId, string $game): array
    {
        $rules = self::GAMES[$game] ?? throw new PubRejectedException('unknown_game', 'There is no such game at the pub.');

        return DB::transaction(function () use ($accountId, $game, $rules): array {
            // no fee while the reward is on cooldown: the player would pay for a game that cannot pay back
            $wallet = Wallet::lockForAccount($accountId, Wallet::CASH);
            $secondsLeft = $this->cooldownSecondsLeft($wallet, 'pub_reward_'.$game);
            if ($secondsLeft > 0) {
                throw new PubRejectedException('pub_cooldown', "You can play this game again in {$secondsLeft} s.", 429);
            }
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
            $wallet = Wallet::lockForAccount($accountId, Wallet::CASH);
            if ($game === 'darts') {
                $this->counters->bump($accountId, ActionCounter::DartsPlayed);
            }
            if ($game === 'darts' && $placement > 0 && $score >= self::DARTS_BONUS_SCORE) {
                $this->counters->bump($accountId, ActionCounter::DartsDuels80);
            }
            if (in_array($game, ['darts', 'drink_fast'], true) && $placement === 1) {
                $this->counters->bump($accountId, ActionCounter::DuelsWon);
            }
            if ($this->cooldownSecondsLeft($wallet, $reason) > 0) {
                return ['coins' => 0, 'cooldown' => true, 'balance_after' => $wallet->balance()];
            }
            if ($coins > 0) {
                $this->coinRewards->creditCash($accountId, $reason, $coins, ['game' => $game, 'placement' => $placement, 'score' => $score]);
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
                1 => 30 + ($score >= self::DARTS_BONUS_SCORE ? 20 : 0),
                0 => $score >= 45 ? 10 : 0,
                default => 0,
            },
        };
    }

    private function cooldownSecondsLeft(Wallet $wallet, string $rewardReason): int
    {
        $lastReward = WalletLedgerEntry::query()
            ->where('wallet_id', $wallet->wallet_id)
            ->where('reason', $rewardReason)
            ->where('created_at', '>=', now()->subSeconds(self::REWARD_COOLDOWN_SECONDS))
            ->max('created_at');
        if ($lastReward === null) {
            return 0;
        }

        return max(1, (int) ceil(self::REWARD_COOLDOWN_SECONDS - now()->diffInSeconds($lastReward, true)));
    }

    /**
     * @param  array<string, mixed>  $meta
     */
    private function debit(int $accountId, int $amount, string $type, array $meta): int
    {
        $wallet = Wallet::lockForAccount($accountId, Wallet::CASH);
        $balance = $wallet->balance();
        if ($balance < $amount) {
            throw new PubRejectedException('insufficient_funds', 'Not enough cash on you. Withdraw some at an ATM.');
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
