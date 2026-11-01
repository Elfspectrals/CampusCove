<?php

namespace App\Services;

use App\Exceptions\JobRejectedException;
use App\Models\Wallet;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/**
 * Paid jobs (docs/JOBS.md, config/jobs.php). The realtime server decides who sits at which station and when a
 * period is complete; this service keeps the shifts and pays each period at most once:
 * - one open shift per account (partial unique index),
 * - one payment per (shift, period) (unique constraint), checked under a lock on the shift row,
 * - a period is only payable once its end has passed, and never after the shift ended.
 * The coins go through CoinRewardService (wallet_ledger reason job_salary_<job>).
 */
final class JobService
{
    public function __construct(private readonly CoinRewardService $coinRewards)
    {
    }

    /** @return array{buildings: list<string>, salary_coins: int, period_seconds: int, survival_drain_factor: float} */
    public static function rules(string $job): array
    {
        $rules = config("jobs.jobs.$job");
        if (! is_array($rules)) {
            throw new JobRejectedException('unknown_job', 'There is no such job.', 404);
        }

        return $rules;
    }

    /**
     * Opens a shift. An open shift the account left behind (realtime server restart, lost end call) is closed
     * first, at its last activity, so none of its later periods can be paid.
     *
     * @return array{shift_id: int, job: string, building: string, station: string, salary_coins: int, period_seconds: int, survival_drain_factor: float}
     */
    public function start(int $accountId, string $job, string $building, string $station): array
    {
        $rules = self::rules($job);
        if (! in_array($building, $rules['buildings'], true)) {
            throw new JobRejectedException('wrong_building', 'This station does not belong to that job.');
        }
        $salary = max(0, (int) $rules['salary_coins']);
        $period = max(1, (int) $rules['period_seconds']);

        try {
            $shiftId = DB::transaction(function () use ($accountId, $job, $building, $station, $salary, $period): int {
                $this->closeOpenShifts($accountId, 'superseded');

                return (int) DB::table('job_shifts')->insertGetId([
                    'account_id' => $accountId,
                    'job' => $job,
                    'building_key' => $building,
                    'station_id' => $station,
                    'salary_coins' => $salary,
                    'period_seconds' => $period,
                ], 'shift_id');
            });
        } catch (UniqueConstraintViolationException) {
            // another start of the same account committed first
            throw new JobRejectedException('already_working', 'You already have a job in progress.', 409);
        }

        return [
            'shift_id' => $shiftId,
            'job' => $job,
            'building' => $building,
            'station' => $station,
            'salary_coins' => $salary,
            'period_seconds' => $period,
            'survival_drain_factor' => (float) $rules['survival_drain_factor'],
        ];
    }

    /**
     * Ends a shift now (idempotent). Periods completed before the end stay payable.
     *
     * @return array{shift_id: int, ended: bool}
     */
    public function end(int $accountId, int $shiftId, string $reason): array
    {
        $this->ownedShift($accountId, $shiftId);
        $ended = DB::table('job_shifts')
            ->where('shift_id', $shiftId)
            ->whereNull('ended_at')
            ->update(['ended_at' => DB::raw('now()'), 'end_reason' => $reason]);

        return ['shift_id' => $shiftId, 'ended' => $ended > 0];
    }

    /**
     * Pays one period of a shift. Asking again for a paid period (a retry after a lost answer, a duplicate) returns
     * the first payment with already_paid = true and credits nothing.
     *
     * @return array{shift_id: int, period: int, coins: int, already_paid: bool, balance_after: int}
     */
    public function paySalary(int $accountId, int $shiftId, int $period): array
    {
        return DB::transaction(function () use ($accountId, $shiftId, $period): array {
            // serializes every payment of this shift: the check below and the insert cannot interleave
            $shift = DB::table('job_shifts')
                ->where('shift_id', $shiftId)
                ->where('account_id', $accountId)
                ->lockForUpdate()
                ->first();
            if ($shift === null) {
                throw new JobRejectedException('shift_not_found', 'This shift does not exist.', 404);
            }

            $paid = DB::table('job_salary_payments')->where('shift_id', $shiftId)->where('period', $period)->first();
            if ($paid !== null) {
                return $this->paymentResult($accountId, $shiftId, $period, (int) $paid->coins, true);
            }

            $complete = (bool) DB::selectOne(
                'SELECT started_at + make_interval(secs => ?) <= COALESCE(ended_at, now()) + make_interval(secs => ?) AS complete
                 FROM job_shifts WHERE shift_id = ?',
                [(int) $shift->period_seconds * $period, (int) config('jobs.clock_skew_seconds', 2), $shiftId]
            )->complete;
            if (! $complete) {
                throw $shift->ended_at !== null
                    ? new JobRejectedException('shift_ended', 'This shift is over.', 409)
                    : new JobRejectedException('period_not_complete', 'This period is not over yet.', 409);
            }

            $coins = (int) $shift->salary_coins;
            $txId = null;
            if ($coins > 0) {
                $txId = $this->coinRewards->credit($accountId, 'job_salary_'.$shift->job, $coins, [
                    'job' => $shift->job,
                    'shift_id' => $shiftId,
                    'period' => $period,
                    'building' => $shift->building_key,
                    'station' => $shift->station_id,
                ]);
            }
            DB::table('job_salary_payments')->insert([
                'shift_id' => $shiftId,
                'period' => $period,
                'coins' => $coins,
                'tx_id' => $txId,
            ]);
            DB::table('job_shifts')->where('shift_id', $shiftId)->update(['last_activity_at' => DB::raw('now()')]);

            return $this->paymentResult($accountId, $shiftId, $period, $coins, false);
        });
    }

    /** Closes the open shifts nobody paid for `stale_after_periods` periods (realtime server gone). Returns how many. */
    public function closeStaleShifts(): int
    {
        return DB::update(
            "UPDATE job_shifts SET ended_at = last_activity_at, end_reason = 'stale'
             WHERE ended_at IS NULL AND last_activity_at + make_interval(secs => period_seconds * ?) < now()",
            [(int) config('jobs.stale_after_periods', 6)]
        );
    }

    private function closeOpenShifts(int $accountId, string $reason): void
    {
        DB::table('job_shifts')
            ->where('account_id', $accountId)
            ->whereNull('ended_at')
            ->update(['ended_at' => DB::raw('last_activity_at'), 'end_reason' => $reason]);
    }

    private function ownedShift(int $accountId, int $shiftId): object
    {
        return DB::table('job_shifts')->where('shift_id', $shiftId)->where('account_id', $accountId)->first()
            ?? throw new JobRejectedException('shift_not_found', 'This shift does not exist.', 404);
    }

    /** @return array{shift_id: int, period: int, coins: int, already_paid: bool, balance_after: int} */
    private function paymentResult(int $accountId, int $shiftId, int $period, int $coins, bool $alreadyPaid): array
    {
        return [
            'shift_id' => $shiftId,
            'period' => $period,
            'coins' => $coins,
            'already_paid' => $alreadyPaid,
            'balance_after' => Wallet::lockForAccount($accountId, 'coins')->balance(),
        ];
    }
}
