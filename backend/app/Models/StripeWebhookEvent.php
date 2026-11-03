<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A Stripe event the webhook handled or is retrying: id, type and outcome only, never the payload. */
class StripeWebhookEvent extends Model
{
    protected $table = 'stripe_webhook_events';

    public $timestamps = false;

    protected $fillable = [
        'event_id',
        'type',
        'livemode',
        'gem_order_id',
        'attempts',
        'last_error',
        'received_at',
        'processed_at',
    ];

    protected function casts(): array
    {
        return [
            'livemode' => 'boolean',
            'gem_order_id' => 'integer',
            'attempts' => 'integer',
            'received_at' => 'datetime',
            'processed_at' => 'datetime',
        ];
    }
}
