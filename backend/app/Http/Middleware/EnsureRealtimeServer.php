<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Routes only the realtime server may call (it still sends the player's token): survival stats are computed
 * there, so a player calling the API directly must not be able to set their own health.
 */
class EnsureRealtimeServer
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = (string) config('services.realtime.secret');
        $given = (string) $request->header('X-Realtime-Secret', '');
        if ($expected === '' || ! hash_equals($expected, $given)) {
            return response()->json([
                'message' => 'Forbidden.',
                'code' => 'realtime_only',
            ], 403);
        }

        return $next($request);
    }
}
