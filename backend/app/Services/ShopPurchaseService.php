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
        ?string $selectedCurrency = null
    ): ShopPurchaseResult
    {
        if ($quantity < 1) {
            throw new ShopPurchaseRejectedException('invalid_quantity', 'Quantity must be at least 1.', 422);
        }

        return DB::transaction(function () use ($account, $shopItemPublicId, $quantity, $selectedCurrency): ShopPurchaseResult {
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
            if ($itemDef->premium_only && $currency !== 'premium') {
                throw new ShopPurchaseRejectedException('invalid_currency', 'This item can only be bought with premium currency.', 422);
            }
            $totalDebit = $unitPrice * $quantity;

            $accountId = $account->getAuthIdentifier();
            $wallet = Wallet::lockForAccount((int) $accountId, (string) $currency);

            $balance = $wallet->balance();
            if ($balance < $totalDebit) {
                throw new ShopPurchaseRejectedException('insufficient_funds', 'Insufficient wallet balance.', 422);
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

    /**
     * @param  list<int>  $shopCatalogItemIds
     * @return list<ShopPurchaseResult>
     */
    public function checkoutWithCoins(Account $account, array $shopCatalogItemIds): array
    {
        if ($shopCatalogItemIds === []) {
            throw new ShopPurchaseRejectedException('empty_basket', 'Your basket is empty.', 422);
        }
        if (count(array_unique($shopCatalogItemIds)) !== count($shopCatalogItemIds)) {
            throw new ShopPurchaseRejectedException('duplicate_item', 'The same item is in your basket more than once.', 422);
        }

        return DB::transaction(function () use ($account, $shopCatalogItemIds): array {
            $catalogItems = ShopCatalogItem::query()
                ->whereIn('shop_catalog_item_id', $shopCatalogItemIds)
                ->orderBy('shop_catalog_item_id')
                ->lockForUpdate()
                ->get()
                ->keyBy('shop_catalog_item_id');

            if ($catalogItems->count() !== count($shopCatalogItemIds)) {
                throw new ShopPurchaseRejectedException('invalid_shop_item', 'Shop item not found.', 404);
            }

            $totalDebit = $catalogItems->sum(fn (ShopCatalogItem $catalogItem): int => $this->resolvePricing($catalogItem, 'coins')[1]);

            $wallet = Wallet::lockForAccount((int) $account->getAuthIdentifier(), 'coins');
            if ($wallet->balance() < $totalDebit) {
                throw new ShopPurchaseRejectedException('not_enough_coins', 'Not enough coins for this basket.', 422);
            }

            return array_map(
                fn (int $shopCatalogItemId): ShopPurchaseResult => $this->purchaseByCatalogPublicId(
                    $account,
                    (string) $catalogItems[$shopCatalogItemId]->public_id,
                    1,
                    'coins'
                ),
                $shopCatalogItemIds
            );
        });
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
