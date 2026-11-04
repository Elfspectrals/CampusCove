<?php

namespace App\Http\Middleware;

use App\Support\ClientOrigin;
use Closure;
use Illuminate\Http\Request;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

class RequireCloudflareOrigin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! config('services.cloudflare.enforce_origin')) {
            return $next($request);
        }

        if ((string) config('services.cloudflare.origin_secret') === '') {
            throw new RuntimeException('CLOUDFLARE_ENFORCE_ORIGIN is on but CLOUDFLARE_ORIGIN_SECRET is empty.');
        }

        if (ClientOrigin::cameFromRealtimeServer($request) || ClientOrigin::cameThroughCloudflare($request)) {
            return $next($request);
        }

        return response()->json([
            'message' => 'Forbidden.',
            'code' => 'direct_origin',
        ], 403);
    }
}
