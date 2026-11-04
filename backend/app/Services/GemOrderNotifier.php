<?php

namespace App\Services;

use App\Models\GemOrder;
use Illuminate\Support\Facades\Log;

/**
 * E-mails about a demo gem order (Stripe test mode, no money charged), sent after the delivery is committed: a
 * failed send is logged and never undoes the credit. A confirmation of what the game did, not a receipt nor an
 * invoice: no real sale ever takes place.
 */
class GemOrderNotifier
{
    private const DEMO_FR = 'Paiement de démonstration — aucun argent débité.';

    private const DEMO_EN = 'Demo payment — no money was charged.';

    public function __construct(private readonly AccountMailer $mailer) {}

    public function sendPurchaseConfirmation(int $orderId): void
    {
        // claim first, so two concurrent deliveries of the same event cannot send it twice
        $claimed = GemOrder::query()->whereKey($orderId)->whereNull('confirmation_email_sent_at')->update(['confirmation_email_sent_at' => now()]);
        $order = GemOrder::query()->find($orderId);
        if ($claimed !== 1 || $order === null || $order->account_id === null) {
            return;
        }

        $amount = self::formatAmount($order->amount_cents, $order->currency);
        $date = $order->paid_at?->format('d/m/Y H:i') ?? now()->format('d/m/Y H:i');
        $sent = $this->mailer->send(
            (int) $order->account_id,
            'Gems ajoutés (démonstration) / Gems added (demo)',
            self::DEMO_FR."\n\n{$order->gems} gems violets ont été ajoutés à ton compte.\n\nCommande : {$order->public_id}\nDate : {$date} (UTC)\nMontant simulé : {$amount} (carte de test Stripe)\n\nCampusCove est un projet scolaire : aucune vente réelle n’est ouverte, ce message n’est ni un reçu ni une facture.",
            self::DEMO_EN."\n\n{$order->gems} purple gems were added to your account.\n\nOrder: {$order->public_id}\nDate: {$date} (UTC)\nSimulated amount: {$amount} (Stripe test card)\n\nCampusCove is a school project: no real sale is open, this message is neither a receipt nor an invoice.",
        );
        if (! $sent) {
            GemOrder::query()->whereKey($orderId)->update(['confirmation_email_sent_at' => null]);
            Log::warning('Gem order confirmation e-mail not sent', ['order' => (string) $order->public_id]);
        }
    }

    public function sendReversalNotice(int $orderId): void
    {
        $order = GemOrder::query()->find($orderId);
        if ($order === null || $order->account_id === null) {
            return;
        }

        $refunded = self::formatAmount($order->refunded_cents, $order->currency);
        $this->mailer->send(
            (int) $order->account_id,
            'Remboursement simulé (démonstration) / Simulated refund (demo)',
            self::DEMO_FR."\n\nTa commande {$order->public_id} a été remboursée en mode test ({$refunded} simulés). {$order->gems_reversed} gems ont été retirés de ton solde. Si tu les avais déjà dépensés, ton solde de gems peut être négatif : les achats en gems reprennent dès qu’il redevient suffisant. Tes skins restent à toi.",
            self::DEMO_EN."\n\nYour order {$order->public_id} was refunded in test mode ({$refunded} simulated). {$order->gems_reversed} gems were taken back from your balance. If you had already spent them, your gem balance can be negative: gem purchases resume once it covers them again. Your skins stay yours.",
        );
    }

    private static function formatAmount(int $cents, string $currency): string
    {
        return number_format($cents / 100, 2, ',', ' ').' '.strtoupper($currency);
    }
}
