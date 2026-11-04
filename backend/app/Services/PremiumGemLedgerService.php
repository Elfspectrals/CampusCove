<?php

namespace App\Services;

use App\Models\EconomyTransaction;
use App\Models\GemOrder;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use Illuminate\Support\Facades\DB;

/**
 * Premium gems bought with real money: the credit of a paid order (tx_type premium_purchase) and the entries that
 * correct it after a refund or a lost dispute (premium_refund). Nothing is ever deleted: a correction is a new ledger
 * row. The balance may go below zero when the gems were already spent; ShopPurchaseService then refuses premium
 * spending until the player tops up.
 *
 * Callers hold the gem_orders row lock and own the once-only checks (GemOrderFulfillmentService).
 */
final class PremiumGemLedgerService
{
    /** @return int tx_id of the delivery */
    public function creditOrder(GemOrder $order): int
    {
        return DB::transaction(function () use ($order): int {
            $wallet = Wallet::lockForAccount((int) $order->account_id, 'premium');

            $tx = EconomyTransaction::query()->create([
                'server_id' => null,
                'type' => 'premium_purchase',
                'status' => 'committed',
                'created_by_account_id' => $order->account_id,
                'committed_at' => now(),
                'meta_json' => [
                    // unique per order (ux_transactions_gem_order_delivery)
                    'gem_order' => (string) $order->public_id,
                    'pack' => $order->pack_code,
                    'gems' => $order->gems,
                    'amount_cents' => $order->amount_cents,
                    'currency' => $order->currency,
                    'livemode' => $order->livemode,
                ],
            ]);

            WalletLedgerEntry::query()->create([
                'wallet_id' => $wallet->wallet_id,
                'tx_id' => $tx->tx_id,
                'delta' => $order->gems,
                'reason' => 'gem_purchase',
            ]);

            return (int) $tx->tx_id;
        });
    }

    /**
     * Moves the order's gems taken back from `$order->gems_reversed` to `$targetReversed`: a negative ledger delta
     * when more was refunded, a positive one when a counted refund failed afterwards.
     */
    public function adjustReversal(GemOrder $order, int $targetReversed, string $cause): void
    {
        $delta = (int) $order->gems_reversed - $targetReversed;
        if ($delta === 0) {
            return;
        }

        DB::transaction(function () use ($order, $targetReversed, $delta, $cause): void {
            $wallet = Wallet::lockForAccount((int) $order->account_id, 'premium');

            $tx = EconomyTransaction::query()->create([
                'server_id' => null,
                'type' => 'premium_refund',
                'status' => 'committed',
                'created_by_account_id' => null,
                'committed_at' => now(),
                'meta_json' => [
                    'gem_order' => (string) $order->public_id,
                    'cause' => $cause,
                    'refunded_cents' => $order->refunded_cents,
                    'dispute_lost_cents' => $order->dispute_lost_cents,
                    'gems_reversed_before' => (int) $order->gems_reversed,
                    'gems_reversed_after' => $targetReversed,
                ],
            ]);

            WalletLedgerEntry::query()->create([
                'wallet_id' => $wallet->wallet_id,
                'tx_id' => $tx->tx_id,
                'delta' => $delta,
                'reason' => $delta < 0 ? 'gem_refund' : 'gem_refund_reversal',
            ]);
        });
    }

    /**
     * Gems to take back for the money lost on an order: proportional to the amount refunded or lost in a dispute,
     * rounded down, and always the whole pack once the whole amount is lost.
     */
    public static function gemsToReverse(int $gems, int $amountCents, int $lostCents): int
    {
        $lost = max(0, min($amountCents, $lostCents));
        if ($lost >= $amountCents) {
            return $gems;
        }

        return intdiv($gems * $lost, $amountCents);
    }
}
