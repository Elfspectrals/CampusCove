<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Tells the Colyseus server (socket/) that state it caches changed outside a player's action, so it reloads it
 * now instead of at its next poll. Best effort: the socket still polls, so a failure only delays the update.
 */
final class RealtimeNotifier
{
    public function housingChanged(): void
    {
        $url = (string) config('services.realtime.url');
        $secret = (string) config('services.realtime.secret');
        if ($url === '' || $secret === '') {
            return;
        }
        try {
            Http::timeout(3)
                ->withHeaders(['X-Realtime-Secret' => $secret])
                ->post(rtrim($url, '/').'/internal/housing-changed')
                ->throw();
        } catch (Throwable $e) {
            Log::warning('realtime housing-changed notify failed: '.$e->getMessage());
        }
    }

    public function taskTierReached(int $accountId, string $task, int $tier, int $threshold): void
    {
        $url = (string) config('services.realtime.url');
        $secret = (string) config('services.realtime.secret');
        if ($url === '' || $secret === '') {
            return;
        }
        try {
            Http::timeout(3)
                ->withHeaders(['X-Realtime-Secret' => $secret])
                ->post(rtrim($url, '/').'/internal/task-tier-reached', [
                    'accountId' => $accountId,
                    'task' => $task,
                    'tier' => $tier,
                    'threshold' => $threshold,
                ])
                ->throw();
        } catch (Throwable $e) {
            Log::warning('realtime task-tier-reached notify failed: '.$e->getMessage());
        }
    }

    public function tutorialChanged(int $accountId, string $status, ?string $step): void
    {
        $url = (string) config('services.realtime.url');
        $secret = (string) config('services.realtime.secret');
        if ($url === '' || $secret === '') {
            return;
        }
        try {
            Http::timeout(3)
                ->withHeaders(['X-Realtime-Secret' => $secret])
                ->post(rtrim($url, '/').'/internal/tutorial-changed', [
                    'accountId' => $accountId,
                    'status' => $status,
                    'step' => $step,
                ])
                ->throw();
        } catch (Throwable $e) {
            Log::warning('realtime tutorial-changed notify failed: '.$e->getMessage());
        }
    }

    public function ipBanned(string $ip): void
    {
        $url = (string) config('services.realtime.url');
        $secret = (string) config('services.realtime.secret');
        if ($url === '' || $secret === '') {
            return;
        }
        try {
            Http::timeout(3)
                ->withHeaders(['X-Realtime-Secret' => $secret])
                ->post(rtrim($url, '/').'/internal/ip-banned', ['ip' => $ip])
                ->throw();
        } catch (Throwable $e) {
            Log::warning('realtime ip-banned notify failed: '.$e->getMessage());
        }
    }
}
