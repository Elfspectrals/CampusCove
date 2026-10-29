<?php

namespace App\Services;

use App\Exceptions\TradeRejectedException;
use App\Models\Account;
use App\Models\EconomyTransaction;
use App\Models\ItemDef;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use App\Support\AssetUrl;
use Illuminate\Support\Facades\DB;

/**
 * Player-to-player trades, negotiated live on the realtime server (socket/src/trade.ts) and executed here in one
 * transaction once both players confirmed. Only items flagged tradable, not premium-only and not bound can change
 * hands, so premium skins (real money) never become obtainable for coins through a trade.
 */
final class TradeService
{
    public const MAX_COINS = 1_000_000;

    public const MAX_LINES = 12;

    public const MAX_QUANTITY = 999;

    public function __construct(
        private readonly AccountInventoryService $inventory,
        private readonly WalletSummaryService $wallets,
    ) {
    }

    public static function isTradable(object $def): bool
    {
        return (bool) $def->tradable && ! (bool) $def->premium_only && $def->bind === 'none';
    }

    /**
     * What the player can put in a trade: their coins and every tradable item they hold (worn clothes excluded).
     *
     * @return array{coins: int, items: list<array{item_def_id: int, code: string, name: string, kind: string, quantity: int, preview_image: string|null, cosmetic_slot: string|null}>}
     */
    public function offerable(int $accountId): array
    {
        $worn = $this->wornItemDefIds($accountId);
        $items = $this->inventory->aggregatedItemsForAccount($accountId, null, null)
            ->filter(fn (object $row): bool => $row->quantity > 0 && self::isTradable($row) && ! in_array($row->item_def_id, $worn, true))
            ->map(fn (object $row): array => [
                'item_def_id' => $row->item_def_id,
                'code' => $row->code,
                'name' => $row->name,
                'kind' => $row->kind,
                'quantity' => $row->quantity,
                'preview_image' => AssetUrl::normalize($row->preview_image),
                'cosmetic_slot' => $row->cosmetic_slot,
            ])
            ->values()
            ->all();

        return ['coins' => $this->wallets->forAccountId($accountId)['coins'], 'items' => $items];
    }

    /**
     * Swaps both offers atomically. Ownership, coins and room in the receiver's inventory are checked under row
     * locks at execution time, so an offer that is no longer covered fails as a whole.
     *
     * @param  array{coins: int, items: array<string, int>}  $myOffer  code => quantity
     * @param  array{coins: int, items: array<string, int>}  $partnerOffer
     * @return array{my_coins: int, partner_coins: int}
     */
    public function execute(int $accountId, int $partnerAccountId, array $myOffer, array $partnerOffer, string $tradeRef): array
    {
        if ($accountId === $partnerAccountId) {
            throw new TradeRejectedException('trade_self', 'You cannot trade with yourself.');
        }
        $partner = Account::query()->find($partnerAccountId);
        if ($partner === null || $partner->status !== 'active') {
            throw new TradeRejectedException('trade_partner_unavailable', 'This player cannot trade right now.');
        }
        if ($myOffer['coins'] === 0 && $myOffer['items'] === [] && $partnerOffer['coins'] === 0 && $partnerOffer['items'] === []) {
            throw new TradeRejectedException('trade_empty', 'Both offers are empty.');
        }

        return DB::transaction(function () use ($accountId, $partnerAccountId, $myOffer, $partnerOffer, $tradeRef): array {
            // same lock order for both players, whoever started the trade: no deadlock between two trades
            $ids = [$accountId, $partnerAccountId];
            sort($ids);
            foreach ($ids as $id) {
                $this->inventory->getOrCreateGiftInboxContainerId($id);
            }
            $walletByAccount = [];
            foreach ($ids as $id) {
                $walletByAccount[$id] = Wallet::lockForAccount($id, 'coins');
            }

            $alreadyDone = EconomyTransaction::query()
                ->where('type', 'trade')
                ->whereRaw("meta_json->>'trade_ref' = ?", [$tradeRef])
                ->exists();
            if ($alreadyDone) {
                throw new TradeRejectedException('trade_already_done', 'This trade was already completed.', 409);
            }

            $sides = [
                ['from' => $accountId, 'to' => $partnerAccountId, 'offer' => $myOffer],
                ['from' => $partnerAccountId, 'to' => $accountId, 'offer' => $partnerOffer],
            ];
            $defs = $this->resolveDefs([...array_keys($myOffer['items']), ...array_keys($partnerOffer['items'])]);

            $balances = [];
            foreach ($ids as $id) {
                $balances[$id] = $walletByAccount[$id]->balance();
            }
            foreach ($sides as $side) {
                if ($balances[$side['from']] < $side['offer']['coins']) {
                    throw new TradeRejectedException('trade_insufficient_coins', 'One of you no longer has enough coins.');
                }
                $worn = $this->wornItemDefIds($side['from']);
                foreach ($side['offer']['items'] as $code => $quantity) {
                    $def = $defs[$code];
                    if (in_array((int) $def->item_def_id, $worn, true)) {
                        throw new TradeRejectedException('trade_item_worn', "{$def->name} is being worn: take it off first.");
                    }
                    if ($this->ownedQuantity($side['from'], $def) < $quantity) {
                        throw new TradeRejectedException('trade_item_missing', "One of you no longer has enough {$def->name}.");
                    }
                    $kept = $this->ownedQuantity($side['to'], $def) - ($this->otherSide($sides, $side)['offer']['items'][$code] ?? 0);
                    if ($kept + $quantity > $def->max_stack) {
                        throw new TradeRejectedException('trade_inventory_full', $def->max_stack === 1
                            ? "One of you already owns {$def->name}."
                            : "One of you cannot carry that many {$def->name}.");
                    }
                }
            }

            $tx = EconomyTransaction::query()->create([
                'server_id' => null,
                'type' => 'trade',
                'status' => 'committed',
                'created_by_account_id' => $accountId,
                'committed_at' => now(),
                'meta_json' => [
                    'trade_ref' => $tradeRef,
                    'accounts' => [$accountId, $partnerAccountId],
                    'offers' => [(string) $accountId => $myOffer, (string) $partnerAccountId => $partnerOffer],
                ],
            ]);

            // every give is taken first, so a swap of the same item between both players never overflows a stack
            foreach ($sides as $side) {
                foreach ($side['offer']['items'] as $code => $quantity) {
                    $this->inventory->revokeItem($side['from'], $defs[$code], $quantity);
                }
            }
            foreach ($sides as $side) {
                foreach ($side['offer']['items'] as $code => $quantity) {
                    $this->inventory->grantItem($side['to'], $defs[$code], $quantity);
                }
                $coins = $side['offer']['coins'];
                if ($coins > 0) {
                    $this->ledger($walletByAccount[$side['from']], $tx, -$coins, 'trade_sent');
                    $this->ledger($walletByAccount[$side['to']], $tx, $coins, 'trade_received');
                    $balances[$side['from']] -= $coins;
                    $balances[$side['to']] += $coins;
                }
            }

            return ['my_coins' => $balances[$accountId], 'partner_coins' => $balances[$partnerAccountId]];
        });
    }

    /**
     * @param  list<string>  $codes
     * @return array<string, ItemDef>
     */
    private function resolveDefs(array $codes): array
    {
        $defs = ItemDef::query()->whereIn('code', array_unique($codes))->get()->keyBy('code')->all();
        foreach ($codes as $code) {
            $def = $defs[$code] ?? null;
            if ($def === null) {
                throw new TradeRejectedException('trade_item_unknown', 'Unknown item in the trade.');
            }
            if (! self::isTradable($def)) {
                throw new TradeRejectedException('trade_item_not_tradable', "{$def->name} cannot be traded.");
            }
        }

        return $defs;
    }

    /** Quantity held in the inventory (or the clothes locker), read under the inventory row locks. */
    private function ownedQuantity(int $accountId, ItemDef $def): int
    {
        if ($def->kind === 'cosmetic') {
            return (int) (DB::table('account_locker_cosmetics')
                ->where('account_id', $accountId)
                ->where('item_def_id', $def->item_def_id)
                ->lockForUpdate()
                ->value('quantity') ?? 0);
        }
        $containerId = $this->inventory->getOrCreateGiftInboxContainerId($accountId);
        $stack = (int) (DB::table('inventory_stacks')
            ->where('container_id', $containerId)
            ->where('item_def_id', $def->item_def_id)
            ->lockForUpdate()
            ->value('quantity') ?? 0);
        $instances = DB::table('item_instances')
            ->where('container_id', $containerId)
            ->where('item_def_id', $def->item_def_id)
            ->whereNotNull('owner_account_id')
            ->lockForUpdate()
            ->pluck('item_instance_id')
            ->count();

        return $stack + $instances;
    }

    /** @return list<int> */
    private function wornItemDefIds(int $accountId): array
    {
        return DB::table('account_cosmetic_equipment')
            ->where('account_id', $accountId)
            ->pluck('item_def_id')
            ->map(fn ($id): int => (int) $id)
            ->all();
    }

    /**
     * @param  list<array{from: int, to: int, offer: array{coins: int, items: array<string, int>}}>  $sides
     * @param  array{from: int, to: int, offer: array{coins: int, items: array<string, int>}}  $side
     * @return array{from: int, to: int, offer: array{coins: int, items: array<string, int>}}
     */
    private function otherSide(array $sides, array $side): array
    {
        return $sides[0]['from'] === $side['from'] ? $sides[1] : $sides[0];
    }

    private function ledger(Wallet $wallet, EconomyTransaction $tx, int $delta, string $reason): void
    {
        WalletLedgerEntry::query()->create([
            'wallet_id' => $wallet->wallet_id,
            'tx_id' => $tx->tx_id,
            'delta' => $delta,
            'reason' => $reason,
        ]);
    }
}
