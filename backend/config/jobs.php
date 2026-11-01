<?php

/*
 * Paid jobs (docs/JOBS.md). A job pays coins for every full period a player spends at one of its stations: the
 * realtime server (socket/src/jobs.ts) owns presence and the clock, this API owns the shifts and the payments.
 * Each shift keeps a copy of the salary and the period it started with, so a change here applies to new shifts.
 *
 * - buildings: work buildings (world.manifest.json keys) whose stations belong to the job.
 * - salary_coins: coins paid per full period (never premium gems).
 * - period_seconds: length of one paid period.
 * - survival_drain_factor: hunger and thirst drop at this fraction of the normal speed during a shift.
 */
return [
    'jobs' => [
        'dev' => [
            'buildings' => ['tech_hub'],
            'salary_coins' => (int) env('JOB_DEV_SALARY_COINS', 10),
            'period_seconds' => (int) env('JOB_DEV_PERIOD_SECONDS', 60),
            'survival_drain_factor' => (float) env('JOB_DEV_SURVIVAL_FACTOR', 0.25),
        ],
    ],

    // Clock difference allowed between the realtime server and the API when checking that a period is complete.
    'clock_skew_seconds' => 2,

    // An open shift without a payment for this many periods is closed by `jobs:close-stale` (the realtime server
    // gives up on a period after 5 of them, socket/src/jobRules.ts MAX_BACKLOG_PERIODS).
    'stale_after_periods' => 6,
];
