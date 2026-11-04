<?php

namespace App\Http\Middleware;

use App\Services\IpBanService;
use App\Support\ClientOrigin;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class BlockBannedIps
{
    public function __construct(private readonly IpBanService $bans) {}

    public function handle(Request $request, Closure $next): Response
    {
        $origin = ClientOrigin::fromRequest($request);
        if (! $origin->isRealtimeServer && $this->bans->isBanned($origin->ip)) {
            return response()->json([
                'message' => 'Forbidden.',
                'code' => 'ip_banned',
            ], 403);
        }

        return $next($request);
    }
}
