<?php

namespace App\Services;

use App\Models\SecurityEvent;
use App\Support\ClientOrigin;
use Illuminate\Http\Request;

class SecurityEventLogger
{
    public function __construct(private readonly IpBanService $bans) {}

    public function record(Request $request, string $type, ?string $detail = null): SecurityEvent
    {
        $origin = ClientOrigin::fromRequest($request);

        $event = SecurityEvent::create([
            'ip' => $origin->ip,
            'country' => $origin->country,
            'type' => $type,
            'method' => $request->method(),
            'path' => $request->getRequestUri(),
            'user_agent' => $request->userAgent(),
            'detail' => $detail,
        ]);
        $this->bans->banIfOverThreshold($origin->ip);
        dispatch(function () use ($origin) {
            app(AbuseIpdbService::class)->refreshReputation($origin->ip);
            app(IpBanService::class)->banIfOverThreshold($origin->ip);
        })->afterResponse();

        return $event;
    }
}
