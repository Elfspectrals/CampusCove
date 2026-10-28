<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Wallet;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * GDPR self-service: export every row tied to an account (art. 15 / 20) and erase an account (art. 17).
 *
 * Erasure anonymizes instead of hard-deleting: wallet ledger and transactions must stay consistent and
 * accounting records are kept (legal obligation), but nothing left can identify the person.
 */
class AccountPrivacyService
{
    /** Columns never exported, whatever table they are in. */
    private const SECRET_COLUMNS = ['password_hash', 'token', 'remember_token', 'access_token', 'refresh_token', 'secret'];

    /** Tables exported by hand because they hold data about other people (art. 15.4). */
    private const CUSTOM_EXPORT_TABLES = ['player_reports'];

    /** Days between the inactivity notice e-mail and the anonymization. */
    public const INACTIVITY_NOTICE_DAYS = 30;

    /** Resolved player reports are deleted after this many months (privacy policy). */
    public const REPORT_RETENTION_MONTHS = 12;

    public function __construct(
        private readonly HousingService $housing,
        private readonly AccountMailer $mailer,
    ) {}

    /** @return array<string, mixed> */
    public function export(Account $account): array
    {
        $id = (int) $account->account_id;
        $tables = [];

        // every public table with an account reference, discovered from the schema so new tables are never missed
        $columns = DB::select(<<<'SQL'
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND (column_name = 'account_id' OR column_name LIKE '%\_account\_id' OR column_name IN ('account_id_a', 'account_id_b', 'requested_by'))
ORDER BY table_name, column_name
SQL);
        $byTable = [];
        foreach ($columns as $c) {
            if (! in_array($c->table_name, self::CUSTOM_EXPORT_TABLES, true)) {
                $byTable[$c->table_name][] = $c->column_name;
            }
        }

        foreach ($byTable as $table => $cols) {
            $rows = DB::table($table)
                ->where(function ($q) use ($cols, $id) {
                    foreach ($cols as $col) {
                        $q->orWhere($col, $id);
                    }
                })
                ->get()
                ->map(fn ($row) => array_diff_key((array) $row, array_flip(self::SECRET_COLUMNS)))
                ->all();
            if ($rows !== []) {
                $tables[$table] = $rows;
            }
        }

        // reports filed by the player in full; reports about the player without who filed them or what they wrote
        $filed = DB::table('player_reports')->where('reporter_account_id', $id)->get()->all();
        $received = DB::table('player_reports')
            ->where('target_account_id', $id)
            ->get(['id', 'reason', 'status', 'decision_note', 'created_at', 'resolved_at'])
            ->all();
        if ($filed !== [] || $received !== []) {
            $tables['player_reports'] = ['filed' => $filed, 'received' => $received];
        }

        // wallets are polymorphic (owner_type / owner_id), so the column scan above does not see them
        $walletIds = DB::table('wallets')->where('owner_type', Wallet::OWNER_TYPE_ACCOUNT)->where('owner_id', $id)->pluck('wallet_id');
        if ($walletIds->isNotEmpty()) {
            $tables['wallets'] = DB::table('wallets')->whereIn('wallet_id', $walletIds)->get()->all();
            $tables['wallet_ledger'] = DB::table('wallet_ledger')->whereIn('wallet_id', $walletIds)->orderBy('entry_id')->get()->all();
        }

        return [
            'exported_at' => now()->toIso8601String(),
            'account_id' => $id,
            'note' => 'All data CampusCove stores about this account. Passwords and access tokens are never exported; reports about you do not reveal who filed them.',
            'tables' => $tables,
        ];
    }

    public function anonymize(Account $account): void
    {
        $id = (int) $account->account_id;

        DB::transaction(function () use ($account, $id) {
            $unit = $this->housing->findOccupiedUnitForAccount($id);
            if ($unit !== null) {
                $this->housing->resetExpiredUnit($unit);
            }

            $account->tokens()->delete();
            DB::table('friendships')->where('account_id_a', $id)->orWhere('account_id_b', $id)->delete();
            DB::table('account_auth_oauth')->where('account_id', $id)->delete();
            DB::table('account_roles')->where('account_id', $id)->delete();
            // free text the player wrote; the report itself stays for the moderation of the target
            DB::table('player_reports')->where('reporter_account_id', $id)->update(['details' => null]);

            $email = DB::table('account_auth_local')->where('account_id', $id)->value('email');
            if ($email !== null) {
                DB::table('password_reset_tokens')->where('email', $email)->delete();
            }
            DB::table('account_auth_local')->where('account_id', $id)->update([
                'email' => "deleted-{$id}@invalid.campuscove",
                'password_hash' => Hash::make(Str::random(64)),
                'email_verified' => false,
            ]);
            DB::table('account_handles')->where('account_id', $id)->update([
                'username' => "deleted_{$id}",
                'normalized' => "deleted_{$id}",
            ]);

            DB::table('accounts')->where('account_id', $id)->update([
                'status' => 'deleted',
                'cosmetic_colors' => null,
                'is_admin' => false,
                'referral_code' => null,
                'inactivity_warned_at' => null,
                'anonymized_at' => now(),
                'deleted_at' => now(),
            ]);
        });
    }

    /**
     * Storage limitation (GDPR art. 5.1.e): e-mails a notice to accounts that will reach `$months` months without
     * login within INACTIVITY_NOTICE_DAYS, then anonymizes those still inactive once the notice period is over.
     * Logging in clears the notice (AuthController::login). Admin accounts belong to the publisher and are skipped.
     *
     * @return array{warned: int, anonymized: int}
     */
    public function purgeInactive(int $months): array
    {
        $cutoff = now()->subMonths($months);
        $noticeCutoff = $cutoff->copy()->addDays(self::INACTIVITY_NOTICE_DAYS);
        $inactiveSince = fn ($q, $date) => $q->where('last_login_at', '<', $date)
            ->orWhere(fn ($q) => $q->whereNull('last_login_at')->where('created_at', '<', $date));
        $candidates = fn () => Account::query()->whereNull('anonymized_at')->where('is_admin', false);

        $warned = 0;
        $candidates()
            ->whereNull('inactivity_warned_at')
            ->where(fn ($q) => $inactiveSince($q, $noticeCutoff))
            ->each(function (Account $account) use (&$warned) {
                $this->mailer->send(
                    (int) $account->account_id,
                    'Ton compte va être supprimé / Your account will be deleted',
                    'Tu ne t’es pas connecté à CampusCove depuis longtemps. Sans connexion dans les '.self::INACTIVITY_NOTICE_DAYS.' jours, ton compte sera anonymisé et ses données effacées. Connecte-toi simplement pour le garder.',
                    'You have not logged in to CampusCove for a long time. Without a login within '.self::INACTIVITY_NOTICE_DAYS.' days, your account will be anonymized and its data erased. Just log in to keep it.',
                );
                $account->forceFill(['inactivity_warned_at' => now()])->save();
                $warned++;
            });

        $anonymized = 0;
        $candidates()
            ->where('inactivity_warned_at', '<=', now()->subDays(self::INACTIVITY_NOTICE_DAYS))
            ->where(fn ($q) => $inactiveSince($q, $cutoff))
            ->each(function (Account $account) use (&$anonymized) {
                $this->anonymize($account);
                $anonymized++;
            });

        return ['warned' => $warned, 'anonymized' => $anonymized];
    }

    /** Deletes player reports resolved more than REPORT_RETENTION_MONTHS ago. */
    public function purgeResolvedReports(): int
    {
        return DB::table('player_reports')
            ->whereNotNull('resolved_at')
            ->where('resolved_at', '<', now()->subMonths(self::REPORT_RETENTION_MONTHS))
            ->delete();
    }
}
