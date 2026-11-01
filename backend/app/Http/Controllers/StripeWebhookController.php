<?php

namespace App\Http\Controllers;

use App\Services\StripeWebhookService;
use App\Support\GemCheckoutConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Stripe\Exception\SignatureVerificationException;
use Stripe\Exception\UnexpectedValueException;
use Stripe\Webhook;
use Throwable;

/**
 * POST /api/stripe/webhook, called by Stripe (test mode only), outside any player session. The signature is
 * checked on the raw body before anything else; 5xx answers make Stripe retry.
 */
class StripeWebhookController extends Controller
{
    public function __invoke(Request $request, GemCheckoutConfig $config, StripeWebhookService $webhooks): JsonResponse
    {
        if ($config->hasLiveKey()) {
            Log::error('A Stripe production key is configured: refused, CampusCove only runs Stripe in test mode.');

            return response()->json(['message' => 'Stripe production keys are refused: test mode only.', 'code' => 'live_key_refused'], 503);
        }
        if (! $config->canTalkToStripe()) {
            return response()->json(['message' => 'Stripe is not configured.', 'code' => 'stripe_not_configured'], 503);
        }

        try {
            $event = Webhook::constructEvent(
                $request->getContent(),
                (string) $request->header('Stripe-Signature', ''),
                $config->webhookSecret(),
            );
        } catch (SignatureVerificationException|UnexpectedValueException) {
            return response()->json(['message' => 'Invalid signature.', 'code' => 'invalid_signature'], 400);
        }

        try {
            $outcome = $webhooks->handle($event);
        } catch (Throwable $e) {
            Log::error('Stripe event not processed, Stripe will retry', ['event' => $event->id, 'type' => $event->type, 'error' => $e->getMessage()]);

            return response()->json(['message' => 'Event not processed.', 'code' => 'webhook_retry'], 500);
        }

        return response()->json(['received' => true, 'outcome' => $outcome]);
    }
}
