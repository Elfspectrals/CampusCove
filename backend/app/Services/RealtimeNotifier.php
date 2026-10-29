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
}
