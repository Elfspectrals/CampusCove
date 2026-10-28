<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Plain-text service e-mails to a player (inactivity notice, moderation decisions), in French and English
 * since the account has no stored language. Uses the mailer configured by MAIL_MAILER (`log` by default).
 */
class AccountMailer
{
    public function send(int $accountId, string $subject, string $bodyFr, string $bodyEn): bool
    {
        $email = DB::table('account_auth_local')->where('account_id', $accountId)->value('email');
        if (! is_string($email) || str_ends_with($email, '@invalid.campuscove')) {
            return false;
        }

        try {
            Mail::raw("{$bodyFr}\n\n—\n\n{$bodyEn}\n", fn ($m) => $m->to($email)->subject("CampusCove — {$subject}"));
        } catch (\Throwable $e) {
            Log::warning('Account e-mail not sent', ['account_id' => $accountId, 'error' => $e->getMessage()]);

            return false;
        }

        return true;
    }
}
