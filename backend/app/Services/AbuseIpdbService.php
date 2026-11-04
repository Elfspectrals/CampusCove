<?php

namespace App\Services;

use App\Models\IpReputation;
use App\Models\SecurityEvent;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AbuseIpdbService
{
    public const API_URL = 'https://api.abuseipdb.com/api/v2';

    public const REFRESH_HOURS = 24;

    public const REPORTED_PROBE_PATHS = 3;

    public const CATEGORY_SQL_INJECTION = 16;

    public const CATEGORY_BRUTE_FORCE = 18;

    public const CATEGORY_BAD_WEB_BOT = 19;

    public const CATEGORY_WEB_APP_ATTACK = 21;

    private const SQL_INJECTION = '~union|select|information_schema|sleep|benchmark|\'~i';

    public function refreshReputation(string $ip): void
    {
        if (! $this->isEnabledFor($ip)) {
            return;
        }

        $known = IpReputation::find($ip);
        if ($known !== null && $known->checked_at->gt(now()->subHours(self::REFRESH_HOURS))) {
            return;
        }

        try {
            $data = $this->api()->get(self::API_URL.'/check', ['ipAddress' => $ip])->throw()->json('data');
        } catch (RequestException|ConnectionException $e) {
            Log::warning("abuseipdb check failed for {$ip}: ".$e->getMessage());

            return;
        }

        IpReputation::updateOrCreate(['ip' => $ip], [
            'abuse_confidence' => $data['abuseConfidenceScore'],
            'country' => $data['countryCode'],
            'isp' => $data['isp'],
            'usage_type' => $data['usageType'],
            'is_tor' => $data['isTor'],
            'total_reports' => $data['totalReports'],
            'checked_at' => now(),
        ]);
    }

    public function reportBan(string $ip): void
    {
        if (! $this->isEnabledFor($ip)) {
            return;
        }

        $events = SecurityEvent::query()
            ->where('ip', $ip)
            ->where('created_at', '>', now()->subHours(IpBanService::SCORE_WINDOW_HOURS))
            ->orderBy('id')
            ->get(['type', 'path', 'detail']);

        try {
            $this->api()->asForm()->post(self::API_URL.'/report', [
                'ip' => $ip,
                'categories' => implode(',', $this->categoriesFor($events)),
                'comment' => $this->commentFor($events),
            ])->throw();
        } catch (RequestException|ConnectionException $e) {
            Log::warning("abuseipdb report failed for {$ip}: ".$e->getMessage());
        }
    }

    /** @param Collection<int, SecurityEvent> $events */
    private function categoriesFor(Collection $events): array
    {
        $categories = [];
        foreach ($events as $event) {
            $categories = [...$categories, ...match ($event->type) {
                SecurityEvent::TYPE_LOGIN_FAILED => [self::CATEGORY_BRUTE_FORCE],
                SecurityEvent::TYPE_PROBE_PATH, SecurityEvent::TYPE_SCANNER_AGENT => [self::CATEGORY_WEB_APP_ATTACK, self::CATEGORY_BAD_WEB_BOT],
                SecurityEvent::TYPE_INJECTION => preg_match(self::SQL_INJECTION, (string) $event->detail)
                    ? [self::CATEGORY_WEB_APP_ATTACK, self::CATEGORY_SQL_INJECTION]
                    : [self::CATEGORY_WEB_APP_ATTACK],
                SecurityEvent::TYPE_RATE_LIMITED => [],
            }];
        }
        $categories = array_values(array_unique($categories));
        sort($categories);

        return $categories;
    }

    /** @param Collection<int, SecurityEvent> $events */
    private function commentFor(Collection $events): string
    {
        $countsByType = $events->countBy('type');
        $counts = collect(IpBanService::WEIGHTS)
            ->keys()
            ->filter(fn (string $type) => $countsByType->has($type))
            ->map(fn (string $type) => $countsByType[$type].' '.$type)
            ->implode(', ');

        $probePaths = $events
            ->where('type', SecurityEvent::TYPE_PROBE_PATH)
            ->map(fn (SecurityEvent $event) => strtok($event->path, '?'))
            ->unique()
            ->take(self::REPORTED_PROBE_PATHS)
            ->implode(', ');

        $hours = IpBanService::SCORE_WINDOW_HOURS;

        return $probePaths === ''
            ? "CampusCove: {$counts} in {$hours}h"
            : "CampusCove: {$counts} in {$hours}h ({$probePaths})";
    }

    private function isEnabledFor(string $ip): bool
    {
        return (string) config('services.abuseipdb.key') !== ''
            && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
    }

    private function api(): PendingRequest
    {
        return Http::withHeaders(['Key' => (string) config('services.abuseipdb.key')])
            ->acceptJson()
            ->timeout(5);
    }
}
