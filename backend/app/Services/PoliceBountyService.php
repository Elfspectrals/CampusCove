<?php

namespace App\Services;

use App\Exceptions\PoliceRejectedException;
use App\Models\Account;
use App\Models\EconomyTransaction;
use App\Models\Wallet;
use Illuminate\Support\Facades\DB;

final class PoliceBountyService
{
    public const PER_STAR = 15;

    public const DAILY_CAP = 150;

    public const CRIME_WINDOW_HOURS = 24;

    public const EXCHANGE_WINDOW_DAYS = 7;

    private const REASON = 'police_bounty';

    public function __construct(
        private readonly CoinRewardService $coinRewards,
        private readonly PoliceLicenceService $licences,
    ) {}

    /** @return array{paid: int, stars: int, reason: ?string, cash: int} */
    public function pay(int $officerId, int $suspectId, int $stars, string $ref): array
    {
        if ($officerId === $suspectId) {
            throw new PoliceRejectedException('police_bounty_self', 'An officer cannot arrest themselves.');
        }
        if (! $this->licences->holds($officerId)) {
            throw new PoliceRejectedException('police_no_licence', 'You need a police licence.', 409);
        }

        return DB::transaction(function () use ($officerId, $suspectId, $stars, $ref): array {
            $cash = Wallet::lockForAccount($officerId, Wallet::CASH);
            $previous = $this->bounties($officerId)->whereRaw("meta_json->>'ref' = ?", [$ref])->first();
            if ($previous !== null) {
                return $this->result((int) $previous->meta_json['amount'], (int) $previous->meta_json['stars'], null, $cash);
            }
            $refusal = $this->refusal($officerId, $suspectId);
            if ($refusal !== null) {
                return $this->result(0, 0, $refusal, $cash);
            }
            $paidStars = $this->eligibleStars($officerId, $suspectId, $stars);
            if ($paidStars === 0) {
                return $this->result(0, 0, 'no_crime_stars', $cash);
            }
            $owed = $paidStars * self::PER_STAR;
            $left = max(0, self::DAILY_CAP - $this->paidInLastDay($officerId));
            $paid = min($owed, $left);
            if ($paid > 0) {
                $this->coinRewards->creditCash($officerId, self::REASON, $paid, [
                    'stars' => $paidStars,
                    'suspect_account_id' => $suspectId,
                    'ref' => $ref,
                ]);
            }

            return $this->result($paid, $paidStars, $paid < $owed ? 'daily_cap' : null, $cash);
        });
    }

    private function refusal(int $officerId, int $suspectId): ?string
    {
        $suspectTooNew = Account::query()->whereKey($suspectId)
            ->where('created_at', '>', now()->subHours(TradeService::MIN_GIVER_AGE_HOURS))
            ->exists();

        return match (true) {
            $suspectTooNew => 'suspect_too_new',
            $this->areFriends($officerId, $suspectId) => 'friends',
            $this->exchangedRecently($officerId, $suspectId) => 'recent_exchange',
            $this->bounties($officerId)->where('committed_at', '>=', now()->subDay())->where('meta_json->suspect_account_id', (string) $suspectId)->exists() => 'suspect_already_paid',
            default => null,
        };
    }

    private function eligibleStars(int $officerId, int $suspectId, int $stars): int
    {
        $records = DB::table('crime_records')
            ->where('account_id', $suspectId)
            ->where('created_at', '>=', now()->subHours(self::CRIME_WINDOW_HOURS))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get(['stars', 'victim_account_id']);
        $unattributed = $stars;
        $eligible = 0;
        foreach ($records as $record) {
            if ($unattributed === 0) {
                break;
            }
            $taken = min($unattributed, (int) $record->stars);
            $unattributed -= $taken;
            if (! $this->victimIsOfficerSide($officerId, $record->victim_account_id)) {
                $eligible += $taken;
            }
        }

        return $eligible;
    }

    private function victimIsOfficerSide(int $officerId, ?int $victimId): bool
    {
        return $victimId !== null && ($victimId === $officerId || $this->areFriends($officerId, $victimId));
    }

    private function areFriends(int $a, int $b): bool
    {
        return DB::table('friendships')
            ->where('account_id_a', min($a, $b))
            ->where('account_id_b', max($a, $b))
            ->where('status', 'accepted')
            ->exists();
    }

    private function exchangedRecently(int $a, int $b): bool
    {
        $since = now()->subDays(self::EXCHANGE_WINDOW_DAYS);
        $traded = EconomyTransaction::query()
            ->where('type', 'trade')
            ->where('created_at', '>=', $since)
            ->whereRaw("meta_json->'accounts' @> ?::jsonb", [json_encode([$a, $b])])
            ->exists();
        if ($traded) {
            return true;
        }

        return EconomyTransaction::query()
            ->where('type', 'bank_transfer')
            ->where('created_at', '>=', $since)
            ->whereExists(fn ($q) => $this->ledgerOf($q, $a))
            ->whereExists(fn ($q) => $this->ledgerOf($q, $b))
            ->exists();
    }

    private function ledgerOf($query, int $accountId): void
    {
        $query->selectRaw('1')
            ->from('wallet_ledger')
            ->join('wallets', 'wallets.wallet_id', '=', 'wallet_ledger.wallet_id')
            ->whereColumn('wallet_ledger.tx_id', 'transactions.tx_id')
            ->where('wallets.owner_type', Wallet::OWNER_TYPE_ACCOUNT)
            ->where('wallets.owner_id', $accountId);
    }

    private function paidInLastDay(int $officerId): int
    {
        return (int) $this->bounties($officerId)
            ->where('committed_at', '>=', now()->subDay())
            ->sum(DB::raw("(meta_json->>'amount')::int"));
    }

    private function bounties(int $officerId)
    {
        return EconomyTransaction::query()
            ->where('type', 'reward')
            ->where('created_by_account_id', $officerId)
            ->where('meta_json->source', self::REASON);
    }

    /** @return array{paid: int, stars: int, reason: ?string, cash: int} */
    private function result(int $paid, int $stars, ?string $reason, Wallet $cash): array
    {
        return ['paid' => $paid, 'stars' => $stars, 'reason' => $reason, 'cash' => $cash->balance()];
    }
}
