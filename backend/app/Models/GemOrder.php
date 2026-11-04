<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A gem pack bought through Stripe Checkout in test mode, a demo payment (table gem_orders, see GemCheckoutService / GemOrderFulfillmentService).
 *
 * status: creating (local row, no Checkout Session yet) -> open (session created, waiting for the player)
 * -> processing (delayed payment method) -> paid (payment confirmed AND gems delivered, one transaction)
 * or failed / expired / canceled (session never created). A confirmed payment wins over every other status.
 */
class GemOrder extends Model
{
    public const STATUS_CREATING = 'creating';

    public const STATUS_OPEN = 'open';

    public const STATUS_PROCESSING = 'processing';

    public const STATUS_PAID = 'paid';

    public const STATUS_FAILED = 'failed';

    public const STATUS_EXPIRED = 'expired';

    public const STATUS_CANCELED = 'canceled';

    /** Statuses still waiting for Stripe. */
    public const PENDING_STATUSES = [self::STATUS_CREATING, self::STATUS_OPEN, self::STATUS_PROCESSING];

    protected $table = 'gem_orders';

    protected $fillable = [
        'public_id',
        'account_id',
        'pack_code',
        'gems',
        'amount_cents',
        'currency',
        'livemode',
        'status',
        'locale',
        'idempotency_key',
        'stripe_checkout_session_id',
        'stripe_payment_intent_id',
        'checkout_url',
        'checkout_expires_at',
        'checkout_lease_until',
        'terms_version',
        'paid_at',
        'delivered_at',
        'delivery_tx_id',
        'failed_at',
        'expired_at',
        'canceled_at',
        'refunded_cents',
        'dispute_lost_cents',
        'gems_reversed',
        'refunded_at',
        'dispute_id',
        'dispute_status',
        'dispute_reason',
        'disputed_at',
        'stripe_state_version',
        'stripe_checked_at',
        'last_error',
        'confirmation_email_sent_at',
    ];

    protected function casts(): array
    {
        return [
            'account_id' => 'integer',
            'gems' => 'integer',
            'amount_cents' => 'integer',
            'livemode' => 'boolean',
            'checkout_expires_at' => 'datetime',
            'checkout_lease_until' => 'datetime',
            'paid_at' => 'datetime',
            'delivered_at' => 'datetime',
            'delivery_tx_id' => 'integer',
            'failed_at' => 'datetime',
            'expired_at' => 'datetime',
            'canceled_at' => 'datetime',
            'refunded_cents' => 'integer',
            'dispute_lost_cents' => 'integer',
            'gems_reversed' => 'integer',
            'refunded_at' => 'datetime',
            'disputed_at' => 'datetime',
            'stripe_state_version' => 'integer',
            'stripe_checked_at' => 'datetime',
            'confirmation_email_sent_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'account_id', 'account_id');
    }

    public function isPending(): bool
    {
        return in_array($this->status, self::PENDING_STATUSES, true);
    }

    public function isDelivered(): bool
    {
        return $this->delivered_at !== null;
    }

    /** Still waiting for its Checkout Session (never created, or created but not saved yet). */
    public function needsCheckoutSession(): bool
    {
        return $this->status === self::STATUS_CREATING || ($this->status === self::STATUS_OPEN && $this->checkout_url === null);
    }

    /** Another request is creating the Checkout Session right now (GemCheckoutService). */
    public function checkoutLeaseActive(): bool
    {
        return $this->checkout_lease_until !== null && $this->checkout_lease_until->isFuture();
    }

    /** none, partial or full: money given back to the player (succeeded refunds only). */
    public function refundStatus(): string
    {
        if ($this->refunded_cents <= 0) {
            return 'none';
        }

        return $this->refunded_cents >= $this->amount_cents ? 'full' : 'partial';
    }

    /** @return array<string, mixed> What the player sees of the order (GET /api/gems/orders). */
    public function toPlayerArray(): array
    {
        return [
            'public_id' => (string) $this->public_id,
            'pack_code' => $this->pack_code,
            'gems' => $this->gems,
            'amount_cents' => $this->amount_cents,
            'currency' => $this->currency,
            'status' => $this->status,
            'livemode' => $this->livemode,
            'delivered' => $this->isDelivered(),
            'created_at' => $this->created_at?->toIso8601String(),
            'paid_at' => $this->paid_at?->toIso8601String(),
            'delivered_at' => $this->delivered_at?->toIso8601String(),
            'checkout_expires_at' => $this->checkout_expires_at?->toIso8601String(),
            'refund' => [
                'status' => $this->refundStatus(),
                'refunded_cents' => $this->refunded_cents,
                'gems_reversed' => $this->gems_reversed,
                'refunded_at' => $this->refunded_at?->toIso8601String(),
            ],
            'disputed' => $this->dispute_id !== null,
        ];
    }
}
