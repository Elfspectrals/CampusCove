<?php

namespace App\Services;

use App\Models\IpBan;
use App\Models\IpReputation;
use App\Models\SecurityEvent;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class IpBanService
{
    public const SCORE_WINDOW_HOURS = 24;

    public const MAX_SCORE = 100;

    public const SUSPECT_SCORE = 50;

    public const AUTO_BAN_SCORE = 80;

    public const AUTO_BAN_HOURS = 24;

    public const SCORE_CAP_WITHOUT_BOT_SIGNAL = self::AUTO_BAN_SCORE - 1;

    public const REPUTATION_WEIGHT_PERCENT = 30;

    public const STATUS_BANNED = 'banned';

    public const STATUS_SUSPECT = 'suspect';

    public const STATUS_NORMAL = 'normal';

    public const WEIGHTS = [
        SecurityEvent::TYPE_LOGIN_FAILED => 4,
        SecurityEvent::TYPE_RATE_LIMITED => 10,
        SecurityEvent::TYPE_PROBE_PATH => 20,
        SecurityEvent::TYPE_INJECTION => 25,
        SecurityEvent::TYPE_SCANNER_AGENT => 50,
    ];

    public const BOT_SIGNALS = [
        SecurityEvent::TYPE_PROBE_PATH,
        SecurityEvent::TYPE_INJECTION,
        SecurityEvent::TYPE_SCANNER_AGENT,
    ];

    public function __construct(
        private readonly RealtimeNotifier $realtime,
        private readonly AbuseIpdbService $abuseIpdb,
    ) {}

    public function score(string $ip): int
    {
        return $this->scores([$ip])[$ip] ?? $this->scoreFrom(collect(), $this->reputationPoints($ip));
    }

    /**
     * @param  list<string>|null  $ips
     * @return array<string, int>
     */
    public function scores(?array $ips = null): array
    {
        $rows = SecurityEvent::query()
            ->where('created_at', '>', now()->subHours(self::SCORE_WINDOW_HOURS))
            ->when($ips !== null, fn ($query) => $query->whereIn('ip', $ips))
            ->groupBy('ip', 'type')
            ->select('ip', 'type', DB::raw('COUNT(*) AS events'))
            ->get();

        $confidences = IpReputation::whereIn('ip', $rows->pluck('ip')->unique())->pluck('abuse_confidence', 'ip');

        return $rows->groupBy('ip')
            ->map(fn (Collection $byType, string $ip) => $this->scoreFrom(
                $byType->pluck('events', 'type'),
                $this->pointsFor($confidences[$ip] ?? null),
            ))
            ->all();
    }

    public function statusFor(int $score, bool $banned): string
    {
        return match (true) {
            $banned => self::STATUS_BANNED,
            $score >= self::SUSPECT_SCORE => self::STATUS_SUSPECT,
            default => self::STATUS_NORMAL,
        };
    }

    public function isBanned(string $ip): bool
    {
        return IpBan::active()->where('ip', $ip)->exists();
    }

    public function banIfOverThreshold(string $ip): void
    {
        if ($this->isBanned($ip)) {
            return;
        }

        $score = $this->score($ip);
        if ($score < self::AUTO_BAN_SCORE) {
            return;
        }

        IpBan::create([
            'ip' => $ip,
            'reason' => IpBan::REASON_AUTO,
            'score' => $score,
            'expires_at' => now()->addHours(self::AUTO_BAN_HOURS),
        ]);
        $this->realtime->ipBanned($ip);
        $this->abuseIpdb->reportBan($ip);
    }

    public function banManually(string $ip, bool $permanent, int $adminId, bool $report): IpBan
    {
        $ban = DB::transaction(function () use ($ip, $permanent, $adminId) {
            $this->unban($ip, $adminId);

            return IpBan::create([
                'ip' => $ip,
                'reason' => IpBan::REASON_MANUAL,
                'score' => $this->score($ip),
                'banned_by_account_id' => $adminId,
                'expires_at' => $permanent ? null : now()->addHours(self::AUTO_BAN_HOURS),
            ]);
        });

        $this->realtime->ipBanned($ip);
        if ($report) {
            $this->abuseIpdb->reportBan($ip);
        }

        return $ban;
    }

    public function reputationPoints(string $ip): int
    {
        return $this->pointsFor(IpReputation::whereKey($ip)->value('abuse_confidence'));
    }

    public function unban(string $ip, ?int $adminId = null): int
    {
        return IpBan::active()->where('ip', $ip)->update([
            'lifted_at' => now(),
            'lifted_by_account_id' => $adminId,
        ]);
    }

    /** @param Collection<string, int> $countsByType */
    private function scoreFrom(Collection $countsByType, int $reputationPoints): int
    {
        $score = $reputationPoints;
        foreach ($countsByType as $type => $events) {
            $score += self::WEIGHTS[$type] * $events;
        }
        $score = min($score, self::MAX_SCORE);

        $hasBotSignal = $countsByType->keys()->intersect(self::BOT_SIGNALS)->isNotEmpty();

        return $hasBotSignal ? $score : min($score, self::SCORE_CAP_WITHOUT_BOT_SIGNAL);
    }

    private function pointsFor(?int $confidence): int
    {
        return $confidence === null ? 0 : intdiv($confidence * self::REPUTATION_WEIGHT_PERCENT, 100);
    }
}
