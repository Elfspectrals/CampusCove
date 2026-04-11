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
    public function purchaseByCatalogPublicId(Account $account, string $shopItemPublicId, int $quantity): ShopPurchaseResult
    {
        if ($quantity < 1) {
            throw new ShopPurchaseRejectedException('invalid_quantity', 'Quantity must be at least 1.', 422);
        }

        return DB::transaction(function () use ($account, $shopItemPublicId, $quantity): ShopPurchaseResult {
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

            $currency = $catalogItem->currency;
            $unitPrice = $catalogItem->price;
            $totalDebit = $unitPrice * $quantity;

            $accountId = $account->getAuthIdentifier();
            $wallet = $this->lockAccountWallet((int) $accountId, (string) $currency);

            $balance = $this->walletBalance((int) $wallet->wallet_id);
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

            $balanceAfter = $this->walletBalance((int) $wallet->wallet_id);

            $purchase->load(['shopCatalogItem.itemDef']);

            return new ShopPurchaseResult($purchase, $balanceAfter);
        });
    }

    public function walletBalance(int $walletId): int
    {
        $sum = WalletLedgerEntry::query()->where('wallet_id', $walletId)->sum('delta');

        return (int) $sum;
    }

    private function lockAccountWallet(int $accountId, string $currency): Wallet
    {
        $wallet = Wallet::query()
            ->where('owner_type', Wallet::OWNER_TYPE_ACCOUNT)
            ->where('owner_id', $accountId)
            ->where('currency', $currency)
            ->lockForUpdate()
            ->first();

        if ($wallet !== null) {
            return $wallet;
        }

        try {
            return Wallet::query()->create([
                'owner_type' => Wallet::OWNER_TYPE_ACCOUNT,
                'owner_id' => $accountId,
                'currency' => $currency,
                'created_at' => now(),
            ]);
        } catch (UniqueConstraintViolationException) {
            // Another concurrent request created the wallet.
        }

        return Wallet::query()
            ->where('owner_type', Wallet::OWNER_TYPE_ACCOUNT)
            ->where('owner_id', $accountId)
            ->where('currency', $currency)
            ->lockForUpdate()
            ->firstOrFail();
    }
}
