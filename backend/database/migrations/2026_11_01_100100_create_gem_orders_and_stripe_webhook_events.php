<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Gem shop orders paid through Stripe Checkout in test mode (demo payments, no real money), and the Stripe
 * webhook events already handled.
 *
 * gem_orders keeps a snapshot of the pack (gems, amount, currency) so the history survives catalogue changes.
 * Payment (status, paid_at) and delivery (delivered_at + delivery_tx_id, written in the same transaction as the
 * premium ledger entry) are separate columns; ck_gem_orders_paid_delivered forbids a paid order without delivery.
 * No card data, no IP address and no raw Stripe payload are stored.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS gem_orders (
  id                            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id                     UUID NOT NULL UNIQUE,
  account_id                    BIGINT NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  pack_code                     VARCHAR(32) NOT NULL,
  gems                          INTEGER NOT NULL,
  amount_cents                  INTEGER NOT NULL,
  currency                      CHAR(3) NOT NULL,
  livemode                      BOOLEAN NOT NULL,
  status                        VARCHAR(20) NOT NULL DEFAULT 'creating',
  locale                        VARCHAR(5) NOT NULL DEFAULT 'en',
  idempotency_key               VARCHAR(80) NOT NULL UNIQUE,
  stripe_checkout_session_id    VARCHAR(255) NULL UNIQUE,
  stripe_payment_intent_id      VARCHAR(255) NULL UNIQUE,
  checkout_url                  TEXT NULL,
  checkout_expires_at           TIMESTAMPTZ NOT NULL,
  terms_version                 VARCHAR(20) NOT NULL,
  paid_at                       TIMESTAMPTZ NULL,
  delivered_at                  TIMESTAMPTZ NULL,
  delivery_tx_id                BIGINT NULL UNIQUE REFERENCES transactions(tx_id) ON DELETE RESTRICT,
  failed_at                     TIMESTAMPTZ NULL,
  expired_at                    TIMESTAMPTZ NULL,
  canceled_at                   TIMESTAMPTZ NULL,
  refunded_cents                INTEGER NOT NULL DEFAULT 0,
  dispute_lost_cents            INTEGER NOT NULL DEFAULT 0,
  gems_reversed                 INTEGER NOT NULL DEFAULT 0,
  refunded_at                   TIMESTAMPTZ NULL,
  dispute_id                    VARCHAR(255) NULL,
  dispute_status                VARCHAR(40) NULL,
  dispute_reason                VARCHAR(60) NULL,
  disputed_at                   TIMESTAMPTZ NULL,
  stripe_state_version          BIGINT NOT NULL DEFAULT 0,
  stripe_checked_at             TIMESTAMPTZ NULL,
  last_error                    VARCHAR(60) NULL,
  confirmation_email_sent_at    TIMESTAMPTZ NULL,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_gem_orders_status CHECK (status IN ('creating', 'open', 'processing', 'paid', 'failed', 'expired', 'canceled')),
  -- school project: Stripe test mode only, a production payment can never be stored
  CONSTRAINT ck_gem_orders_test_only CHECK (livemode = false),
  CONSTRAINT ck_gem_orders_amounts CHECK (gems > 0 AND amount_cents > 0 AND currency = lower(currency)),
  CONSTRAINT ck_gem_orders_refund CHECK (refunded_cents >= 0 AND refunded_cents <= amount_cents AND dispute_lost_cents >= 0 AND dispute_lost_cents <= amount_cents),
  CONSTRAINT ck_gem_orders_reversed CHECK (gems_reversed >= 0 AND gems_reversed <= gems AND (gems_reversed = 0 OR delivered_at IS NOT NULL)),
  CONSTRAINT ck_gem_orders_delivery CHECK ((delivered_at IS NULL) = (delivery_tx_id IS NULL)),
  CONSTRAINT ck_gem_orders_paid_delivered CHECK (status <> 'paid' OR (delivered_at IS NOT NULL AND paid_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ix_gem_orders_account ON gem_orders(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_gem_orders_pending ON gem_orders(status, created_at) WHERE status IN ('creating', 'open', 'processing');

-- Second guard against a double credit: one premium_purchase transaction per order, whatever the code path.
CREATE UNIQUE INDEX IF NOT EXISTS ux_transactions_gem_order_delivery
  ON transactions ((meta_json->>'gem_order')) WHERE type = 'premium_purchase';

-- Only id, type and outcome of each event: Stripe keeps the payload, refetched when needed.
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id      VARCHAR(255) NOT NULL UNIQUE,
  type          VARCHAR(100) NOT NULL,
  livemode      BOOLEAN NOT NULL,
  gem_order_id  BIGINT NULL REFERENCES gem_orders(id) ON DELETE SET NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    VARCHAR(255) NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS ix_stripe_webhook_events_unprocessed ON stripe_webhook_events(received_at) WHERE processed_at IS NULL;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP TABLE IF EXISTS stripe_webhook_events;
DROP INDEX IF EXISTS ux_transactions_gem_order_delivery;
DROP TABLE IF EXISTS gem_orders;
SQL);
    }
};
