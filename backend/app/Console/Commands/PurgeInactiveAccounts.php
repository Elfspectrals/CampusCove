<?php

namespace App\Console\Commands;

use App\Services\AccountPrivacyService;
use Illuminate\Console\Command;

/**
 * Scheduled daily (bootstrap/app.php). Retention periods stated in the privacy policy (front/src/seo/site.ts):
 * inactive accounts are warned then anonymized, resolved player reports are deleted after a year.
 */
class PurgeInactiveAccounts extends Command
{
    protected $signature = 'accounts:purge-inactive {--months=36 : Months without login before anonymization}';

    protected $description = 'Warn then anonymize inactive accounts and delete old resolved reports (GDPR storage limitation)';

    public function handle(AccountPrivacyService $privacy): int
    {
        // the notice e-mail is a promise of the privacy policy: never erase accounts if it cannot really be sent
        if (app()->isProduction() && config('mail.default') === 'log') {
            $this->error('MAIL_MAILER=log in production: inactivity notices would not be sent, purge skipped.');

            return self::FAILURE;
        }

        $result = $privacy->purgeInactive((int) $this->option('months'));
        $reports = $privacy->purgeResolvedReports();
        $this->info("Warned {$result['warned']}, anonymized {$result['anonymized']} inactive account(s); deleted {$reports} old report(s).");

        return self::SUCCESS;
    }
}
