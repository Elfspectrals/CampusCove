<?php

namespace App\Http\Middleware;

use App\Models\SecurityEvent;
use App\Services\SecurityEventLogger;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class DetectSuspiciousRequests
{
    private const PROBE_SEGMENT = '~^(\.(?!well-known$).+|wp-.+|phpmyadmin.*|cgi-bin)$~';

    private const SCANNER_AGENT = '~sqlmap|nikto|nmap|masscan|zgrab|nuclei|gobuster|dirbuster|wpscan|acunetix|nessus|openvas|hydra|ffuf|feroxbuster~i';

    private const INJECTION = '~union\s+(all\s+)?select|information_schema|(sleep|benchmark)\s*\(|\'\s*or\s*\'?\d+\'?\s*=\s*\'?\d+|<script|javascript:|onerror\s*=|\.\./|/etc/passwd~i';

    public function __construct(private readonly SecurityEventLogger $logger) {}

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

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

        if ($response->getStatusCode() === Response::HTTP_TOO_MANY_REQUESTS) {
            $events[SecurityEvent::TYPE_RATE_LIMITED] = null;
        }

        return $events;
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
