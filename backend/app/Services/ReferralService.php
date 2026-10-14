<?php

namespace App\Services;

use App\Models\Account;
use App\Models\AccountHandle;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Referral: a new player signs up with a friend's code. Both are rewarded once the new player
 * proves to be a real, active player (no IP stored): the account is a few days old, has made friends
 * with other players than the referrer, and has bought something with coins.
 */
final class ReferralService
{
    public const REFERRER_REWARD = 500;

    public const REFEREE_REWARD = 200;

    public const MIN_ACCOUNT_AGE_HOURS = 72;

    /** Accepted friends other than the referrer: an alt account made to farm the bonus has none. */
    public const MIN_OTHER_FRIENDS = 2;

    public const MAX_REWARDED_PER_MONTH = 10;

    public function __construct(
        private readonly CoinRewardService $coinRewards,
    ) {}

    public function codeFor(int $accountId): string
    {
        $existing = Account::query()->whereKey($accountId)->value('referral_code');
        if (is_string($existing) && $existing !== '') {
            return $existing;
        }

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $code = Str::upper(Str::random(8));
            try {
                $updated = DB::table('accounts')
                    ->where('account_id', $accountId)
                    ->whereNull('referral_code')
                    ->update(['referral_code' => $code]);
            } catch (UniqueConstraintViolationException) {
                continue;
            }
            if ($updated === 1) {
                return $code;
            }

            // a concurrent request set it first
            return (string) Account::query()->whereKey($accountId)->value('referral_code');
        }

        throw new \RuntimeException('Could not generate a unique referral code.');
    }

    /**
     * Links a freshly registered account to the owner of $code. Unknown codes are ignored.
     */
    public function attachReferrer(int $refereeId, ?string $code): void
    {
        $code = Str::upper(trim((string) $code));
        if ($code === '') {
            return;
        }
        $referrerId = Account::query()->where('referral_code', $code)->value('account_id');
        if ($referrerId === null || (int) $referrerId === $refereeId) {
            return;
        }

        DB::table('referrals')->insertOrIgnore([
            'referee_account_id' => $refereeId,
            'referrer_account_id' => (int) $referrerId,
            'created_at' => now(),
        ]);
    }

    /**
     * Pays both sides once the referee meets every condition. Safe to call repeatedly.
     */
    public function checkQualification(int $refereeId): bool
    {
        return DB::transaction(function () use ($refereeId): bool {
            $referral = DB::table('referrals')
                ->where('referee_account_id', $refereeId)
                ->whereNull('qualified_at')
                ->lockForUpdate()
                ->first();
            if ($referral === null) {
                return false;
            }

            $referrerId = (int) $referral->referrer_account_id;
            if (! $this->progressFor($refereeId, $referrerId)['qualified']) {
                return false;
            }

            $rewardedThisMonth = DB::table('referrals')
                ->where('referrer_account_id', $referrerId)
                ->where('referrer_rewarded', true)
                ->where('qualified_at', '>=', now()->startOfMonth())
                ->count();
            $payReferrer = $rewardedThisMonth < self::MAX_REWARDED_PER_MONTH && $this->isActive($referrerId);

            DB::table('referrals')->where('referee_account_id', $refereeId)->update([
                'qualified_at' => now(),
                'referrer_rewarded' => $payReferrer,
            ]);

            $this->coinRewards->credit($refereeId, 'referral_referee', self::REFEREE_REWARD, ['referrer_account_id' => $referrerId]);
            if ($payReferrer) {
                $this->coinRewards->credit($referrerId, 'referral_referrer', self::REFERRER_REWARD, ['referee_account_id' => $refereeId]);
            }

            return true;
        });
    }

    /**
     * @return array{code: string, rewards: array{referrer: int, referee: int}, requirements: array<string, int>, referees: list<array<string, mixed>>}
     */
    public function summaryFor(int $accountId): array
    {
        $referees = DB::table('referrals')
            ->where('referrer_account_id', $accountId)
            ->orderByDesc('created_at')
            ->get()
            ->map(function (object $row) use ($accountId): array {
                $refereeId = (int) $row->referee_account_id;
                $handle = AccountHandle::query()->where('account_id', $refereeId)->first();

                return [
                    'account_id' => $refereeId,
                    'display_name' => $handle?->display_name ?? '',
                    'qualified' => $row->qualified_at !== null,
                    'rewarded' => (bool) $row->referrer_rewarded,
                    'progress' => $row->qualified_at !== null ? null : $this->progressFor($refereeId, $accountId),
                ];
            })
            ->values()
            ->all();

        return [
            'code' => $this->codeFor($accountId),
            'rewards' => ['referrer' => self::REFERRER_REWARD, 'referee' => self::REFEREE_REWARD],
            'requirements' => [
                'min_account_age_hours' => self::MIN_ACCOUNT_AGE_HOURS,
                'min_other_friends' => self::MIN_OTHER_FRIENDS,
                'min_coin_purchases' => 1,
            ],
            'referees' => $referees,
        ];
    }

    /**
     * @return array{account_age_ok: bool, other_friends: int, has_coin_purchase: bool, qualified: bool}
     */
    private function progressFor(int $refereeId, int $referrerId): array
    {
        $createdAt = Account::query()->whereKey($refereeId)->value('created_at');
        $ageOk = $createdAt !== null
            && Carbon::parse($createdAt)->lte(now()->subHours(self::MIN_ACCOUNT_AGE_HOURS));

        $otherFriends = DB::table('friendships')
            ->where('status', 'accepted')
            ->where(function ($q) use ($refereeId) {
                $q->where('account_id_a', $refereeId)->orWhere('account_id_b', $refereeId);
            })
            ->where('account_id_a', '<>', $referrerId)
            ->where('account_id_b', '<>', $referrerId)
            ->count();

        $hasCoinPurchase = DB::table('account_shop_purchases')
            ->where('account_id', $refereeId)
            ->where('currency', 'coins')
            ->exists();

        return [
            'account_age_ok' => $ageOk,
            'other_friends' => $otherFriends,
            'has_coin_purchase' => $hasCoinPurchase,
            'qualified' => $ageOk
                && $otherFriends >= self::MIN_OTHER_FRIENDS
                && $hasCoinPurchase
                && $this->isActive($refereeId),
        ];
    }

    private function isActive(int $accountId): bool
    {
        $account = Account::query()->whereKey($accountId)->first();

        return $account !== null
            && $account->status === 'active'
            && $account->banned_at === null
            && ($account->suspended_until === null || $account->suspended_until->isPast());
    }
}
