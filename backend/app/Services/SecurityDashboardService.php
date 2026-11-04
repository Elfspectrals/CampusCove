<?php

namespace App\Services;

use App\Models\IpBan;
use App\Models\IpReputation;
use App\Models\SecurityEvent;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class SecurityDashboardService
{
    public const LIVE_MINUTES = 10;

    public const TOP_LIMIT = 5;

    public const HOURLY_BUCKETS = 24;

    public const EVENTS_PAGE_SIZE = 50;

    public function __construct(private readonly IpBanService $bans) {}

    public function overview(): array
    {
        $scores = $this->bans->scores();
        $bannedIps = IpBan::active()->pluck('ip')->unique()->flip();
        $statuses = collect($scores)->map(fn (int $score, string $ip) => $this->bans->statusFor($score, $bannedIps->has($ip)));

        $topIps = collect($scores)->sortDesc()->take(self::TOP_LIMIT);
        $countries = IpReputation::whereIn('ip', $topIps->keys())->pluck('country', 'ip');

        return [
            'generated_at' => now()->toIso8601String(),
            'live_ips' => $this->recent()->where('created_at', '>', now()->subMinutes(self::LIVE_MINUTES))->distinct()->count('ip'),
            'events_24h' => $this->recent()->count(),
            'login_failed_24h' => $this->recent()->where('type', SecurityEvent::TYPE_LOGIN_FAILED)->count(),
            'active_bans' => $bannedIps->count(),
            'suspect_ips' => $statuses->filter(fn (string $status) => $status === IpBanService::STATUS_SUSPECT)->count(),
            'by_type_24h' => $this->byType(),
            'hourly' => $this->hourly(),
            'top_ips' => $topIps->map(fn (int $score, string $ip) => [
                'ip' => $ip,
                'score' => $score,
                'status' => $statuses[$ip],
                'country' => $this->recent()->where('ip', $ip)->whereNotNull('country')->value('country') ?? $countries[$ip] ?? null,
            ])->values()->all(),
            'top_countries' => $this->topCountries(),
            'top_paths' => $this->topPaths(),
        ];
    }

    public function events(?string $ip, ?string $type, ?int $beforeId): array
    {
        $events = SecurityEvent::query()
            ->leftJoin('ip_reputations', 'ip_reputations.ip', '=', 'security_events.ip')
            ->when($ip !== null, fn (Builder $query) => $query->where('security_events.ip', $ip))
            ->when($type !== null, fn (Builder $query) => $query->where('security_events.type', $type))
            ->when($beforeId !== null, fn (Builder $query) => $query->where('security_events.id', '<', $beforeId))
            ->orderByDesc('security_events.id')
            ->limit(self::EVENTS_PAGE_SIZE)
            ->get(['security_events.*', DB::raw('COALESCE(security_events.country, ip_reputations.country) AS resolved_country')]);

        return [
            'events' => $events->map(fn (SecurityEvent $event) => $this->eventPayload($event))->all(),
            'next_before_id' => $events->count() === self::EVENTS_PAGE_SIZE ? $events->last()->id : null,
        ];
    }

    public function ip(string $ip): array
    {
        $score = $this->bans->score($ip);
        $reputation = IpReputation::find($ip);

        return [
            'ip' => $ip,
            'score' => $score,
            'status' => $this->bans->statusFor($score, $this->bans->isBanned($ip)),
            'reputation' => $reputation === null ? null : [
                'abuse_confidence' => $reputation->abuse_confidence,
                'country' => $reputation->country,
                'isp' => $reputation->isp,
                'usage_type' => $reputation->usage_type,
                'is_tor' => $reputation->is_tor,
                'total_reports' => $reputation->total_reports,
                'checked_at' => $reputation->checked_at->toIso8601String(),
            ],
            'events' => $this->events($ip, null, null),
            'bans' => IpBan::where('ip', $ip)->orderByDesc('id')->get()
                ->map(fn (IpBan $ban) => $this->banPayload($ban))->all(),
        ];
    }

    public function activeBans(): array
    {
        return IpBan::active()->orderByDesc('id')->get()->map(fn (IpBan $ban) => $this->banPayload($ban))->all();
    }

    public function banPayload(IpBan $ban): array
    {
        return [
            'id' => $ban->id,
            'ip' => $ban->ip,
            'reason' => $ban->reason,
            'score' => $ban->score,
            'banned_by_account_id' => $ban->banned_by_account_id,
            'created_at' => $ban->created_at->toIso8601String(),
            'expires_at' => $ban->expires_at?->toIso8601String(),
            'lifted_at' => $ban->lifted_at?->toIso8601String(),
            'lifted_by_account_id' => $ban->lifted_by_account_id,
        ];
    }

    private function recent(): Builder
    {
        return SecurityEvent::query()->where('created_at', '>', now()->subHours(IpBanService::SCORE_WINDOW_HOURS));
    }

    /** @return array<string, int> */
    private function byType(): array
    {
        $counts = $this->recent()->groupBy('type')->select('type', DB::raw('COUNT(*) AS events'))->pluck('events', 'type');

        return collect(IpBanService::WEIGHTS)->map(fn (int $weight, string $type) => (int) ($counts[$type] ?? 0))->all();
    }

    /** @return list<array{hour: string, events: int}> */
    private function hourly(): array
    {
        $firstHour = now()->utc()->startOfHour()->subHours(self::HOURLY_BUCKETS - 1);
        $counts = SecurityEvent::query()
            ->where('created_at', '>=', $firstHour)
            ->groupBy('hour')
            ->select(DB::raw("date_trunc('hour', created_at AT TIME ZONE 'UTC') AS hour"), DB::raw('COUNT(*) AS events'))
            ->pluck('events', 'hour')
            ->mapWithKeys(fn (int $events, string $hour) => [substr($hour, 0, 13) => $events]);

        return collect(range(0, self::HOURLY_BUCKETS - 1))->map(function (int $offset) use ($firstHour, $counts) {
            $hour = $firstHour->copy()->addHours($offset);

            return ['hour' => $hour->toIso8601String(), 'events' => (int) ($counts[$hour->format('Y-m-d H')] ?? 0)];
        })->all();
    }

    /** @return list<array{country: string|null, events: int}> */
    private function topCountries(): array
    {
        return $this->recent()
            ->leftJoin('ip_reputations', 'ip_reputations.ip', '=', 'security_events.ip')
            ->groupBy('resolved_country')
            ->orderByDesc('events')
            ->select(DB::raw('COALESCE(security_events.country, ip_reputations.country) AS resolved_country'), DB::raw('COUNT(*) AS events'))
            ->get()
            ->map(fn ($row) => ['country' => $row->resolved_country, 'events' => (int) $row->events])
            ->all();
    }

    /** @return list<array{path: string, events: int}> */
    private function topPaths(): array
    {
        return $this->recent()
            ->where('type', SecurityEvent::TYPE_PROBE_PATH)
            ->groupBy('probed_path')
            ->orderByDesc('events')
            ->orderBy('probed_path')
            ->limit(self::TOP_LIMIT)
            ->select(DB::raw("split_part(path, '?', 1) AS probed_path"), DB::raw('COUNT(*) AS events'))
            ->get()
            ->map(fn ($row) => ['path' => $row->probed_path, 'events' => (int) $row->events])
            ->all();
    }

    private function eventPayload(SecurityEvent $event): array
    {
        return [
            'id' => $event->id,
            'ip' => $event->ip,
            'country' => $event->resolved_country ?? $event->country,
            'type' => $event->type,
            'method' => $event->method,
            'path' => $event->path,
            'user_agent' => $event->user_agent,
            'detail' => $event->detail,
            'created_at' => $event->created_at->toIso8601String(),
        ];
    }
}
