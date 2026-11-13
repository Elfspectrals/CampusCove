<?php

namespace App\Services;

use App\Exceptions\ShopPurchaseRejectedException;
use App\Models\Account;
use App\Models\AccountShopPurchase;
use App\Models\EconomyTransaction;
use App\Models\ShopCatalogItem;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

final class ShopPurchaseService
{
    public function __construct(
        private readonly AccountInventoryService $accountInventoryService,
    ) {}

    public function purchaseByCatalogPublicId(
        Account $account,
        string $shopItemPublicId,
        int $quantity,
        ?string $selectedCurrency = null,
        ?int $coinUnitPrice = null
    ): ShopPurchaseResult
    {
        if ($quantity < 1) {
            throw new ShopPurchaseRejectedException('invalid_quantity', 'Quantity must be at least 1.', 422);
        }

        return DB::transaction(function () use ($account, $shopItemPublicId, $quantity, $selectedCurrency, $coinUnitPrice): ShopPurchaseResult {
            /** @var ShopCatalogItem|null $catalogItem */
            $catalogItem = ShopCatalogItem::query()
                ->where('public_id', $shopItemPublicId)
                ->lockForUpdate()
                ->first();

            if ($catalogItem === null) {
                throw new ShopPurchaseRejectedException('invalid_shop_item', 'Shop item not found.', 404);
            }

            $catalogItem->load('itemDef');
            $itemDef = $catalogItem->itemDef;
            if ($itemDef === null) {
                throw new ShopPurchaseRejectedException('invalid_shop_item', 'Shop item not found.', 404);
            }

            if (! $catalogItem->is_active) {
                throw new ShopPurchaseRejectedException('item_unavailable', 'This item is not available for purchase.', 422);
            }
            if (! $catalogItem->is_published) {
                throw new ShopPurchaseRejectedException('item_unavailable', 'This item is not available for purchase.', 422);
            }

            if ($catalogItem->is_unique_per_account && $quantity !== 1) {
                throw new ShopPurchaseRejectedException('invalid_quantity', 'This item can only be purchased one at a time.', 422);
            }

            $maxQty = max(1, min(999, $itemDef->max_stack));
            if ($quantity > $maxQty) {
                throw new ShopPurchaseRejectedException('invalid_quantity', 'Quantity exceeds the maximum allowed for this item.', 422);
            }

            if ($catalogItem->stock_remaining !== null && $catalogItem->stock_remaining < $quantity) {
                throw new ShopPurchaseRejectedException('item_unavailable', 'This item is out of stock.', 422);
            }

            [$currency, $unitPrice] = $this->resolvePricing($catalogItem, $selectedCurrency);
            if ($coinUnitPrice !== null) {
                if ($currency !== 'coins') {
                    throw new ShopPurchaseRejectedException('invalid_currency', 'Zone prices are paid in coins.', 422);
                }
                $unitPrice = $coinUnitPrice;
            }
            if ($itemDef->premium_only && $currency !== 'premium') {
                throw new ShopPurchaseRejectedException('invalid_currency', 'This item can only be bought with premium currency.', 422);
            }
            $totalDebit = $unitPrice * $quantity;

            $accountId = $account->getAuthIdentifier();
            $wallet = Wallet::lockForAccount((int) $accountId, $currency === 'coins' ? Wallet::CASH : (string) $currency);

            $balance = $wallet->balance();
            // a refunded gem pack whose gems were already spent leaves a debt (PremiumGemLedgerService)
            if ($currency === 'premium' && $balance < 0) {
                throw new ShopPurchaseRejectedException('premium_debt', 'Your gem balance is negative after a refund. Top up your gems before spending them again.', 422);
            }
            if ($balance < $totalDebit) {
                throw new ShopPurchaseRejectedException('insufficient_funds', $currency === 'coins' ? 'Not enough cash on you. Withdraw some at an ATM.' : 'Insufficient wallet balance.', 422);
            }

            if ($catalogItem->is_unique_per_account) {
                $already = AccountShopPurchase::query()
                    ->where('account_id', $accountId)
                    ->where('shop_catalog_item_id', $catalogItem->shop_catalog_item_id)
                    ->where('is_unique_at_purchase', true)
                    ->exists();
                if ($already) {
                    throw new ShopPurchaseRejectedException('already_owned', 'You already own this item.', 422);
                }
            }
            // Cove Threads clothes are not unique forever (they are lost when passing out), only one at a time.
            if ($itemDef->kind === 'cosmetic' && (int) $itemDef->max_stack === 1
                && $this->accountInventoryService->accountHasPositiveQuantity($accountId, (int) $itemDef->item_def_id)) {
                throw new ShopPurchaseRejectedException('already_owned', 'You already own this item.', 422);
            }

            $tx = EconomyTransaction::query()->create([
                'server_id' => null,
                'type' => 'shop_purchase',
                'status' => 'committed',
                'created_by_account_id' => $accountId,
                'committed_at' => now(),
                'meta_json' => [
                    'shop_catalog_item_id' => $catalogItem->shop_catalog_item_id,
                    'shop_item_public_id' => $catalogItem->public_id,
                    'quantity' => $quantity,
                    'total_debit' => $totalDebit,
                    'currency' => $currency,
                ],
            ]);

            try {
                WalletLedgerEntry::query()->create([
                    'wallet_id' => $wallet->wallet_id,
                    'tx_id' => $tx->tx_id,
                    'delta' => -$totalDebit,
                    'reason' => 'shop_purchase',
                ]);

                $purchase = AccountShopPurchase::query()->create([
                    'account_id' => $accountId,
                    'shop_catalog_item_id' => $catalogItem->shop_catalog_item_id,
                    'tx_id' => $tx->tx_id,
                    'quantity' => $quantity,
                    'unit_price' => $unitPrice,
                    'total_debit' => $totalDebit,
                    'currency' => $currency,
                    'is_unique_at_purchase' => $catalogItem->is_unique_per_account,
                    'created_at' => now(),
                ]);
            } catch (UniqueConstraintViolationException) {
                throw new ShopPurchaseRejectedException('already_owned', 'You already own this item.', 422);
            }

            if ($catalogItem->stock_remaining !== null) {
                $affected = DB::affectingStatement(
                    'UPDATE shop_catalog_items SET stock_remaining = stock_remaining - ?, updated_at = ? WHERE shop_catalog_item_id = ? AND stock_remaining IS NOT NULL AND stock_remaining >= ?',
                    [$quantity, now(), $catalogItem->shop_catalog_item_id, $quantity]
                );
                if ($affected !== 1) {
                    throw new ShopPurchaseRejectedException('item_unavailable', 'This item is out of stock.', 422);
                }
            }

            $this->accountInventoryService->grantPurchasedItems((int) $accountId, $itemDef, $quantity);

            $balanceAfter = $wallet->balance();

            $purchase->load(['shopCatalogItem.itemDef']);

            return new ShopPurchaseResult($purchase, $balanceAfter);
        });
    }

    /** Most of one item in a basket line; the clothes sold one at a time cap it at 1. */
    public const MAX_LINE_QUANTITY = 20;

    /**
     * Pays a basket in cash. Every line is checked (on sale, price, stock, quantity) before anything is taken, and
     * the whole basket is paid or nothing is. The same `$checkoutKey` sent again (a retry after a lost answer)
     * returns the first payment instead of paying twice.
     *
     * @param  array<int, int>  $quantities  shop_catalog_item_id => quantity
     * @param  array<string, int>|null  $coinPriceByCode  item code => zone price, null for the catalogue prices
     * @return list<ShopPurchaseResult>
     */
    public function checkoutWithCoins(Account $account, array $quantities, string $checkoutKey, ?array $coinPriceByCode = null): array
    {
        if ($quantities === []) {
            throw new ShopPurchaseRejectedException('empty_basket', 'Your basket is empty.', 422);
        }
        foreach ($quantities as $quantity) {
            if ($quantity < 1 || $quantity > self::MAX_LINE_QUANTITY) {
                throw new ShopPurchaseRejectedException('invalid_quantity', 'Choose between 1 and '.self::MAX_LINE_QUANTITY.' of each item.', 422);
            }
        }
        $accountId = (int) $account->getAuthIdentifier();

        return DB::transaction(function () use ($account, $accountId, $quantities, $checkoutKey, $coinPriceByCode): array {
            $claimed = DB::affectingStatement(
                'INSERT INTO shop_checkouts (account_id, checkout_key) VALUES (?, ?) ON CONFLICT DO NOTHING',
                [$accountId, $checkoutKey]
            );
            if ($claimed === 0) {
                return $this->replayCheckout($accountId, $checkoutKey);
            }

            $ids = array_keys($quantities);
            $catalogItems = ShopCatalogItem::query()
                ->whereIn('shop_catalog_item_id', $ids)
                ->orderBy('shop_catalog_item_id')
                ->lockForUpdate()
                ->with('itemDef')
                ->get()
                ->keyBy('shop_catalog_item_id');

            if ($catalogItems->count() !== count($ids)) {
                throw new ShopPurchaseRejectedException('invalid_shop_item', 'Shop item not found.', 404);
            }

            $zonePrice = function (ShopCatalogItem $catalogItem) use ($coinPriceByCode): ?int {
                if ($coinPriceByCode === null) {
                    return null;
                }
                $code = (string) $catalogItem->itemDef?->code;
                if (! array_key_exists($code, $coinPriceByCode)) {
                    throw new ShopPurchaseRejectedException('not_sold_here', 'This item is not sold here.', 422);
                }

                return $coinPriceByCode[$code];
            };
            $totalDebit = 0;
            foreach ($quantities as $id => $quantity) {
                $catalogItem = $catalogItems[$id];
                if ($quantity > 1 && $this->soldOneAtATime($catalogItem)) {
                    throw new ShopPurchaseRejectedException('invalid_quantity', 'You can only buy one '.$catalogItem->itemDef?->name.'.', 422);
                }
                $totalDebit += ($zonePrice($catalogItem) ?? $this->resolvePricing($catalogItem, 'coins')[1]) * $quantity;
            }

            $wallet = Wallet::lockForAccount($accountId, Wallet::CASH);
            if ($wallet->balance() < $totalDebit) {
                throw new ShopPurchaseRejectedException('not_enough_coins', 'Not enough cash on you for this basket. Withdraw some at an ATM.', 422);
            }

            $results = [];
            foreach ($quantities as $id => $quantity) {
                $results[] = $this->purchaseByCatalogPublicId(
                    $account,
                    (string) $catalogItems[$id]->public_id,
                    $quantity,
                    'coins',
                    $zonePrice($catalogItems[$id])
                );
            }

            DB::update(
                'UPDATE shop_checkouts SET purchase_ids = ?::jsonb, balance_after = ? WHERE account_id = ? AND checkout_key = ?',
                [json_encode(array_map(fn (ShopPurchaseResult $r): int => (int) $r->purchase->getKey(), $results)), $results[array_key_last($results)]->balanceAfter, $accountId, $checkoutKey]
            );

            return $results;
        });
    }

    /** A unique item, or a piece of clothing (owned one at a time, lost when passing out). */
    private function soldOneAtATime(ShopCatalogItem $catalogItem): bool
    {
        $itemDef = $catalogItem->itemDef;

        return $catalogItem->is_unique_per_account || ($itemDef?->kind === 'cosmetic' && (int) $itemDef->max_stack === 1);
    }

    /** @return list<ShopPurchaseResult> the purchases of a basket already paid with this key */
    private function replayCheckout(int $accountId, string $checkoutKey): array
    {
        $row = DB::selectOne('SELECT purchase_ids, balance_after FROM shop_checkouts WHERE account_id = ? AND checkout_key = ?', [$accountId, $checkoutKey]);
        $ids = json_decode((string) $row->purchase_ids, true);

        return AccountShopPurchase::query()
            ->whereIn((new AccountShopPurchase)->getKeyName(), $ids)
            ->where('account_id', $accountId)
            ->with('shopCatalogItem.itemDef')
            ->get()
            ->map(fn (AccountShopPurchase $purchase): ShopPurchaseResult => new ShopPurchaseResult($purchase, (int) $row->balance_after))
            ->values()
            ->all();
    }

    /**
     * Currency and price of the purchase. Every catalog row enables at least one currency
     * (ck_shop_catalog_pricing), so allow_coins / allow_premium are the only source of truth.
     *
     * @return array{0: string, 1: int}
     */
    private function resolvePricing(ShopCatalogItem $catalogItem, ?string $selectedCurrency): array
    {
        $available = [];
        if ($catalogItem->allow_coins) {
            $available[] = 'coins';
        }
        if ($catalogItem->allow_premium) {
            $available[] = 'premium';
        }
        if ($available === []) {
            throw new ShopPurchaseRejectedException('invalid_shop_item', 'Shop item pricing is invalid.', 422);
        }

        if ($selectedCurrency === null) {
            if (count($available) > 1) {
                throw new ShopPurchaseRejectedException(
                    'currency_required',
                    'This item supports multiple currencies. Provide currency in the purchase request.',
                    422
                );
            }
            $selectedCurrency = $available[0];
        }

        if (! in_array($selectedCurrency, $available, true)) {
            throw new ShopPurchaseRejectedException(
                'invalid_currency',
                'Selected currency is not available for this item.',
                422
            );
        }

        $price = $selectedCurrency === 'coins'
            ? (int) $catalogItem->coins_price
            : (int) $catalogItem->premium_price;

        if ($price <= 0) {
            throw new ShopPurchaseRejectedException('invalid_shop_item', 'Shop item pricing is invalid.', 422);
        }

        return [$selectedCurrency, $price];
    }
}
