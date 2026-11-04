<?php

namespace App\Support;

use Illuminate\Http\Request;

final class ClientOrigin
{
    public const CLOUDFLARE_SECRET_HEADER = 'X-Origin-Secret';

    public function __construct(
        public readonly string $ip,
        public readonly ?string $country,
    ) {}

    public static function fromRequest(Request $request): self
    {
        if (self::cameThroughCloudflare($request)) {
            return new self((string) $request->header('CF-Connecting-IP'), $request->header('CF-IPCountry'));
        }

        return new self(self::lastForwardedIp($request), null);
    }

    private static function cameThroughCloudflare(Request $request): bool
    {
        $secret = (string) config('services.cloudflare.origin_secret');

        return $secret !== ''
            && hash_equals($secret, (string) $request->header(self::CLOUDFLARE_SECRET_HEADER))
            && $request->headers->has('CF-Connecting-IP');
    }

    private static function lastForwardedIp(Request $request): string
    {
        $forwarded = array_filter(array_map('trim', explode(',', (string) $request->header('X-Forwarded-For'))));

        return $forwarded === [] ? (string) $request->server('REMOTE_ADDR') : end($forwarded);
    }
}
