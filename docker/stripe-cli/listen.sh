#!/bin/sh
# Entrypoint of the optional `stripe-cli` Compose service (profile `stripe`, docs/STRIPE.md): the official Stripe
# CLI relaying test-mode webhook events to the backend. School project: anything but a Stripe test key is refused.
#   (no argument)    stripe listen --events <backend/resources/stripe-webhook-events.txt> --forward-to $STRIPE_FORWARD_TO
#   --print-secret   prints the whsec_ signing secret of this relay and exits
set -eu

case "${STRIPE_API_KEY:-}" in
  sk_test_* | rk_test_*) ;;
  sk_live_* | rk_live_*)
    echo "stripe-cli: production key refused. CampusCove only uses Stripe test mode (sk_test_ / rk_test_ key in STRIPE_SECRET_KEY)." >&2
    exit 64
    ;;
  '')
    echo "stripe-cli: STRIPE_SECRET_KEY is empty. Put a Stripe test key (sk_test_...) in the .env at the root of the repository." >&2
    exit 64
    ;;
  *)
    echo "stripe-cli: STRIPE_SECRET_KEY is not a Stripe test key (sk_test_ / rk_test_)." >&2
    exit 64
    ;;
esac

if [ "${1:-}" = "--print-secret" ]; then
  exec stripe listen --print-secret --skip-update
fi

# one event per line, comments and blank lines skipped, CRLF tolerated (file edited on Windows)
events=$(tr -d '\r' < /relay/events.txt | sed -e 's/#.*//' -e 's/[[:space:]]//g' | grep -v '^$' | tr '\n' ',' | sed 's/,$//')
if [ -z "$events" ]; then
  echo "stripe-cli: no event in /relay/events.txt (backend/resources/stripe-webhook-events.txt)." >&2
  exit 65
fi

echo "stripe-cli: forwarding ${events} to ${STRIPE_FORWARD_TO}"
exec stripe listen --skip-update --events "$events" --forward-to "$STRIPE_FORWARD_TO"
