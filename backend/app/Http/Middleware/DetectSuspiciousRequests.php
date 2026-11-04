<?php

namespace App\Http\Middleware;

use App\Models\SecurityEvent;
use App\Services\SecurityEventLogger;
use App\Support\ClientOrigin;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class DetectSuspiciousRequests
{
    private const PROBE_SEGMENT = '~^(\.(?!well-known$).+|wp-.+|phpmyadmin.*|cgi-bin)$~';

    private const SCANNER_AGENT = '~sqlmap|nikto|nmap|masscan|zgrab|nuclei|gobuster|dirbuster|wpscan|acunetix|nessus|openvas|hydra|ffuf|feroxbuster~i';

    // Files browsers ask for on their own: a 404 on these says nothing about the client.
    private const BROWSER_DEFAULT = '~^/(favicon\.ico|apple-touch-icon[\w.-]*\.png|robots\.txt|sitemap\.xml|browserconfig\.xml|site\.webmanifest|\.well-known/.*)$~';

    private const INJECTION = '~union\s+(all\s+)?select|information_schema|(sleep|benchmark)\s*\(|\'\s*or\s*\'?\d+\'?\s*=\s*\'?\d+|<script|javascript:|onerror\s*=|\.\./|/etc/passwd~i';

    public function __construct(private readonly SecurityEventLogger $logger) {}

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (ClientOrigin::fromRequest($request)->isRealtimeServer) {
            return $response;
        }

        foreach ($this->detect($request, $response) as $type => $detail) {
            $this->logger->record($request, $type, $detail);
        }

        return $response;
    }

    /** @return array<string, string|null> */
    private function detect(Request $request, Response $response): array
    {
        $events = [];

        $path = strtolower(rawurldecode($request->getPathInfo()));
        if ($this->isProbePath($path)) {
            $events[SecurityEvent::TYPE_PROBE_PATH] = null;
        }

        if (preg_match(self::SCANNER_AGENT, (string) $request->userAgent(), $agent)) {
            $events[SecurityEvent::TYPE_SCANNER_AGENT] = strtolower($agent[0]);
        }

        if (preg_match(self::INJECTION, urldecode($request->getRequestUri()), $injection)) {
            $events[SecurityEvent::TYPE_INJECTION] = $injection[0];
        }

        if ($events === [] && $this->isUnknownPath($request, $response, $path)) {
            $events[SecurityEvent::TYPE_NOT_FOUND] = null;
        }

        if ($response->getStatusCode() === Response::HTTP_TOO_MANY_REQUESTS) {
            $events[SecurityEvent::TYPE_RATE_LIMITED] = null;
        }

        return $events;
    }

    // A 404 with no matched route; a 404 from a real route (a missing model or asset) is the app's own business.
    private function isUnknownPath(Request $request, Response $response, string $path): bool
    {
        return $response->getStatusCode() === Response::HTTP_NOT_FOUND
            && $request->route() === null
            && ! preg_match(self::BROWSER_DEFAULT, $path);
    }

    private function isProbePath(string $path): bool
    {
        if (str_ends_with($path, '.php') && $path !== '/index.php') {
            return true;
        }

        foreach (explode('/', $path) as $segment) {
            if (preg_match(self::PROBE_SEGMENT, $segment)) {
                return true;
            }
        }

        return false;
    }
}
