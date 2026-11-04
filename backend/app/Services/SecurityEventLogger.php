<?php

namespace App\Services;

use App\Models\SecurityEvent;
use App\Support\ClientOrigin;
use Illuminate\Http\Request;

class SecurityEventLogger
{
    public function record(Request $request, string $type, ?string $detail = null): SecurityEvent
    {
        $origin = ClientOrigin::fromRequest($request);

        return SecurityEvent::create([
            'ip' => $origin->ip,
            'country' => $origin->country,
            'type' => $type,
            'method' => $request->method(),
            'path' => $request->getRequestUri(),
            'user_agent' => $request->userAgent(),
            'detail' => $detail,
        ]);
    }
}
